import { useEffect, useState } from 'react'
import type { EngineState } from '../book/BookEngine'

export interface Chapter {
  label: string
  pageId: string
  section: string
}

interface Props {
  state: EngineState | null
  chapters: Chapter[]
  totalPages: number
  soundOn: boolean
  hint: string | null
  compact: boolean
  onPrev: () => void
  onNext: () => void
  onChapter: (pageId: string) => void
  onSound: () => void
}

const btn =
  'cursor-pointer rounded-full px-2 py-1.5 -mx-2 text-paper/60 transition-colors hover:text-paper focus-visible:text-paper focus-visible:outline focus-visible:outline-1 focus-visible:outline-paper/60'

function pageLabel(s: EngineState | null): string {
  if (!s) return ''
  if (s.overlay) return s.overlay === 'sleeve' ? `${s.section} — Sleeve` : `${s.section} — Interleaf`
  const nums = [s.left, s.right].filter(f => f && f.spec.kind !== 'cover' && f.spec.kind !== 'backCover').map(f => String(f!.folio).padStart(2, '0'))
  if (!nums.length) return s.turned === 0 ? 'Cover' : 'Back cover'
  return nums.join(' — ')
}

export function Chrome({ state, chapters, totalPages, soundOn, hint, compact, onPrev, onNext, onChapter, onSound }: Props) {
  const [menu, setMenu] = useState(false)
  const [canFullscreen] = useState(() => !!document.documentElement.requestFullscreen)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  useEffect(() => {
    if (!menu) return
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [menu])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => {})
  }

  const label = pageLabel(state)
  const atStart = !state || state.turned === 0
  const atEnd = !state || state.turned >= state.max
  const pad = compact ? 'px-4' : 'px-5 sm:px-8'

  return (
    <>
      <header
        className={`pointer-events-none fixed inset-x-0 top-0 z-10 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.08em] ${pad}`}
        style={{ height: 'var(--chrome-top)', paddingTop: 'env(safe-area-inset-top)' }}
      >
        <span className="text-paper/75">Vedant Parikh</span>
        <nav aria-label="Chapters" className="pointer-events-auto hidden items-center gap-6 lg:flex">
          {chapters.map(c => (
            <button
              key={c.pageId}
              className={`${btn} ${state?.section === c.section ? 'text-paper' : ''}`}
              aria-current={state?.section === c.section ? 'true' : undefined}
              onClick={() => onChapter(c.pageId)}
            >
              {c.label}
            </button>
          ))}
        </nav>
        <div className="pointer-events-auto flex items-center gap-5">
          <button className={btn} onClick={onSound} aria-pressed={soundOn}>
            Sound {soundOn ? 'on' : 'off'}
          </button>
          <button className={`${btn} lg:hidden`} onClick={() => setMenu(true)} aria-haspopup="dialog" aria-expanded={menu}>
            Contents
          </button>
        </div>
      </header>

      <footer
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-10 grid grid-cols-[1fr_auto_1fr] items-center font-mono text-[11px] uppercase tracking-[0.08em] ${pad}`}
        style={{ height: 'var(--chrome-bottom)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <span className={`truncate text-paper/45 transition-opacity duration-700 ${hint ? 'opacity-100' : 'opacity-0'}`} aria-hidden={!hint}>
          {hint}
        </span>
        <div className="pointer-events-auto flex items-center gap-4 text-paper/80">
          <button className={btn} onClick={onPrev} disabled={atStart} aria-label="Previous page">
            <span aria-hidden className={atStart ? 'opacity-30' : ''}>←</span>
          </button>
          <span className="min-w-[9ch] text-center tabular-nums" aria-live="polite">
            {label}
            <span className="text-paper/40"> / {String(totalPages).padStart(2, '0')}</span>
          </span>
          <button className={btn} onClick={onNext} disabled={atEnd} aria-label="Next page">
            <span aria-hidden className={atEnd ? 'opacity-30' : ''}>→</span>
          </button>
        </div>
        <div className="pointer-events-auto flex justify-end">
          {canFullscreen && !compact && (
            <button className={btn} onClick={toggleFullscreen}>
              {fullscreen ? 'Exit full screen' : 'Full screen'}
            </button>
          )}
        </div>
      </footer>

      {menu && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Contents"
          className="fixed inset-0 z-20 flex flex-col justify-end bg-black/55 backdrop-blur-sm lg:hidden"
          onClick={() => setMenu(false)}
        >
          <div
            className="rounded-t-2xl bg-[#1a1918] px-6 pt-5 font-mono text-[12px] uppercase tracking-[0.08em]"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between text-paper/45">
              <span>Contents</span>
              <button className={btn} onClick={() => setMenu(false)} autoFocus>
                Close
              </button>
            </div>
            <ul>
              {chapters.map((c, i) => (
                <li key={c.pageId} className="border-t border-paper/10">
                  <button
                    className="flex w-full cursor-pointer items-baseline gap-4 py-4 text-left text-paper/85 focus-visible:outline focus-visible:outline-1 focus-visible:outline-paper/60"
                    onClick={() => { setMenu(false); onChapter(c.pageId) }}
                  >
                    <span className="text-paper/40">{String(i).padStart(2, '0')}</span>
                    <span className="font-sans text-[22px] font-light normal-case tracking-normal">{c.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
