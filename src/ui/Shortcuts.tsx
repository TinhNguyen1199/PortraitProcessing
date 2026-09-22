import { useStore } from '../store'

const KEYS: Array<[string, string]> = [
  ['J  /  ↓', 'Ảnh kế tiếp'],
  ['K  /  ↑', 'Ảnh trước'],
  ['Home / End', 'Ảnh đầu / ảnh cuối'],
  ['Enter', 'Mở cửa sổ chi tiết'],
  ['D', 'Tải ảnh đang chọn'],
  ['X', 'Loại / đưa lại vào kết quả'],
  ['Ctrl + Z', 'Hoàn tác việc vừa làm'],
  ['Z', 'Bật/tắt kính lúp soi viền'],
  ['B', 'Thu gọn / mở thanh bên'],
  ['1 / 2 / 3', 'Cỡ thẻ nhỏ / vừa / lớn'],
  ['Esc', 'Đóng cửa sổ đang mở'],
  ['?', 'Bảng phím tắt này'],
]

export function Shortcuts() {
  const open = useStore((s) => s.shortcutsOpen)
  const toggle = useStore((s) => s.toggleShortcuts)

  if (!open) return null

  return (
    <div className="overlay" onClick={toggle}>
      <div className="sheet keys" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Phím tắt</h3>
          <div className="spacer" />
          <button className="close" onClick={toggle}>
            Đóng
          </button>
        </header>
        <dl className="keylist">
          {KEYS.map(([k, v]) => (
            <div key={k} className="keyrow">
              <dt>
                {k.split(/\s+/).map((part, i) =>
                  part === '/' ? (
                    <span key={i} className="sep">
                      /
                    </span>
                  ) : part === '+' ? (
                    <span key={i} className="sep">
                      +
                    </span>
                  ) : (
                    <kbd key={i}>{part}</kbd>
                  ),
                )}
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="keys-note">
          Phím tắt không hoạt động khi con trỏ đang ở trong ô nhập liệu.
        </p>
      </div>
    </div>
  )
}
