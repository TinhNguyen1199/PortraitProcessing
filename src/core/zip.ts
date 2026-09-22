import { zip } from 'fflate'

import { jpgName } from './download'

export async function downloadZip(
  items: Array<{ name: string; blob: Blob }>,
  zipName: string,
  slug?: string,
): Promise<void> {
  const files: Record<string, Uint8Array> = {}
  const used = new Set<string>()

  for (const it of items) {
    const base = jpgName(it.name, slug)
    let n = base
    let i = 2
    while (used.has(n)) n = base.replace(/\.jpg$/, '') + '_' + i++ + '.jpg'
    used.add(n)
    files[n] = new Uint8Array(await it.blob.arrayBuffer())
  }

  const data = await new Promise<Uint8Array>((resolve, reject) => {
    // level 0: JPEG đã nén rồi, deflate thêm chỉ tốn thời gian
    zip(files, { level: 0 }, (err, out) => (err ? reject(err) : resolve(out)))
  })

  const blob = new Blob([data as BlobPart], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = zipName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
