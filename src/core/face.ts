import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { FACE_MODEL_URL, MEDIAPIPE_WASM } from './models'
import type { Landmarks, Pt } from './types'

// Chỉ số landmark của MediaPipe FaceMesh
const R_EYE_OUT = 33
const R_EYE_IN = 133
const L_EYE_IN = 362
const L_EYE_OUT = 263
const CHIN = 152
const CHEEK_R = 234
const CHEEK_L = 454

let landmarker: FaceLandmarker | null = null
let loading: Promise<FaceLandmarker> | null = null

/**
 * MediaPipe nạp WASM bằng classic script nên không chạy được trong module worker
 * ("ModuleFactory not set"). Nhận diện khuôn mặt vì thế đặt ở main thread —
 * chỉ ~20-40ms/ảnh nên không gây giật giao diện.
 */
export function initFace(): Promise<FaceLandmarker> {
  if (landmarker) return Promise.resolve(landmarker)
  if (loading) return loading
  loading = (async () => {
    const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM)
    landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'CPU' },
      runningMode: 'IMAGE',
      numFaces: 5,
    })
    return landmarker
  })()
  return loading
}

function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export async function detectFace(
  bmp: ImageBitmap,
): Promise<{ lm: Landmarks | null; ms: number }> {
  const fl = await initFace()
  const t0 = performance.now()
  const res = fl.detect(bmp)
  const ms = performance.now() - t0

  const faces = res.faceLandmarks
  if (!faces || faces.length === 0) return { lm: null, ms }

  // Nhiều mặt -> chọn mặt to nhất, ưu tiên gần tâm ảnh
  let best = 0
  let bestScore = -Infinity
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i]
    const w = Math.abs(f[CHEEK_L].x - f[CHEEK_R].x)
    const cx = (f[CHEEK_L].x + f[CHEEK_R].x) / 2
    const score = w - Math.abs(cx - 0.5) * 0.35
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }

  const f = faces[best]
  const px = (i: number): Pt => ({ x: f[i].x * bmp.width, y: f[i].y * bmp.height })

  const eyeR = mid(px(R_EYE_OUT), px(R_EYE_IN))
  const eyeL = mid(px(L_EYE_IN), px(L_EYE_OUT))
  const cr = px(CHEEK_R)
  const cl = px(CHEEK_L)

  return {
    lm: {
      eyeL,
      eyeR,
      eyeC: mid(eyeR, eyeL),
      chin: px(CHIN),
      faceW: Math.hypot(cl.x - cr.x, cl.y - cr.y),
      roll: Math.atan2(eyeL.y - eyeR.y, eyeL.x - eyeR.x),
      faceCount: faces.length,
    },
    ms,
  }
}
