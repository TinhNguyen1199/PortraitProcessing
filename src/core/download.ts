/** Tải một file blob về máy với tên cho trước. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/**
 * Tên file xuất: giữ nguyên phần tên gốc, thêm hậu tố cỡ ảnh.
 * Nhờ hậu tố này, xuất 3x4 rồi xuất tiếp 2x3 vào cùng thư mục không đè lên nhau.
 */
export function jpgName(original: string, slug?: string) {
  const base = original.replace(/\.[^.]+$/, '')
  return slug ? `${base}_${slug}.jpg` : `${base}.jpg`
}
