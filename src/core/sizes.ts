/** Ảnh in ở 300dpi — đủ nét cho mọi cỡ ảnh thẻ. */
export const DPI = 300

export type SizeGroup = 'vn' | 'intl' | 'custom'

export interface SizePreset {
  id: string
  label: string
  note: string
  group: SizeGroup
  wCm: number
  hCm: number
  /** chiều cao đầu (đỉnh tóc -> cằm) chiếm bao nhiêu phần khung */
  headRatio: number
  /** khoảng hở phía trên đỉnh đầu */
  topGap: number
  /** hậu tố gắn vào tên file xuất ra */
  slug: string
}

export const GROUP_LABEL: Record<SizeGroup, string> = {
  vn: 'Ảnh thẻ hành chính',
  intl: 'Hộ chiếu / quốc tế',
  custom: 'Của bạn',
}

/**
 * Cỡ đầu của hai preset quốc tế bám chuẩn ICAO: đầu chiếm 70-80% chiều cao ảnh
 * (visa Mỹ nới hơn, 50-69%, nên để 60%). Ba preset hành chính VN không có quy
 * định bằng số nên dùng 62% — con số đã nghiệm thu trên ảnh thật.
 */
export const BUILTIN_SIZES: SizePreset[] = [
  {
    id: '2x3',
    label: '2×3 cm',
    note: 'Sổ liên lạc, học bạ',
    group: 'vn',
    wCm: 2,
    hCm: 3,
    headRatio: 0.62,
    topGap: 0.09,
    slug: '2x3',
  },
  {
    id: '3x4',
    label: '3×4 cm',
    note: 'Phổ biến nhất — hồ sơ, học bạ',
    group: 'vn',
    wCm: 3,
    hCm: 4,
    headRatio: 0.62,
    topGap: 0.09,
    slug: '3x4',
  },
  {
    id: '4x6',
    label: '4×6 cm',
    note: 'Sơ yếu lý lịch, hồ sơ xin việc',
    group: 'vn',
    wCm: 4,
    hCm: 6,
    headRatio: 0.6,
    topGap: 0.1,
    slug: '4x6',
  },
  {
    id: '35x45',
    label: '3,5×4,5 cm',
    note: 'Hộ chiếu VN, visa Schengen (ICAO)',
    group: 'intl',
    wCm: 3.5,
    hCm: 4.5,
    headRatio: 0.75,
    topGap: 0.07,
    slug: '3.5x4.5',
  },
  {
    id: '5x5',
    label: '5×5 cm (2×2 in)',
    note: 'Visa Mỹ',
    group: 'intl',
    wCm: 5,
    hCm: 5,
    headRatio: 0.6,
    topGap: 0.12,
    slug: '5x5',
  },
]

export const DEFAULT_SIZE_ID = '3x4'

export function cmToPx(cm: number) {
  return Math.round((cm / 2.54) * DPI)
}

export function sizePx(p: SizePreset) {
  return { w: cmToPx(p.wCm), h: cmToPx(p.hCm) }
}

function cleanNum(n: number) {
  return String(Math.round(n * 10) / 10).replace(/\.0$/, '')
}

/** Tạo preset từ kích thước người dùng tự nhập. */
export function makeCustomSize(label: string, wCm: number, hCm: number): SizePreset {
  const slug = (cleanNum(wCm) + 'x' + cleanNum(hCm)).replace(/[^\w.-]/g, '')
  return {
    id: 'c' + Date.now().toString(36),
    label: label.trim() || `${cleanNum(wCm)}×${cleanNum(hCm)} cm`,
    note: `${cleanNum(wCm)}×${cleanNum(hCm)} cm · ${cmToPx(wCm)}×${cmToPx(hCm)}px`,
    group: 'custom',
    wCm,
    hCm,
    headRatio: 0.62,
    topGap: 0.09,
    slug,
  }
}
