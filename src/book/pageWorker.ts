// Draws page artwork off the main thread so turning pages never waits on it.
// Receives page specs, replies with an ImageBitmap per page (transferred, no copy).
import { renderPage, type Side } from './pageArt'
import type { Hotspot, PageSpec } from './types'

export interface FontSource {
  family: string
  url: string
  weight: string
  style: string
}

export type WorkerRequest =
  | { type: 'init'; fonts: FontSource[] }
  | { type: 'render'; key: string; spec: PageSpec; side: Side; folio: number; texW: number }

export type WorkerReply =
  | { type: 'ready' }
  | { type: 'unsupported'; reason: string }
  | { type: 'done'; key: string; bitmap: ImageBitmap; hotspots: Hotspot[] }
  | { type: 'failed'; key: string; reason: string }

const scope = self as unknown as {
  fonts?: FontFaceSet
  postMessage(message: WorkerReply, transfer?: Transferable[]): void
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null
}

scope.onmessage = async e => {
  const m = e.data
  if (m.type === 'init') {
    try {
      // Text is drawn into the artwork, so the worker needs the same fonts.
      if (!scope.fonts || typeof OffscreenCanvas === 'undefined') throw new Error('no fonts or OffscreenCanvas in workers')
      await Promise.all(
        m.fonts.map(async f => {
          const face = new FontFace(f.family, `url(${f.url})`, { weight: f.weight, style: f.style })
          await face.load()
          scope.fonts!.add(face)
        }),
      )
      if (!new OffscreenCanvas(1, 1).getContext('2d')) throw new Error('no 2D OffscreenCanvas')
      scope.postMessage({ type: 'ready' })
    } catch (err) {
      scope.postMessage({ type: 'unsupported', reason: String(err) })
    }
    return
  }
  try {
    const r = renderPage(m.spec, m.side, m.folio, m.texW)
    const bitmap = (r.canvas as OffscreenCanvas).transferToImageBitmap()
    scope.postMessage({ type: 'done', key: m.key, bitmap, hotspots: r.hotspots }, [bitmap])
  } catch (err) {
    scope.postMessage({ type: 'failed', key: m.key, reason: String(err) })
  }
}
