import { useStore } from '../store'
import { FLAG_LABEL } from '../core/types'
import { jpgName, saveBlob } from '../core/download'

export function Inspector() {
  const id = useStore((s) => s.selectedId)
  const photo = useStore((s) => s.photos.find((p) => p.id === s.selectedId))
  const select = useStore((s) => s.select)
  const crop = useStore((s) => s.crop)
  const toggleExclude = useStore((s) => s.toggleExclude)
  const slug = useStore((s) => s.currentSize().slug)

  if (!id || !photo) return null
  const a = photo.analysis
  const r = photo.result

  return (
    <div className="overlay" onClick={() => select(null)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>{photo.name}</h3>
          <div className="spacer" />
          {r && (
            <button className="close hi" onClick={() => saveBlob(r.blob, jpgName(photo.name, slug))}>
              ⭳ Tải ảnh này
            </button>
          )}
          <button className="close" onClick={() => toggleExclude(photo.id)}>
            {photo.excluded ? '↩ Đưa lại vào kết quả' : '× Loại khỏi kết quả'}
          </button>
          <button className="close" onClick={() => select(null)}>
            Đóng
          </button>
        </header>

        <div className="panes">
          <div className="pane">
            <h4>Ảnh gốc</h4>
            <div className="frame">
              <img src={photo.thumbUrl} alt="gốc" />
            </div>
          </div>
          <div className="pane">
            <h4>Kết quả 3×4</h4>
            <div className="frame out">
              {r ? (
                <>
                  <img src={r.url} alt="kết quả" />
                  <div className="ruler" style={{ top: `${(r.eyeY / crop.outH) * 100}%` }} />
                </>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--dim)' }}>
                  {photo.error ?? 'Đang xử lý…'}
                </div>
              )}
            </div>
          </div>
        </div>

        {r && r.flags.length > 0 && (
          <div className="flags">
            {r.flags.map((f) => (
              <span className="flag" key={f}>
                {FLAG_LABEL[f]}
              </span>
            ))}
          </div>
        )}

        {a && r && (
          <dl className="kv">
            <dt>Ảnh gốc</dt>
            <dd>
              {a.srcW}×{a.srcH}px
            </dd>
            <dt>Số khuôn mặt</dt>
            <dd>{a.lm ? a.lm.faceCount : 0}</dd>
            <dt>Đầu nghiêng</dt>
            <dd>{a.lm ? ((a.lm.roll * 180) / Math.PI).toFixed(1) + '°' : '—'}</dd>
            <dt>Đỉnh đầu (ảnh gốc)</dt>
            <dd>y = {Math.round(a.headTopY)}px</dd>
            <dt>Tỉ lệ thu phóng</dt>
            <dd>
              {r.scale.toFixed(2)}× {r.scale > 1 ? '(phải phóng to — thiếu nét)' : '(thu nhỏ — đủ nét)'}
            </dd>
            <dt>Đường mắt trong ảnh xuất</dt>
            <dd>y = {Math.round(r.eyeY)}px</dd>
            <dt>Người chiếm khung</dt>
            <dd>{(a.coverage * 100).toFixed(1)}%</dd>
            <dt>Viền mềm (tóc)</dt>
            <dd>{(a.softness * 100).toFixed(2)}%</dd>
            <dt>Màu nền gốc</dt>
            <dd>
              rgb({a.bg.map((v) => Math.round(v)).join(', ')})
            </dd>
            <dt>Thời gian</dt>
            <dd>
              mặt {Math.round(a.msFace)}ms · tách nền {Math.round(a.msSeg)}ms · ghép{' '}
              {Math.round(r.ms)}ms
            </dd>
            <dt>Dung lượng</dt>
            <dd>{Math.round(r.blob.size / 1024)} KB</dd>
          </dl>
        )}
      </div>
    </div>
  )
}
