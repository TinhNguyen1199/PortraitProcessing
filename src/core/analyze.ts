import { engine } from './engine'
import { detectFace } from './face'
import type { ModelKey } from './models'
import type { Analysis, Landmarks } from './types'

/**
 * Tìm đỉnh đầu bằng mask chứ không bằng landmark:
 * MediaPipe dừng ở chân tóc, trong khi ảnh thẻ phải căn theo đỉnh tóc thật.
 * Chỉ quét dải ngang quanh khuôn mặt để không bị nhiễu bởi vật thể khác.
 */
function findHeadTop(
  mask: Uint8Array,
  maskW: number,
  maskH: number,
  lm: Landmarks | null,
  srcW: number,
  srcH: number,
): { y: number; clipped: boolean } {
  const sx = maskW / srcW
  let x0 = 0
  let x1 = maskW - 1
  if (lm) {
    const half = lm.faceW * 0.95 * sx
    x0 = Math.max(0, Math.round(lm.eyeC.x * sx - half))
    x1 = Math.min(maskW - 1, Math.round(lm.eyeC.x * sx + half))
  }
  const span = Math.max(1, x1 - x0 + 1)
  const need = Math.max(2, Math.round(span * 0.02))

  for (let y = 0; y < maskH; y++) {
    let n = 0
    const row = y * maskW
    for (let x = x0; x <= x1; x++) if (mask[row + x] > 128) n++
    if (n >= need) return { y: y / (maskH / srcH), clipped: y <= 1 }
  }
  return { y: 0, clipped: true }
}

/** Màu nền gốc, lấy từ vùng chắc chắn là nền — dùng để khử ám màu viền tóc. */
function estimateBg(
  bmp: ImageBitmap,
  mask: Uint8Array,
  maskW: number,
  maskH: number,
): [number, number, number] {
  const c = document.createElement('canvas')
  c.width = maskW
  c.height = maskH
  const cx = c.getContext('2d', { willReadFrequently: true })!
  cx.drawImage(bmp, 0, 0, maskW, maskH)
  const d = cx.getImageData(0, 0, maskW, maskH).data
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < maskW * maskH; i++) {
    if (mask[i] < 12) {
      r += d[i * 4]
      g += d[i * 4 + 1]
      b += d[i * 4 + 2]
      n++
    }
  }
  if (!n) return [255, 255, 255]
  return [r / n, g / n, b / n]
}

/** Người có chạm vào từng mép ảnh gốc không. */
function edgeTouch(mask: Uint8Array, w: number, h: number) {
  const T = 128
  let top = false
  let bottom = false
  let left = false
  let right = false
  for (let x = 0; x < w; x++) {
    if (mask[x] > T) top = true
    if (mask[(h - 1) * w + x] > T) bottom = true
  }
  for (let y = 0; y < h; y++) {
    if (mask[y * w] > T) left = true
    if (mask[y * w + w - 1] > T) right = true
  }
  return { top, bottom, left, right }
}

export async function analyzePhoto(
  file: File,
  model: ModelKey,
  device: 'webgpu' | 'wasm',
): Promise<Analysis> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const { lm, ms: msFace } = await detectFace(bmp)
  const seg = await engine.segment(file, model, device)

  const { mask, maskW, maskH } = seg
  const head = findHeadTop(mask, maskW, maskH, lm, seg.srcW, seg.srcH)

  let solid = 0
  let soft = 0
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > 128) solid++
    if (mask[i] > 24 && mask[i] < 232) soft++
  }

  const edge = edgeTouch(mask, maskW, maskH)
  const bg = estimateBg(bmp, mask, maskW, maskH)
  bmp.close()

  return {
    srcW: seg.srcW,
    srcH: seg.srcH,
    maskW,
    maskH,
    mask,
    lm,
    headTopY: head.y,
    headClipped: edge.top,
    edge,
    coverage: solid / mask.length,
    softness: soft / mask.length,
    bg,
    msFace,
    msSeg: seg.ms,
  }
}
