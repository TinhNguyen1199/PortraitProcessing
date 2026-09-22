import type { Analysis, ComposeResult, CropParams, Flag } from './types'

const TILT_LIMIT = (8 * Math.PI) / 180

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/**
 * Ghép người lên nền mới ở độ phân giải gốc.
 *
 * Toán khử ám màu viền tóc:
 *   Ảnh gốc ở vùng viền:  C = a*F + (1-a)*BG
 *   Ta muốn:              O = a*F + (1-a)*TARGET
 *   Trừ hai vế:           O = C + (1-a)*(TARGET - BG)
 * Nhờ vậy sợi tóc bán trong suốt không còn ám màu nền cũ (xanh bảng).
 */
function compositeFull(
  bmp: ImageBitmap,
  a: Analysis,
  target: [number, number, number],
  decontaminate: boolean,
): OffscreenCanvas {
  const { srcW, srcH } = a

  const srcCanvas = new OffscreenCanvas(srcW, srcH)
  const sctx = srcCanvas.getContext('2d', { willReadFrequently: true })!
  sctx.drawImage(bmp, 0, 0)
  const img = sctx.getImageData(0, 0, srcW, srcH)
  const p = img.data

  // mask -> kích thước gốc
  const mCanvas = new OffscreenCanvas(a.maskW, a.maskH)
  const mctx = mCanvas.getContext('2d', { willReadFrequently: true })!
  const mImg = mctx.createImageData(a.maskW, a.maskH)
  for (let i = 0; i < a.mask.length; i++) {
    const v = a.mask[i]
    mImg.data[i * 4] = v
    mImg.data[i * 4 + 1] = v
    mImg.data[i * 4 + 2] = v
    mImg.data[i * 4 + 3] = 255
  }
  mctx.putImageData(mImg, 0, 0)

  const upCanvas = new OffscreenCanvas(srcW, srcH)
  const uctx = upCanvas.getContext('2d', { willReadFrequently: true })!
  uctx.imageSmoothingEnabled = true
  uctx.imageSmoothingQuality = 'high'
  // Làm mềm viền ~0.6px để hết răng cưa do phóng mask lên
  uctx.filter = 'blur(0.6px)'
  uctx.drawImage(mCanvas, 0, 0, srcW, srcH)
  uctx.filter = 'none'
  const up = uctx.getImageData(0, 0, srcW, srcH).data

  const [tr, tg, tb] = target
  const [br, bg, bb] = a.bg
  // Ép chặt hai đầu để hết quầng mờ, nhưng vẫn chừa dải mềm cho tóc
  const LO = 0.04
  const HI = 0.96
  const inv = 1 / (HI - LO)

  for (let i = 0, q = 0; i < p.length; i += 4, q += 4) {
    let al = up[q] / 255
    al = (al - LO) * inv
    al = al < 0 ? 0 : al > 1 ? 1 : al

    if (al >= 0.999) continue

    if (al <= 0.001) {
      p[i] = tr
      p[i + 1] = tg
      p[i + 2] = tb
      continue
    }

    const k = 1 - al
    if (decontaminate) {
      p[i] = clamp8(p[i] + k * (tr - br))
      p[i + 1] = clamp8(p[i + 1] + k * (tg - bg))
      p[i + 2] = clamp8(p[i + 2] + k * (tb - bb))
    } else {
      p[i] = clamp8(al * p[i] + k * tr)
      p[i + 1] = clamp8(al * p[i + 1] + k * tg)
      p[i + 2] = clamp8(al * p[i + 2] + k * tb)
    }
  }

  sctx.putImageData(img, 0, 0)
  return srcCanvas
}

function clamp8(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

export async function compose(
  file: File,
  a: Analysis,
  cp: CropParams,
): Promise<ComposeResult> {
  const t0 = performance.now()
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const target = hexToRgb(cp.bgColor)
  const full = compositeFull(bmp, a, target, cp.decontaminate)
  bmp.close()

  const flags: Flag[] = []
  const { outW, outH } = cp

  // --- Tính khung cắt ---
  let anchorX: number
  let anchorY: number
  let scale: number
  let eyeY: number
  let roll = 0

  if (a.lm) {
    const headH = Math.max(1, a.lm.chin.y - a.headTopY)
    scale = (outH * cp.headRatio) / headH
    roll = cp.straighten ? a.lm.roll : 0
    anchorX = a.lm.eyeC.x
    anchorY = a.lm.eyeC.y
    eyeY = outH * cp.topGap + (a.lm.eyeC.y - a.headTopY) * scale

    if (a.lm.faceCount > 1) flags.push('multi-face')
    if (Math.abs(a.lm.roll) > TILT_LIMIT) flags.push('tilt')
  } else {
    // Không thấy mặt: cắt giữa theo tỉ lệ, đánh cờ để người dùng xử lý tay
    flags.push('no-face')
    scale = outH / a.srcH
    anchorX = a.srcW / 2
    anchorY = a.srcH / 2
    eyeY = outH * 0.42
  }

  if (a.headClipped) flags.push('head-clipped')
  if (scale > 1.02) flags.push('upscaled')
  if (a.coverage < 0.05 || a.coverage > 0.92 || a.softness > 0.06) flags.push('mask-weak')

  // Khung cắt vượt ra ngoài ảnh gốc chỉ là lỗi khi NGƯỜI còn kéo dài tiếp ra đó.
  // Nếu phần thiếu vốn là nền thì nó được thay bằng nền trắng — kết quả không sai.
  const srcBottom = anchorY + (outH - eyeY) / scale
  const srcLeft = anchorX - outW / 2 / scale
  const srcRight = anchorX + outW / 2 / scale
  if (srcBottom > a.srcH + 2 && a.edge.bottom) flags.push('body-clipped')
  if ((srcLeft < -2 && a.edge.left) || (srcRight > a.srcW + 2 && a.edge.right)) {
    flags.push('side-clipped')
  }

  // --- Vẽ ra khung xuất ---
  const out = new OffscreenCanvas(outW, outH)
  const octx = out.getContext('2d')!
  octx.fillStyle = cp.bgColor
  octx.fillRect(0, 0, outW, outH)
  octx.imageSmoothingEnabled = true
  octx.imageSmoothingQuality = 'high'

  octx.save()
  octx.translate(outW / 2, eyeY)
  octx.rotate(-roll)
  octx.scale(scale, scale)
  octx.translate(-anchorX, -anchorY)
  octx.drawImage(full, 0, 0)
  octx.restore()

  const blob = await out.convertToBlob({ type: 'image/jpeg', quality: cp.quality })
  return {
    blob,
    url: URL.createObjectURL(blob),
    flags,
    eyeY,
    scale,
    ms: performance.now() - t0,
  }
}
