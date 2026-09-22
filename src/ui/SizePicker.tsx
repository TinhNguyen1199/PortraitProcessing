import { useMemo, useState } from 'react'
import { useStore } from '../store'
import {
  BUILTIN_SIZES,
  GROUP_LABEL,
  sizePx,
  type SizeGroup,
  type SizePreset,
} from '../core/sizes'

function Row({ size }: { size: SizePreset }) {
  const sizeId = useStore((s) => s.sizeId)
  const setSize = useStore((s) => s.setSize)
  const removeCustomSize = useStore((s) => s.removeCustomSize)
  const askConfirm = useStore((s) => s.askConfirm)
  const px = sizePx(size)
  const on = size.id === sizeId

  return (
    <button className={'size-row' + (on ? ' on' : '')} onClick={() => setSize(size.id)}>
      <span className="s-main">
        <b>{size.label}</b>
        <small>{size.note}</small>
      </span>
      <span className="s-px">
        {px.w}×{px.h}
      </span>
      {size.group === 'custom' && (
        <span
          className="s-del"
          title="Xoá kích thước này"
          onClick={(e) => {
            e.stopPropagation()
            askConfirm({
              title: `Xoá kích thước "${size.label}"?`,
              body: `Kích thước ${size.wCm}×${size.hCm} cm này sẽ biến mất khỏi danh sách. Bạn có thể tạo lại bất cứ lúc nào.`,
              okLabel: 'Xoá',
              danger: true,
              onOk: () => removeCustomSize(size.id),
            })
          }}
        >
          ×
        </span>
      )}
    </button>
  )
}

export function SizePicker() {
  // Selector KHÔNG được trả về mảng/đối tượng dựng mới mỗi lần render,
  // nếu không zustand sẽ thấy giá trị luôn "khác" và React lặp vô hạn.
  const customSizes = useStore((s) => s.customSizes)
  const sizeId = useStore((s) => s.sizeId)
  const addCustomSize = useStore((s) => s.addCustomSize)

  const allSizes = useMemo(() => [...BUILTIN_SIZES, ...customSizes], [customSizes])
  const current = useMemo(
    () => allSizes.find((x) => x.id === sizeId) ?? allSizes[0],
    [allSizes, sizeId],
  )

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [w, setW] = useState('3')
  const [h, setH] = useState('4')

  const wn = parseFloat(w.replace(',', '.'))
  const hn = parseFloat(h.replace(',', '.'))
  const valid = wn > 0.5 && wn <= 30 && hn > 0.5 && hn <= 30

  const groups: SizeGroup[] = ['vn', 'intl', 'custom']

  return (
    <div className="group">
      <h3>Kích thước ảnh</h3>

      {groups.map((g) => {
        const rows = allSizes.filter((x) => x.group === g)
        if (!rows.length) return null
        return (
          <div key={g} className="size-group">
            <div className="size-cap">{GROUP_LABEL[g]}</div>
            {rows.map((x) => (
              <Row key={x.id} size={x} />
            ))}
          </div>
        )
      })}

      {open ? (
        <div className="size-add">
          <input
            type="text"
            placeholder="Tên gợi nhớ (vd: Ảnh thẻ đoàn viên)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="wh">
            <input
              type="text"
              inputMode="decimal"
              value={w}
              onChange={(e) => setW(e.target.value)}
              aria-label="Chiều rộng (cm)"
            />
            <span>×</span>
            <input
              type="text"
              inputMode="decimal"
              value={h}
              onChange={(e) => setH(e.target.value)}
              aria-label="Chiều cao (cm)"
            />
            <span>cm</span>
          </div>
          <div className="wh-act">
            <button
              className="btn"
              disabled={!valid}
              onClick={() => {
                addCustomSize(name, wn, hn)
                setName('')
                setOpen(false)
              }}
            >
              Thêm
            </button>
            <button className="btn ghost" onClick={() => setOpen(false)}>
              Huỷ
            </button>
          </div>
          {!valid && <div className="hint">Nhập số từ 0,5 đến 30 cm cho cả hai chiều.</div>}
        </div>
      ) : (
        <button className="size-new" onClick={() => setOpen(true)}>
          + Thêm kích thước riêng
        </button>
      )}

      <div className="hint">
        Tên file xuất ra sẽ có hậu tố <b>_{current.slug}</b> để không đè lên cỡ khác.
      </div>
    </div>
  )
}
