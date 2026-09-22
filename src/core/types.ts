export type PhotoStatus = 'queued' | 'working' | 'done' | 'failed'

/** Cờ cảnh báo — dùng để tự đẩy ảnh sang tab "Cần xem lại". */
export type Flag =
  | 'no-face'
  | 'multi-face'
  | 'tilt'
  | 'upscaled'
  | 'head-clipped'
  | 'body-clipped'
  | 'side-clipped'
  | 'mask-weak'

export const FLAG_LABEL: Record<Flag, string> = {
  'no-face': 'Không thấy khuôn mặt',
  'multi-face': 'Có nhiều khuôn mặt',
  tilt: 'Đầu nghiêng nhiều',
  upscaled: 'Ảnh gốc thiếu pixel',
  'head-clipped': 'Đỉnh đầu bị cắt trong ảnh gốc',
  'body-clipped': 'Thiếu vai phía dưới',
  'side-clipped': 'Thiếu thân hai bên',
  'mask-weak': 'Tách nền không chắc chắn',
}

export interface Pt {
  x: number
  y: number
}

export interface Landmarks {
  eyeL: Pt
  eyeR: Pt
  eyeC: Pt
  chin: Pt
  faceW: number
  /** radian, dương = đầu nghiêng sang phải trong ảnh */
  roll: number
  faceCount: number
}

/** Kết quả AI của 1 ảnh — cache lại để đổi thông số crop không phải chạy lại model. */
export interface Analysis {
  srcW: number
  srcH: number
  maskW: number
  maskH: number
  mask: Uint8Array
  lm: Landmarks | null
  /** toạ độ đỉnh đầu trong hệ pixel ảnh gốc, lấy từ mask */
  headTopY: number
  headClipped: boolean
  /** người có chạm vào từng mép ảnh gốc không — dùng để phân biệt cắt thật với báo động giả */
  edge: { top: boolean; bottom: boolean; left: boolean; right: boolean }
  /** tỉ lệ pixel thuộc về người */
  coverage: number
  /** độ "mềm" của mask: tỉ lệ pixel nằm giữa 0 và 1 */
  softness: number
  /** màu nền gốc ước lượng, dùng để khử ám màu viền tóc */
  bg: [number, number, number]
  msFace: number
  msSeg: number
}

export interface CropParams {
  outW: number
  outH: number
  /** chiều cao đầu (đỉnh tóc -> cằm) chiếm bao nhiêu phần khung */
  headRatio: number
  /** khoảng hở phía trên đỉnh đầu */
  topGap: number
  bgColor: string
  quality: number
  decontaminate: boolean
  straighten: boolean
}

export const DEFAULT_CROP: CropParams = {
  outW: 354, // 3cm @ 300dpi
  outH: 472, // 4cm @ 300dpi
  headRatio: 0.62,
  topGap: 0.09,
  bgColor: '#ffffff',
  quality: 0.92,
  decontaminate: true,
  straighten: true,
}

export interface ComposeResult {
  blob: Blob
  url: string
  flags: Flag[]
  /** vị trí đường mắt trong ảnh xuất (px) — dùng để đo độ đồng bộ cả lô */
  eyeY: number
  scale: number
  ms: number
}

export interface Photo {
  id: string
  file: File
  name: string
  thumbUrl: string
  status: PhotoStatus
  error?: string
  analysis?: Analysis
  result?: ComposeResult
  /** người dùng loại ảnh này khỏi kết quả xuất */
  excluded?: boolean
}
