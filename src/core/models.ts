export type ModelKey = 'modnet' | 'modnet-q8' | 'birefnet-lite'
export type DeviceKey = 'auto' | 'webgpu' | 'wasm'

export interface ModelSpec {
  id: string
  label: string
  license: string
  note: string
  /** dtype theo từng backend */
  dtype: Record<'webgpu' | 'wasm', 'fp32' | 'fp16' | 'q8'>
  sizeMB: Record<'webgpu' | 'wasm', number>
}

export const MODELS: Record<ModelKey, ModelSpec> = {
  modnet: {
    id: 'Xenova/modnet',
    label: 'MODNet',
    license: 'Apache-2.0 (code)',
    note: 'Chuyên chân dung, giữ được sợi tóc. Cân bằng tốt nhất giữa chất lượng và tốc độ.',
    dtype: { webgpu: 'fp32', wasm: 'fp32' },
    sizeMB: { webgpu: 25, wasm: 25 },
  },
  'modnet-q8': {
    id: 'Xenova/modnet',
    label: 'MODNet (nén)',
    license: 'Apache-2.0 (code)',
    note: 'Bản nén 8-bit: tải nhẹ hơn 4 lần, chạy nhanh hơn, viền tóc kém mịn hơn chút.',
    dtype: { webgpu: 'q8', wasm: 'q8' },
    sizeMB: { webgpu: 7, wasm: 7 },
  },
  'birefnet-lite': {
    id: 'onnx-community/BiRefNet_lite-ONNX',
    label: 'BiRefNet-lite',
    license: 'MIT',
    note: 'Chất lượng cao nhất nhưng rất nặng, và hiện lỗi trên nhiều GPU. Chỉ dùng để đối chiếu.',
    dtype: { webgpu: 'fp16', wasm: 'fp32' },
    sizeMB: { webgpu: 114, wasm: 224 },
  },
}

export const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

export const MEDIAPIPE_WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
