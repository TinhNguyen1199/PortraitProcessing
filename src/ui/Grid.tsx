import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { jpgName, saveBlob } from '../core/download'
import type { Photo } from '../core/types'

const SIZE_PX: Record<'s' | 'm' | 'l', number> = { s: 108, m: 150, l: 210 }
const LOUPE = 190

interface LoupeState {
  x: number
  y: number
  url: string
  bgW: number
  bgH: number
  bgX: number
  bgY: number
  zoom: number
}

function Card({
  photo,
  onLoupe,
  clearLoupe,
}: {
  photo: Photo
  onLoupe: (e: React.MouseEvent<HTMLImageElement>, url: string) => void
  clearLoupe: () => void
}) {
  const select = useStore((s) => s.select)
  const setFocus = useStore((s) => s.setFocus)
  const toggleExclude = useStore((s) => s.toggleExclude)
  const showRuler = useStore((s) => s.showRuler)
  const outH = useStore((s) => s.crop.outH)
  const slug = useStore((s) => s.currentSize().slug)
  const focused = useStore((s) => s.focusedId === photo.id)

  const ref = useRef<HTMLDivElement>(null)

  // Điều hướng bằng J/K phải tự cuộn thẻ đang chọn vào tầm nhìn
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [focused])

  const flags = photo.result?.flags ?? []
  const cls =
    'card' +
    (photo.status === 'failed' ? ' failed' : flags.length ? ' flagged' : '') +
    (photo.excluded ? ' excluded' : '') +
    (focused ? ' focused' : '')

  const done = photo.status === 'done' && photo.result

  return (
    <div
      ref={ref}
      className={cls}
      title={photo.name}
      onClick={() => {
        setFocus(photo.id)
        select(photo.id)
      }}
    >
      <div className="shot">
        {done ? (
          <>
            <img
              src={photo.result!.url}
              alt={photo.name}
              onMouseMove={(e) => onLoupe(e, photo.result!.url)}
              onMouseLeave={clearLoupe}
            />
            {showRuler && (
              <div className="ruler" style={{ top: `${(photo.result!.eyeY / outH) * 100}%` }} />
            )}
          </>
        ) : photo.status === 'failed' ? (
          <>
            <img className="ghost" src={photo.thumbUrl} alt="" />
            <span className="badge err">Lỗi</span>
          </>
        ) : (
          <>
            {/* Hiện ảnh gốc mờ để biết đang xử lý em nào */}
            <img className="ghost" src={photo.thumbUrl} alt="" />
            <div className="spin" />
          </>
        )}

        {flags.length > 0 && done && !photo.excluded && (
          <span className="badge warn">⚠ {flags.length}</span>
        )}
        {photo.excluded && <span className="badge err">Đã loại</span>}

        {done && (
          <div
            className="acts"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={clearLoupe}
          >
            <button
              title="Tải ảnh này (D)"
              onClick={() => saveBlob(photo.result!.blob, jpgName(photo.name, slug))}
            >
              ⭳
            </button>
            <button
              title={photo.excluded ? 'Đưa lại vào kết quả (X)' : 'Loại khỏi kết quả (X)'}
              className={photo.excluded ? 'on' : ''}
              onClick={() => toggleExclude(photo.id)}
            >
              {photo.excluded ? '↩' : '×'}
            </button>
          </div>
        )}
      </div>

      <div className="meta">
        <span className="nm">{photo.name}</span>
        <span className="sz">{done ? Math.round(photo.result!.blob.size / 1024) + ' KB' : ''}</span>
      </div>
    </div>
  )
}

export function Grid() {
  const photos = useStore((s) => s.photos)
  const onlyReview = useStore((s) => s.onlyReview)
  const toggleReview = useStore((s) => s.toggleReview)
  const cardSize = useStore((s) => s.cardSize)
  const setCardSize = useStore((s) => s.setCardSize)
  const crop = useStore((s) => s.crop)
  const loupeOn = useStore((s) => s.loupe)

  const [loupe, setLoupe] = useState<LoupeState | null>(null)

  const review = photos.filter((p) => p.status === 'failed' || (p.result?.flags.length ?? 0) > 0)
  const shown = onlyReview ? review : photos

  /**
   * Kính lúp: phóng về đúng độ phân giải gốc của ảnh xuất (354px trên thẻ rộng 150px
   * là 2,4×). Không phóng quá mức thật vì như thế chỉ ra ảnh mờ chứ không thêm chi tiết.
   */
  const onLoupe = (e: React.MouseEvent<HTMLImageElement>, url: string) => {
    if (!loupeOn) return
    const img = e.currentTarget
    const r = img.getBoundingClientRect()
    const zoom = Math.max(2, (img.naturalWidth || crop.outW) / r.width)
    const rx = (e.clientX - r.left) / r.width
    const ry = (e.clientY - r.top) / r.height
    const bgW = r.width * zoom
    const bgH = r.height * zoom
    setLoupe({
      x: e.clientX,
      y: e.clientY,
      url,
      bgW,
      bgH,
      bgX: -(rx * bgW - LOUPE / 2),
      bgY: -(ry * bgH - LOUPE / 2),
      zoom,
    })
  }
  const clearLoupe = () => setLoupe(null)

  useEffect(() => {
    if (!loupeOn) setLoupe(null)
  }, [loupeOn])

  // Vị trí ô lúp: đặt lệch sang bên để không che mất chỗ đang soi
  let lx = 0
  let ly = 0
  if (loupe) {
    lx = loupe.x + 24
    ly = loupe.y - LOUPE - 16
    if (lx + LOUPE > window.innerWidth - 8) lx = loupe.x - LOUPE - 24
    if (ly < 8) ly = loupe.y + 24
  }

  return (
    <>
      <div className="toolbar">
        <button
          className={'tab' + (onlyReview ? '' : ' on')}
          onClick={() => onlyReview && toggleReview()}
        >
          Tất cả <b>{photos.length}</b>
        </button>
        <button
          className={'tab' + (onlyReview ? ' on' : '')}
          onClick={() => !onlyReview && toggleReview()}
          disabled={!review.length}
        >
          ⚠ Cần xem lại <b>{review.length}</b>
        </button>

        <div className="spacer" />

        <div className="seg" role="group" aria-label="Cỡ thẻ">
          {(['s', 'm', 'l'] as const).map((k) => (
            <button
              key={k}
              className={cardSize === k ? 'on' : ''}
              onClick={() => setCardSize(k)}
              title={{ s: 'Thẻ nhỏ (1)', m: 'Thẻ vừa (2)', l: 'Thẻ lớn (3)' }[k]}
            >
              {k.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div
        className="grid"
        style={
          {
            '--card': SIZE_PX[cardSize] + 'px',
            '--ar': `${crop.outW} / ${crop.outH}`,
          } as React.CSSProperties
        }
      >
        {shown.map((p) => (
          <Card key={p.id} photo={p} onLoupe={onLoupe} clearLoupe={clearLoupe} />
        ))}
      </div>

      {loupe && (
        <div
          className="loupe"
          style={{
            left: lx,
            top: ly,
            width: LOUPE,
            height: LOUPE,
            backgroundImage: `url(${loupe.url})`,
            backgroundSize: `${loupe.bgW}px ${loupe.bgH}px`,
            backgroundPosition: `${loupe.bgX}px ${loupe.bgY}px`,
          }}
        >
          <span className="loupe-x">{loupe.zoom.toFixed(1)}×</span>
        </div>
      )}
    </>
  )
}
