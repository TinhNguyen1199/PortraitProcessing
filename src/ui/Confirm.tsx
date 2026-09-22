import { useEffect } from 'react'
import { useStore } from '../store'

/**
 * Hộp xác nhận cho các hành động không hoàn tác được.
 * Dùng cho "Xoá hết" và "Xoá kích thước riêng" — những thứ mất là mất luôn.
 * Các hành động đảo ngược được (loại ảnh khỏi kết quả) thì KHÔNG hỏi,
 * vì hỏi nhiều quá người dùng sẽ bấm đồng ý theo phản xạ.
 */
export function Confirm() {
  const box = useStore((s) => s.confirm)
  const close = useStore((s) => s.closeConfirm)

  useEffect(() => {
    if (!box) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
      if (e.key === 'Enter') {
        e.stopPropagation()
        box.onOk()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [box, close])

  if (!box) return null

  return (
    <div className="overlay" onClick={close}>
      <div className="sheet confirm" onClick={(e) => e.stopPropagation()}>
        <h3>{box.title}</h3>
        <p>{box.body}</p>
        <div className="confirm-act">
          <button className="btn" onClick={close}>
            Huỷ
          </button>
          <button
            className={'btn ' + (box.danger ? 'danger-solid' : 'primary')}
            autoFocus
            onClick={() => {
              box.onOk()
              close()
            }}
          >
            {box.okLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
