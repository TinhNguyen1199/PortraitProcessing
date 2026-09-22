import {
  AutoModel,
  AutoProcessor,
  RawImage,
  env,
  type PreTrainedModel,
  type Processor,
} from '@huggingface/transformers'
import { MODELS, type ModelKey } from './models'

env.allowLocalModels = false

/** Độ phân giải lưu mask — đủ nét cho ảnh xuất 354x472, tiết kiệm RAM. */
const MASK_MAX = 768

let segModel: PreTrainedModel | null = null
let segProc: Processor | null = null
let segInputName = 'input'
let loadedKey = ''

async function initSeg(modelKey: ModelKey, device: 'webgpu' | 'wasm') {
  const key = modelKey + ':' + device
  if (loadedKey === key && segModel) return
  const spec = MODELS[modelKey]

  if (device === 'wasm') {
    const iso = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
    const wasmCfg = env.backends.onnx.wasm as { numThreads?: number } | undefined
    if (wasmCfg) {
      wasmCfg.numThreads = iso ? Math.min(4, navigator.hardwareConcurrency || 2) : 1
    }
  }

  segProc = await AutoProcessor.from_pretrained(spec.id)
  segModel = await AutoModel.from_pretrained(spec.id, {
    dtype: spec.dtype[device],
    device,
  })

  const sessions = (
    segModel as unknown as { sessions?: Record<string, { inputNames?: string[] }> }
  ).sessions
  const names = sessions?.model?.inputNames
  segInputName = names && names.length ? names[0] : 'input'
  loadedKey = key
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x))
}

interface SegOut {
  mask: Uint8Array
  maskW: number
  maskH: number
  srcW: number
  srcH: number
}

async function segment(file: File): Promise<SegOut> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const srcW = bmp.width
  const srcH = bmp.height
  const k = Math.min(1, MASK_MAX / Math.max(srcW, srcH))
  const maskW = Math.max(1, Math.round(srcW * k))
  const maskH = Math.max(1, Math.round(srcH * k))

  const c = new OffscreenCanvas(srcW, srcH)
  const cx = c.getContext('2d', { willReadFrequently: true })!
  cx.drawImage(bmp, 0, 0)
  bmp.close()
  const src = cx.getImageData(0, 0, srcW, srcH)
  const raw = new RawImage(new Uint8ClampedArray(src.data), srcW, srcH, 4).rgb()

  const inputs = await segProc!(raw)
  const out = await segModel!({ [segInputName]: inputs.pixel_values })

  // Lấy tensor đầu ra đầu tiên có dims + data
  let tensor: { dims: number[]; data: Float32Array } | null = null
  for (const v of Object.values(out as Record<string, unknown>)) {
    const t = v as { dims?: number[]; data?: Float32Array }
    if (t && t.dims && t.data) {
      tensor = t as { dims: number[]; data: Float32Array }
      break
    }
    if (Array.isArray(v) && v.length) {
      const f = v[0] as { dims?: number[]; data?: Float32Array }
      if (f && f.dims && f.data) {
        tensor = f as { dims: number[]; data: Float32Array }
        break
      }
    }
  }
  if (!tensor) throw new Error('Model không trả về tensor mask hợp lệ')

  const d = tensor.dims
  const h = d[d.length - 2]
  const w = d[d.length - 1]
  const data = tensor.data

  // Một số bản export chưa có sigmoid ở cuối — tự dò rồi bù.
  let lo = Infinity
  let hi = -Infinity
  const step = Math.max(1, Math.floor(data.length / 4096))
  for (let i = 0; i < data.length; i += step) {
    if (data[i] < lo) lo = data[i]
    if (data[i] > hi) hi = data[i]
  }
  const needSigmoid = hi > 1.2 || lo < -0.2

  const gray = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    let v = needSigmoid ? sigmoid(data[i]) : data[i]
    v = v < 0 ? 0 : v > 1 ? 1 : v
    const g = Math.round(v * 255)
    gray[i * 4] = g
    gray[i * 4 + 1] = g
    gray[i * 4 + 2] = g
    gray[i * 4 + 3] = 255
  }

  const mc = new OffscreenCanvas(w, h)
  mc.getContext('2d')!.putImageData(new ImageData(gray, w, h), 0, 0)

  const rc = new OffscreenCanvas(maskW, maskH)
  const rcx = rc.getContext('2d', { willReadFrequently: true })!
  rcx.imageSmoothingEnabled = true
  rcx.imageSmoothingQuality = 'high'
  rcx.drawImage(mc, 0, 0, maskW, maskH)
  const rd = rcx.getImageData(0, 0, maskW, maskH).data

  const mask = new Uint8Array(maskW * maskH)
  for (let i = 0; i < maskW * maskH; i++) mask[i] = rd[i * 4]
  return { mask, maskW, maskH, srcW, srcH }
}

type InMsg =
  | { type: 'init'; model: ModelKey; device: 'webgpu' | 'wasm' }
  | { type: 'segment'; id: string; file: File; model: ModelKey; device: 'webgpu' | 'wasm' }

// tsconfig dùng lib DOM nên `self` bị suy ra là Window; ép về kiểu worker.
const ctx = self as unknown as {
  postMessage: (m: unknown, transfer?: Transferable[]) => void
  onmessage: ((e: MessageEvent<InMsg>) => void) | null
}

ctx.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data
  try {
    if (msg.type === 'init') {
      const t0 = performance.now()
      await initSeg(msg.model, msg.device)
      ctx.postMessage({ type: 'ready', ms: performance.now() - t0 })
      return
    }
    if (msg.type === 'segment') {
      await initSeg(msg.model, msg.device)
      const t0 = performance.now()
      const r = await segment(msg.file)
      ctx.postMessage({ type: 'segmented', id: msg.id, ...r, ms: performance.now() - t0 }, [
        r.mask.buffer as ArrayBuffer,
      ])
    }
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      id: (msg as { id?: string }).id,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

export {}
