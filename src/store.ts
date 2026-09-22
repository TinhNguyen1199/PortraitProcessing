import { create } from 'zustand'
import { compose } from './core/compose'
import { analyzePhoto } from './core/analyze'
import { engine } from './core/engine'
import { initFace } from './core/face'
import type { Caps } from './core/caps'
import { detectCaps } from './core/caps'
import type { DeviceKey, ModelKey } from './core/models'
import { DEFAULT_CROP, type CropParams, type Photo } from './core/types'
import {
  BUILTIN_SIZES,
  DEFAULT_SIZE_ID,
  makeCustomSize,
  sizePx,
  type SizePreset,
} from './core/sizes'
import { loadPrefs, savePrefs } from './core/prefs'

let uid = 0
let toastSeq = 0
let toastTimer: number | undefined
let revokeTimer: number | undefined

/** Thời gian cửa sổ hoàn tác. */
const TOAST_MS = 8000

function makePhoto(file: File): Photo {
  return {
    id: 'p' + ++uid,
    file,
    name: file.name,
    thumbUrl: URL.createObjectURL(file),
    status: 'queued',
  }
}

export interface ToastBox {
  id: number
  message: string
  undo?: () => void
}

export interface ConfirmBox {
  title: string
  body: string
  okLabel: string
  danger?: boolean
  onOk: () => void
}

export interface Metrics {
  loadMs: number
  /** thời gian của lần chạy gần nhất */
  runMs: number
  /** số ảnh xử lý trong lần chạy gần nhất */
  runCount: number
  avgFace: number
  avgSeg: number
  avgCompose: number
  /** độ lệch chuẩn đường mắt, tính trên TOÀN BỘ ảnh đã xong */
  eyeSpread: number
}

interface State {
  photos: Photo[]
  caps: Caps | null
  model: ModelKey
  device: DeviceKey
  crop: CropParams
  running: boolean
  loadingModel: boolean
  modelError: string | null
  notice: string | null
  selectedId: string | null
  onlyReview: boolean
  showRuler: boolean
  cardSize: 's' | 'm' | 'l'
  showTech: boolean
  metrics: Metrics | null
  /** cỡ ảnh đang chọn */
  /** hộp xác nhận dùng chung cho các hành động không hoàn tác được */
  confirm: ConfirmBox | null
  toast: ToastBox | null
  /** ảnh đang được điều hướng bằng bàn phím (khác với ảnh đang mở cửa sổ chi tiết) */
  focusedId: string | null
  loupe: boolean
  sidebarOpen: boolean
  shortcutsOpen: boolean
  sizeId: string
  customSizes: SizePreset[]
  /** cỡ đầu / khoảng hở đã chỉnh tay, nhớ riêng cho từng cỡ ảnh */
  overrides: Record<string, { headRatio: number; topGap: number }>

  init: () => Promise<void>
  addFiles: (files: File[]) => void
  clear: () => void
  setModel: (m: ModelKey) => void
  setDevice: (d: DeviceKey) => void
  setCrop: (patch: Partial<CropParams>) => void
  select: (id: string | null) => void
  toggleReview: () => void
  toggleRuler: () => void
  setCardSize: (v: 's' | 'm' | 'l') => void
  askConfirm: (c: ConfirmBox) => void
  closeConfirm: () => void
  showToast: (message: string, undo?: () => void) => void
  hideToast: () => void
  visiblePhotos: () => Photo[]
  setFocus: (id: string | null) => void
  focusMove: (delta: number) => void
  toggleLoupe: () => void
  toggleSidebar: () => void
  toggleShortcuts: () => void
  allSizes: () => SizePreset[]
  currentSize: () => SizePreset
  setSize: (id: string) => void
  addCustomSize: (label: string, wCm: number, hCm: number) => void
  removeCustomSize: (id: string) => void
  toggleTech: () => void
  toggleExclude: (id: string) => void
  run: (force?: boolean) => Promise<void>
  recomposeAll: () => Promise<void>
  recomposeOne: (id: string) => Promise<void>
}

function effectiveDevice(caps: Caps | null, device: DeviceKey): 'webgpu' | 'wasm' {
  if (device === 'auto') return caps?.suggestDevice ?? 'wasm'
  return device
}

function persist(st: {
  /** hộp xác nhận dùng chung cho các hành động không hoàn tác được */
  confirm: ConfirmBox | null
  toast: ToastBox | null
  /** ảnh đang được điều hướng bằng bàn phím (khác với ảnh đang mở cửa sổ chi tiết) */
  focusedId: string | null
  loupe: boolean
  sidebarOpen: boolean
  shortcutsOpen: boolean
  sizeId: string
  customSizes: SizePreset[]
  overrides: Record<string, { headRatio: number; topGap: number }>
  crop: CropParams
}) {
  savePrefs({
    sizeId: st.sizeId,
    custom: st.customSizes,
    overrides: st.overrides,
    bgColor: st.crop.bgColor,
    quality: st.crop.quality,
  })
}

function avg(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

function stddev(xs: number[]) {
  if (!xs.length) return 0
  const m = avg(xs)
  return Math.sqrt(avg(xs.map((x) => (x - m) ** 2)))
}

export const useStore = create<State>((set, get) => ({
  photos: [],
  caps: null,
  model: 'modnet',
  device: 'auto',
  crop: { ...DEFAULT_CROP },
  running: false,
  loadingModel: false,
  modelError: null,
  notice: null,
  selectedId: null,
  onlyReview: false,
  showRuler: true,
  cardSize: 'm',
  showTech: false,
  metrics: null,
  confirm: null,
  toast: null,
  focusedId: null,
  loupe: true,
  sidebarOpen: true,
  shortcutsOpen: false,
  sizeId: DEFAULT_SIZE_ID,
  customSizes: [],
  overrides: {},

  init: async () => {
    const caps = await detectCaps()
    set({ caps, model: caps.suggestModel })

    const pr = loadPrefs()
    const customSizes = pr.custom ?? []
    const overrides = pr.overrides ?? {}
    const all = [...BUILTIN_SIZES, ...customSizes]
    // Không có thiết lập đã lưu thì về 3x4, KHÔNG phải phần tử đầu danh sách
    const size =
      all.find((x) => x.id === pr.sizeId) ??
      all.find((x) => x.id === DEFAULT_SIZE_ID) ??
      all[0]
    const ov = overrides[size.id]
    const px = sizePx(size)
    set((st) => ({
      customSizes,
      overrides,
      sizeId: size.id,
      crop: {
        ...st.crop,
        outW: px.w,
        outH: px.h,
        headRatio: ov?.headRatio ?? size.headRatio,
        topGap: ov?.topGap ?? size.topGap,
        bgColor: pr.bgColor ?? st.crop.bgColor,
        quality: pr.quality ?? st.crop.quality,
      },
    }))
  },

  allSizes: () => [...BUILTIN_SIZES, ...get().customSizes],
  currentSize: () => {
    const all = get().allSizes()
    return all.find((x) => x.id === get().sizeId) ?? all[0]
  },

  setSize: (id) => {
    const size = get().allSizes().find((x) => x.id === id)
    if (!size) return
    const ov = get().overrides[id]
    const px = sizePx(size)
    set((st) => ({
      sizeId: id,
      crop: {
        ...st.crop,
        outW: px.w,
        outH: px.h,
        headRatio: ov?.headRatio ?? size.headRatio,
        topGap: ov?.topGap ?? size.topGap,
      },
    }))
    persist(get())
    // Đổi cỡ chỉ cần ghép lại (~150ms/ảnh) chứ không phải chạy lại AI.
    void get().recomposeAll()
  },

  addCustomSize: (label, wCm, hCm) => {
    const size = makeCustomSize(label, wCm, hCm)
    set((st) => ({ customSizes: [...st.customSizes, size] }))
    get().setSize(size.id)
  },

  removeCustomSize: (id) => {
    set((st) => ({
      customSizes: st.customSizes.filter((x) => x.id !== id),
      overrides: Object.fromEntries(Object.entries(st.overrides).filter(([k]) => k !== id)),
    }))
    if (get().sizeId === id) get().setSize(DEFAULT_SIZE_ID)
    else persist(get())
  },

  addFiles: (files) => {
    const imgs = files.filter(
      (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name),
    )
    if (!imgs.length) return
    set((s) => ({ photos: [...s.photos, ...imgs.map(makePhoto)] }))
    // Nếu đang chạy thì thôi — vòng lặp trong run() tự nhặt ảnh mới trong hàng đợi.
    if (!get().running) void get().run()
  },

  clear: () => {
    const removed = get().photos
    if (!removed.length) return
    set({ photos: [], metrics: null, selectedId: null, focusedId: null, notice: null })

    // Chưa thu hồi objectURL vội — còn cửa sổ hoàn tác.
    clearTimeout(revokeTimer)
    revokeTimer = setTimeout(() => {
      removed.forEach((p) => {
        URL.revokeObjectURL(p.thumbUrl)
        if (p.result) URL.revokeObjectURL(p.result.url)
      })
    }, TOAST_MS + 1000) as unknown as number

    get().showToast(`Đã xoá ${removed.length} ảnh`, () => {
      clearTimeout(revokeTimer)
      set({ photos: removed })
    })
  },

  setModel: (model) => {
    set({ model, modelError: null, notice: null })
    void get().run(true)
  },
  setDevice: (device) => {
    set({ device, modelError: null, notice: null })
    void get().run(true)
  },

  setCrop: (patch) => {
    set((s) => ({ crop: { ...s.crop, ...patch } }))
    // Cỡ đầu / khoảng hở chỉnh tay được nhớ riêng cho từng cỡ ảnh
    if (patch.headRatio !== undefined || patch.topGap !== undefined) {
      const { sizeId, crop } = get()
      set((s) => ({
        overrides: {
          ...s.overrides,
          [sizeId]: { headRatio: crop.headRatio, topGap: crop.topGap },
        },
      }))
    }
    persist(get())
  },
  select: (selectedId) => set({ selectedId }),
  toggleReview: () => set((s) => ({ onlyReview: !s.onlyReview })),
  toggleRuler: () => set((s) => ({ showRuler: !s.showRuler })),
  setCardSize: (cardSize) => set({ cardSize }),
  askConfirm: (confirm) => set({ confirm }),
  closeConfirm: () => set({ confirm: null }),

  showToast: (message, undo) => {
    clearTimeout(toastTimer)
    const id = ++toastSeq
    set({ toast: { id, message, undo } })
    toastTimer = setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null })
    }, TOAST_MS) as unknown as number
  },
  hideToast: () => set({ toast: null }),

  visiblePhotos: () => {
    const { photos, onlyReview } = get()
    if (!onlyReview) return photos
    return photos.filter((p) => p.status === 'failed' || (p.result?.flags.length ?? 0) > 0)
  },

  setFocus: (focusedId) => set({ focusedId }),
  focusMove: (delta) => {
    const list = get().visiblePhotos()
    if (!list.length) return
    const i = list.findIndex((p) => p.id === get().focusedId)
    const next = i < 0 ? 0 : Math.min(list.length - 1, Math.max(0, i + delta))
    set({ focusedId: list[next].id })
  },

  toggleLoupe: () => set((s) => ({ loupe: !s.loupe })),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleShortcuts: () => set((s) => ({ shortcutsOpen: !s.shortcutsOpen })),
  toggleTech: () => set((s) => ({ showTech: !s.showTech })),
  toggleExclude: (id) => {
    const p = get().photos.find((x) => x.id === id)
    if (!p) return
    const was = !!p.excluded
    set((s) => ({
      photos: s.photos.map((x) => (x.id === id ? { ...x, excluded: !was } : x)),
    }))
    get().showToast(was ? 'Đã đưa lại vào kết quả' : 'Đã loại 1 ảnh khỏi kết quả', () => {
      set((s) => ({
        photos: s.photos.map((x) => (x.id === id ? { ...x, excluded: was } : x)),
      }))
    })
  },

  run: async (force = false) => {
    if (get().running) return
    const dev = effectiveDevice(get().caps, get().device)

    if (force) {
      set((s) => ({
        photos: s.photos.map((p) => ({ ...p, status: 'queued' as const, error: undefined })),
      }))
    }
    if (!get().photos.some((p) => p.status === 'queued')) return

    set({ running: true, modelError: null })

    let loadMs = 0
    try {
      set({ loadingModel: true })
      const t = performance.now()
      await Promise.all([engine.warmup(get().model, dev), initFace()])
      loadMs = performance.now() - t
    } catch (e) {
      set({
        running: false,
        loadingModel: false,
        modelError: e instanceof Error ? e.message : String(e),
      })
      return
    }
    set({ loadingModel: false })

    const t0 = performance.now()
    const face: number[] = []
    const seg: number[] = []
    const comp: number[] = []

    // Hàng đợi động: ảnh người dùng thả thêm giữa chừng cũng được nhặt lên.
    for (;;) {
      const p = get().photos.find((x) => x.status === 'queued')
      if (!p) break

      set((s) => ({
        photos: s.photos.map((x) => (x.id === p.id ? { ...x, status: 'working' } : x)),
      }))

      try {
        const analysis = await analyzePhoto(p.file, get().model, dev)

        // Bộ dò WebGPU hỏng: onnxruntime-web trên vài GPU trả mask "nhão" —
        // đúng hình người nhưng nhoè, không dùng được. Mask tốt có <5% pixel
        // ở vùng alpha trung gian; trên 8% gần như chắc chắn là lỗi backend.
        if (dev === 'webgpu' && analysis.softness > 0.08) {
          set({
            running: false,
            device: 'wasm',
            notice:
              'GPU của máy này trả về kết quả tách nền không dùng được (lỗi onnxruntime-web). Đã tự chuyển sang CPU và xử lý lại — chậm hơn nhưng chính xác.',
          })
          void get().run(true)
          return
        }

        const result = await compose(p.file, analysis, get().crop)
        face.push(analysis.msFace)
        seg.push(analysis.msSeg)
        comp.push(result.ms)

        set((s) => ({
          photos: s.photos.map((x) =>
            x.id === p.id ? { ...x, status: 'done', analysis, result, error: undefined } : x,
          ),
        }))
      } catch (e) {
        set((s) => ({
          photos: s.photos.map((x) =>
            x.id === p.id
              ? { ...x, status: 'failed', error: e instanceof Error ? e.message : String(e) }
              : x,
          ),
        }))
      }
    }

    const eyes = get()
      .photos.filter((p) => p.result)
      .map((p) => p.result!.eyeY)

    set({
      running: false,
      metrics: {
        loadMs,
        runMs: performance.now() - t0,
        runCount: seg.length,
        avgFace: avg(face),
        avgSeg: avg(seg),
        avgCompose: avg(comp),
        eyeSpread: stddev(eyes),
      },
    })
  },

  recomposeOne: async (id) => {
    const p = get().photos.find((x) => x.id === id)
    if (!p || !p.analysis) return
    if (p.result) URL.revokeObjectURL(p.result.url)
    const result = await compose(p.file, p.analysis, get().crop)
    set((s) => ({ photos: s.photos.map((x) => (x.id === id ? { ...x, result } : x)) }))
  },

  recomposeAll: async () => {
    for (const p of get().photos.filter((x) => x.analysis)) {
      await get().recomposeOne(p.id)
    }
    const eyes = get()
      .photos.filter((p) => p.result)
      .map((p) => p.result!.eyeY)
    const m = get().metrics
    if (m) set({ metrics: { ...m, eyeSpread: stddev(eyes) } })
  },
}))

// Cửa hậu để soi trạng thái khi phát triển (không có trong bản build production)
if (import.meta.env.DEV) {
  ;(window as unknown as { __store: typeof useStore }).__store = useStore
}
