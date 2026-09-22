import { useStore } from '../store'
import { MODELS, type ModelKey, type DeviceKey } from '../core/models'
import { downloadZip } from '../core/zip'
import { SizePicker } from './SizePicker'

function Range({
  label,
  value,
  min,
  max,
  step,
  fmt,
  onInput,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  fmt: (v: number) => string
  onInput: (v: number) => void
  onCommit: () => void
}) {
  return (
    <div className="field">
      <label>
        {label} <b>{fmt(value)}</b>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onInput(parseFloat(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
    </div>
  )
}

export function Sidebar() {
  const s = useStore()
  const spec = MODELS[s.model]
  const dev = s.device === 'auto' ? (s.caps?.suggestDevice ?? 'wasm') : s.device
  const ready = s.photos.filter((p) => p.result && !p.excluded)

  const commit = () => void s.recomposeAll()
  const live = () => {
    if (s.selectedId) void s.recomposeOne(s.selectedId)
  }

  return (
    <aside className="sidebar">
      <div className="side-scroll">
        <SizePicker />

        <div className="group">
          <h3>Căn chỉnh khung</h3>
          <Range
            label="Cỡ đầu trong khung"
            value={s.crop.headRatio}
            min={0.45}
            max={0.8}
            step={0.01}
            fmt={(v) => Math.round(v * 100) + '%'}
            onInput={(v) => {
              s.setCrop({ headRatio: v })
              live()
            }}
            onCommit={commit}
          />
          <Range
            label="Hở trên đỉnh đầu"
            value={s.crop.topGap}
            min={0.02}
            max={0.2}
            step={0.005}
            fmt={(v) => Math.round(v * 100) + '%'}
            onInput={(v) => {
              s.setCrop({ topGap: v })
              live()
            }}
            onCommit={commit}
          />
          <div className="field">
            <label>Màu nền</label>
            <div className="swatches">
              {['#ffffff', '#f2f4f8', '#dbe9ff', '#cfe3ff', '#ffd9d9'].map((c) => (
                <button
                  key={c}
                  className={'sw' + (s.crop.bgColor === c ? ' on' : '')}
                  style={{ background: c }}
                  title={c}
                  onClick={() => {
                    s.setCrop({ bgColor: c })
                    commit()
                  }}
                />
              ))}
              <input
                type="color"
                className="sw custom"
                value={s.crop.bgColor}
                onChange={(e) => s.setCrop({ bgColor: e.target.value })}
                onBlur={commit}
                title="Màu khác"
              />
            </div>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={s.crop.straighten}
              onChange={(e) => {
                s.setCrop({ straighten: e.target.checked })
                commit()
              }}
            />
            Tự xoay cho mắt nằm ngang
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={s.crop.decontaminate}
              onChange={(e) => {
                s.setCrop({ decontaminate: e.target.checked })
                commit()
              }}
            />
            Khử ám màu nền cũ ở viền tóc
          </label>
          <label className="check">
            <input type="checkbox" checked={s.showRuler} onChange={s.toggleRuler} />
            Hiện thước đồng bộ (đường mắt)
          </label>
          <label className="check">
            <input type="checkbox" checked={s.loupe} onChange={s.toggleLoupe} />
            Kính lúp soi viền khi rê chuột <kbd>Z</kbd>
          </label>
        </div>

        <div className="group">
          <h3>Chất lượng file</h3>
          <Range
            label="Nén JPEG"
            value={s.crop.quality}
            min={0.6}
            max={1}
            step={0.01}
            fmt={(v) => Math.round(v * 100) + ''}
            onInput={(v) => {
              s.setCrop({ quality: v })
              live()
            }}
            onCommit={commit}
          />
          <div className="hint">
            Mỗi ảnh xuất ra {s.crop.outW}×{s.crop.outH}px — đúng {s.currentSize().label} khi in
            ở 300dpi.
          </div>
        </div>

        {/* Đặt một lần rồi thôi -> thu gọn, nhường chỗ cho thứ dùng hằng ngày */}
        <details className="adv">
          <summary>Cài đặt nâng cao</summary>

          <div className="field">
            <label>Model tách nền</label>
            <select
              value={s.model}
              onChange={(e) => s.setModel(e.target.value as ModelKey)}
              disabled={s.running}
            >
              {(Object.keys(MODELS) as ModelKey[]).map((k) => (
                <option key={k} value={k}>
                  {MODELS[k].label} · {MODELS[k].sizeMB[dev]}MB · {MODELS[k].license}
                </option>
              ))}
            </select>
            <div className="hint">{spec.note}</div>
          </div>

          <div className="field">
            <label>Chạy bằng</label>
            <select
              value={s.device}
              onChange={(e) => s.setDevice(e.target.value as DeviceKey)}
              disabled={s.running}
            >
              <option value="auto">Tự chọn (CPU — an toàn)</option>
              <option value="wasm">CPU / WASM</option>
              <option value="webgpu" disabled={!s.caps?.webgpu}>
                WebGPU {s.caps?.webgpu ? '(thử nghiệm)' : '(máy không hỗ trợ)'}
              </option>
            </select>
            <div className="hint">
              WebGPU nhanh hơn ~4 lần nhưng một số GPU trả kết quả sai. Nếu phát hiện, app tự
              chuyển về CPU.
            </div>
          </div>

          {s.caps && (
            <div className="hint">
              Máy này: {s.caps.cores} lõi · {s.caps.memGB}GB ·{' '}
              {s.caps.webgpu ? 'có GPU' : 'không GPU'} ·{' '}
              {s.caps.isolated ? 'đa luồng' : 'một luồng'}
            </div>
          )}
        </details>
      </div>

      {/* Hành động đích luôn nằm trong tầm mắt, không bị cuộn mất */}
      <div className="dock">
        <button
          className="btn primary"
          disabled={!ready.length}
          onClick={() =>
            void downloadZip(
              ready.map((p) => ({ name: p.name, blob: p.result!.blob })),
              `anh-the-${s.currentSize().slug}.zip`,
              s.currentSize().slug,
            )
          }
        >
          ⭳ Tải tất cả · {ready.length} ảnh
        </button>
        <div className="dock-row">
          <button
            className="btn"
            disabled={!s.photos.length || s.running}
            onClick={() => void s.run(true)}
          >
            Xử lý lại
          </button>
          <button
            className="btn danger"
            disabled={!s.photos.length}
            onClick={() =>
              s.askConfirm({
                title: `Xoá toàn bộ ${s.photos.length} ảnh?`,
                body: 'Mọi ảnh đã xử lý sẽ mất và không lấy lại được. Nếu chưa tải về thì nên tải trước đã.',
                okLabel: 'Xoá hết',
                danger: true,
                onOk: s.clear,
              })
            }
          >
            Xoá hết
          </button>
        </div>
      </div>
    </aside>
  )
}
