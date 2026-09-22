import { useEffect, useRef, useState } from 'react'
import { useStore } from './store'
import { Sidebar } from './ui/Sidebar'
import { Grid } from './ui/Grid'
import { Inspector } from './ui/Inspector'
import { Confirm } from './ui/Confirm'
import { Toast } from './ui/Toast'
import { Shortcuts } from './ui/Shortcuts'
import { jpgName, saveBlob } from './core/download'

/** Đọc đệ quy cả thư mục khi người dùng kéo-thả folder vào. */
async function readEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const f = await new Promise<File | null>((res) =>
      (entry as FileSystemFileEntry).file(res, () => res(null)),
    )
    if (f) out.push(f)
    return
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res) =>
      reader.readEntries(res, () => res([])),
    )
    if (!batch.length) break
    for (const e of batch) await readEntry(e, out)
  }
}

async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries: FileSystemEntry[] = []
  for (const item of Array.from(dt.items)) {
    const e = item.webkitGetAsEntry?.()
    if (e) entries.push(e)
  }
  if (!entries.length) return Array.from(dt.files)
  const out: File[] = []
  for (const e of entries) await readEntry(e, out)
  return out
}

export default function App() {
  const s = useStore()
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dirRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void s.init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Dán ảnh từ clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length) s.addFiles(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [s])

  // Đang có việc dở mà lỡ F5 thì mất sạch -> chặn lại
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (useStore.getState().photos.length) e.preventDefault()
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [])

  // Phím tắt toàn cục
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      if (!el || !el.tagName) return false
      return (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable
      )
    }

    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState()

      if (e.key === 'Escape') {
        if (st.shortcutsOpen) st.toggleShortcuts()
        else if (st.selectedId) st.select(null)
        return
      }

      // Đang gõ trong ô nhập liệu thì phím tắt phải im lặng
      if (isTyping(e.target)) return

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        if (st.toast?.undo) {
          e.preventDefault()
          st.toast.undo()
          st.hideToast()
        }
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const id = st.focusedId
      switch (e.key) {
        case 'j':
        case 'J':
        case 'ArrowDown':
          e.preventDefault()
          st.focusMove(1)
          break
        case 'k':
        case 'K':
        case 'ArrowUp':
          e.preventDefault()
          st.focusMove(-1)
          break
        case 'Home':
          st.focusMove(-9999)
          break
        case 'End':
          st.focusMove(9999)
          break
        case 'Enter':
          if (id) st.select(id)
          break
        case 'd':
        case 'D': {
          const p = st.photos.find((x) => x.id === id)
          if (p?.result) saveBlob(p.result.blob, jpgName(p.name, st.currentSize().slug))
          break
        }
        case 'x':
        case 'X':
          if (id) st.toggleExclude(id)
          break
        case 'z':
        case 'Z':
          st.toggleLoupe()
          break
        case 'b':
        case 'B':
          st.toggleSidebar()
          break
        case '1':
          st.setCardSize('s')
          break
        case '2':
          st.setCardSize('m')
          break
        case '3':
          st.setCardSize('l')
          break
        case '?':
          st.toggleShortcuts()
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Có ảnh mà chưa chọn ảnh nào thì trỏ vào ảnh đầu, để J/K dùng được ngay
  useEffect(() => {
    const st = useStore.getState()
    if (!st.focusedId && st.photos.length) st.setFocus(st.photos[0].id)
  }, [s.photos.length])

  const doneCount = s.photos.filter((p) => p.status === 'done' || p.status === 'failed').length
  const pct = s.photos.length ? (doneCount / s.photos.length) * 100 : 0
  const doneOk = s.photos.filter((p) => p.status === 'done').length
  const failed = s.photos.filter((p) => p.status === 'failed').length
  const excluded = s.photos.filter((p) => p.excluded).length
  const readyCount = s.photos.filter((p) => p.result && !p.excluded).length
  // ước lượng thời gian còn lại từ tốc độ thật của lần chạy trước
  const perPhoto = s.metrics ? s.metrics.runMs / Math.max(1, s.metrics.runCount) : 1600
  const left = Math.round(((s.photos.length - doneCount) * perPhoto) / 1000)

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        void filesFromDrop(e.dataTransfer).then((f) => s.addFiles(f))
      }}
    >
      <div className="topbar">
        <button
          className="icon-btn"
          title={s.sidebarOpen ? 'Thu gọn thanh bên (B)' : 'Mở thanh bên (B)'}
          onClick={s.toggleSidebar}
        >
          {s.sidebarOpen ? '⟨' : '⟩'}
        </button>
        <div className="brand">
          <div className="dot" />
          <div>
            Ảnh Thẻ
            <br />
            <small>Xử lý chân dung hàng loạt · {s.currentSize().label}</small>
          </div>
        </div>
        <div className="spacer" />
        <button className="icon-btn" title="Phím tắt (?)" onClick={s.toggleShortcuts}>
          ?
        </button>
        {s.photos.length > 0 && (
          <span className="chip">
            {s.photos.filter((p) => p.status === 'done').length}/{s.photos.length} ảnh
          </span>
        )}
      </div>

      <div className={'body' + (s.sidebarOpen ? '' : ' collapsed')}>
        <Sidebar />
        <main className="main">
          {s.notice && <div className="note-box">{s.notice}</div>}

          {s.modelError && (
            <div className="err-box">
              <b>Không tải được model.</b> {s.modelError}
              <br />
              Thử đổi sang model khác hoặc chuyển backend sang CPU/WASM ở thanh bên trái.
            </div>
          )}

          {s.photos.length === 0 ? (
            <div className={'drop' + (over ? ' over' : '')}>
              <div className="big">🖼️</div>
              <h2>Kéo thả ảnh hoặc cả thư mục lớp vào đây</h2>
              <p>
                Ảnh được tách nền, căn mặt và cắt thành {s.currentSize().label} ngay trong
                trình duyệt.
              </p>
              <div className="row">
                <button className="btn primary" onClick={() => fileRef.current?.click()}>
                  Chọn ảnh
                </button>
                <button className="btn" onClick={() => dirRef.current?.click()}>
                  Chọn thư mục
                </button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--dim)' }}>
                Hoặc nhấn Ctrl+V để dán ảnh từ clipboard
              </p>
            </div>
          ) : (
            <Grid />
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              s.addFiles(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
          <input
            ref={dirRef}
            type="file"
            hidden
            multiple
            // @ts-expect-error thuộc tính riêng của Chromium
            webkitdirectory=""
            onChange={(e) => {
              s.addFiles(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
        </main>
      </div>

      <div className="statusbar">
        {s.loadingModel ? (
          <>
            <div className="spin" style={{ width: 14, height: 14 }} />
            <span>Đang tải bộ xử lý AI — chỉ lần đầu, sau đó máy sẽ nhớ…</span>
          </>
        ) : s.running ? (
          <>
            <span>
              Đang xử lý <b>{doneCount}</b>/<b>{s.photos.length}</b>
            </span>
            <div className="progress">
              <i style={{ width: pct + '%' }} />
            </div>
            <span>{left > 0 ? `còn khoảng ${left}s` : 'sắp xong'}</span>
          </>
        ) : s.metrics ? (
          <>
            <span>
              Xong <b>{doneOk}</b> ảnh
              {failed > 0 && <> · <b style={{ color: 'var(--err)' }}>{failed} lỗi</b></>}
              {excluded > 0 && <> · {excluded} đã loại</>}
            </span>
            <span>
              Sẵn sàng tải: <b>{readyCount}</b> ảnh
            </span>
            <div className="spacer" />
            <button className="link" onClick={s.toggleTech}>
              {s.showTech ? 'Ẩn chi tiết kỹ thuật' : 'Chi tiết kỹ thuật'}
            </button>
            {s.showTech && (
              <span className="tech">
                {(s.metrics.runMs / 1000).toFixed(1)}s cho {s.metrics.runCount} ảnh ·{' '}
                {(s.metrics.runMs / Math.max(1, s.metrics.runCount) / 1000).toFixed(2)}s/ảnh · tách
                nền {Math.round(s.metrics.avgSeg)}ms · nhận mặt {Math.round(s.metrics.avgFace)}ms ·
                ghép {Math.round(s.metrics.avgCompose)}ms · tải model{' '}
                {(s.metrics.loadMs / 1000).toFixed(1)}s · đồng bộ đường mắt ±
                {s.metrics.eyeSpread.toFixed(1)}px
              </span>
            )}
          </>
        ) : (
          <span>Sẵn sàng. Thả ảnh vào để bắt đầu.</span>
        )}
      </div>

      <Inspector />
      <Confirm />
      <Shortcuts />
      <Toast />
    </div>
  )
}
