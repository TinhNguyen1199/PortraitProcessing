import type { ModelKey } from './models'

export interface SegResult {
  mask: Uint8Array
  maskW: number
  maskH: number
  srcW: number
  srcH: number
  ms: number
}

type Pending = {
  resolve: (r: SegResult) => void
  reject: (e: Error) => void
}

/**
 * Bọc worker tách nền thành hàng đợi tuần tự.
 * Một worker là đủ: nghẽn cổ chai là inference, và mỗi bản sao model tốn cả trăm MB RAM.
 */
class Engine {
  private worker: Worker | null = null
  private pending = new Map<string, Pending>()
  private readyWaiters: Array<{ resolve: () => void; reject: (e: Error) => void }> = []
  private seq = 0
  private key = ''

  private failAll(err: Error) {
    this.pending.forEach((p) => p.reject(err))
    this.pending.clear()
    this.readyWaiters.forEach((r) => r.reject(err))
    this.readyWaiters = []
  }

  private spawn() {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; id?: string; message?: string } & Partial<SegResult>
      if (m.type === 'debug') {
        console.log('[seg debug]', e.data)
        return
      }
      if (m.type === 'ready') {
        this.readyWaiters.forEach((r) => r.resolve())
        this.readyWaiters = []
        return
      }
      if (m.type === 'segmented' && m.id) {
        this.pending.get(m.id)?.resolve(m as unknown as SegResult)
        this.pending.delete(m.id)
        return
      }
      if (m.type === 'error') {
        const err = new Error(m.message || 'Lỗi không rõ')
        if (m.id && this.pending.has(m.id)) {
          this.pending.get(m.id)!.reject(err)
          this.pending.delete(m.id)
        } else {
          this.failAll(err)
        }
      }
    }
    w.onerror = (e) => this.failAll(new Error(e.message || 'Worker lỗi'))
    this.worker = w
  }

  /** Đổi model hoặc backend => dựng lại worker để giải phóng model cũ khỏi RAM. */
  configure(model: ModelKey, device: 'webgpu' | 'wasm') {
    const key = model + ':' + device
    if (this.key === key && this.worker) return
    this.worker?.terminate()
    this.worker = null
    this.key = key
    this.spawn()
  }

  warmup(model: ModelKey, device: 'webgpu' | 'wasm'): Promise<void> {
    this.configure(model, device)
    return new Promise((resolve, reject) => {
      this.readyWaiters.push({ resolve, reject })
      this.worker!.postMessage({ type: 'init', model, device })
    })
  }

  segment(file: File, model: ModelKey, device: 'webgpu' | 'wasm'): Promise<SegResult> {
    this.configure(model, device)
    const id = 'j' + ++this.seq
    return new Promise<SegResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker!.postMessage({ type: 'segment', id, file, model, device })
    })
  }
}

export const engine = new Engine()
