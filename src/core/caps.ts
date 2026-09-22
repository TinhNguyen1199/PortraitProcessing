import type { ModelKey } from './models'

export interface Caps {
  webgpu: boolean
  cores: number
  memGB: number
  isolated: boolean
  /** A = máy mạnh, B = máy tiết kiệm */
  tier: 'A' | 'B'
  suggestModel: ModelKey
  suggestDevice: 'webgpu' | 'wasm'
}

/**
 * Mặc định chạy WASM chứ không phải WebGPU.
 * Lý do: onnxruntime-web trên WebGPU cho kết quả SAI ở một số GPU — BiRefNet
 * báo lỗi thẳng ("too many storage buffers"), còn MODNet thì âm thầm trả mask
 * hỏng, nguy hiểm hơn nhiều vì không có dấu hiệu gì. WASM chậm hơn ~4 lần
 * nhưng đúng ở mọi máy. Người dùng vẫn bật WebGPU được, và có bộ dò chất
 * lượng tự động cảnh báo nếu mask bị hỏng (xem store.run).
 */
export async function detectCaps(): Promise<Caps> {
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown }
  const cores = nav.hardwareConcurrency || 4
  const memGB = nav.deviceMemory || 4

  let webgpu = false
  if (nav.gpu) {
    try {
      const adapter = await (nav.gpu as GPU).requestAdapter()
      webgpu = !!adapter
    } catch {
      webgpu = false
    }
  }

  const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
  const tier: 'A' | 'B' = cores >= 8 && memGB >= 8 ? 'A' : 'B'

  return {
    webgpu,
    cores,
    memGB,
    isolated,
    tier,
    suggestModel: tier === 'A' ? 'modnet' : 'modnet-q8',
    suggestDevice: 'wasm',
  }
}
