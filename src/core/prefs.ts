import type { SizePreset } from './sizes'

const KEY = 'anhthe.prefs.v1'

export interface Prefs {
  sizeId: string
  /** kích thước người dùng tự nhập, giữ lại giữa các phiên */
  custom: SizePreset[]
  /** cỡ đầu / khoảng hở đã chỉnh tay, nhớ riêng cho từng cỡ ảnh */
  overrides: Record<string, { headRatio: number; topGap: number }>
  bgColor: string
  quality: number
}

export function loadPrefs(): Partial<Prefs> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Partial<Prefs>) : {}
  } catch {
    return {}
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // chế độ ẩn danh hoặc hết dung lượng — không sao, chỉ mất phần ghi nhớ
  }
}
