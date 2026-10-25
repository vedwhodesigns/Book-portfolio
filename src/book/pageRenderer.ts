// Main-thread side of page drawing: hands jobs to the worker when the
// browser supports it, and falls back to drawing in idle time when not.
import inter300 from '@fontsource/inter-tight/files/inter-tight-latin-300-normal.woff2?url'
import inter400 from '@fontsource/inter-tight/files/inter-tight-latin-400-normal.woff2?url'
import mono400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url'
import serif400 from '@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?url'
import serif400i from '@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2?url'
import { renderPage, type Side } from './pageArt'
import type { FontSource, WorkerReply, WorkerRequest } from './pageWorker'
import type { Hotspot, PageSpec } from './types'
import type { AnyCanvas } from './art'

const FONTS: FontSource[] = [
  { family: 'Inter Tight', url: inter300, weight: '300', style: 'normal' },
  { family: 'Inter Tight', url: inter400, weight: '400', style: 'normal' },
  { family: 'IBM Plex Mono', url: mono400, weight: '400', style: 'normal' },
  { family: 'Instrument Serif', url: serif400, weight: '400', style: 'normal' },
  { family: 'Instrument Serif', url: serif400i, weight: '400', style: 'italic' },
]

export interface RenderedPage {
  image: ImageBitmap | AnyCanvas
  hotspots: Hotspot[]
}

export interface PageJob {
  key: string
  spec: PageSpec
  side: Side
  folio: number
  texW: number
}

/** How many pages the worker draws at once. */
const IN_FLIGHT = 2

export class PageRenderer {
  private worker?: Worker
  private mode: 'pending' | 'worker' | 'main' = 'pending'
  private inFlight = new Map<string, PageJob>()

  constructor(
    private onDone: (key: string, page: RenderedPage) => void,
    /** Called once it is known whether drawing runs in the worker or here. */
    private onReady: () => void,
  ) {
    try {
      this.worker = new Worker(new URL('./pageWorker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e: MessageEvent<WorkerReply>) => this.receive(e.data)
      this.worker.onerror = () => this.fallBack()
      this.post({ type: 'init', fonts: FONTS })
    } catch {
      this.fallBack()
    }
  }

  /** True once jobs can be handed over without blocking the main thread. */
  get offThread() { return this.mode === 'worker' }
  get ready() { return this.mode !== 'pending' }
  get busy() { return this.inFlight.size >= IN_FLIGHT }
  isDrawing(key: string) { return this.inFlight.has(key) }

  /** Starts a job; returns false if it must wait (worker full or not ready). */
  start(job: PageJob): boolean {
    if (this.mode === 'pending' || (this.mode === 'worker' && this.busy)) return false
    if (this.mode === 'main') {
      const r = renderPage(job.spec, job.side, job.folio, job.texW)
      this.onDone(job.key, { image: r.canvas, hotspots: r.hotspots })
      return true
    }
    this.inFlight.set(job.key, job)
    this.post({ type: 'render', ...job })
    return true
  }

  dispose() {
    this.worker?.terminate()
    this.inFlight.clear()
  }

  private post(m: WorkerRequest) {
    this.worker?.postMessage(m)
  }

  private receive(m: WorkerReply) {
    if (m.type === 'ready') { this.mode = 'worker'; this.onReady(); return }
    if (m.type === 'unsupported') { this.fallBack(); return }
    const job = this.inFlight.get(m.key)
    this.inFlight.delete(m.key)
    if (m.type === 'done') this.onDone(m.key, { image: m.bitmap, hotspots: m.hotspots })
    else if (job) {
      // Draw it here instead.
      const r = renderPage(job.spec, job.side, job.folio, job.texW)
      this.onDone(job.key, { image: r.canvas, hotspots: r.hotspots })
    }
  }

  private fallBack() {
    const pending = [...this.inFlight.values()]
    this.worker?.terminate()
    this.worker = undefined
    this.inFlight.clear()
    this.mode = 'main'
    for (const job of pending) this.start(job)
    this.onReady()
  }
}
