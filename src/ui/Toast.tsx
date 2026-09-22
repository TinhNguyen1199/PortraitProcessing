import { useStore } from '../store'

/**
 * Dải thông báo kèm nút Hoàn tác.
 * Dùng cho những hành động làm-rồi-sửa-sau, thay vì chặn người dùng bằng hộp hỏi:
 * cứ làm ngay, ai lỡ tay thì bấm hoàn tác trong 8 giây.
 */
export function Toast() {
  const toast = useStore((s) => s.toast)
  const hide = useStore((s) => s.hideToast)

  if (!toast) return null

  return (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      {toast.undo && (
        <button
          className="toast-undo"
          onClick={() => {
            toast.undo!()
            hide()
          }}
        >
          ↩ Hoàn tác
        </button>
      )}
      <button className="toast-x" title="Đóng" onClick={hide}>
        ×
      </button>
    </div>
  )
}
