import { useState, useRef, useEffect, useCallback } from 'react'
import { savePrefs } from '../lib/prefs'

interface LocalWindow {
  jQuery: (selector: string) => { data: (key: string) => DFApp | undefined }
}

interface DFApp {
  currentPageNumber: number
  viewer?: { soundOn: boolean }
  start: () => void
  end: () => void
}

interface Props {
  totalPages: number
  page: number
  soundOn: boolean
  onPageChange: (p: number) => void
  onSoundChange: (on: boolean) => void
}

const LABELS = ['First Page', 'Previous Page', 'Next Page', 'Last Page', 'Cover', 'Sound', 'Full Screen', 'Download']

function getApp(): DFApp | undefined {
  return (window as unknown as LocalWindow).jQuery('#portfolio-viewer').data('dfApp')
}

export function NavPill({ totalPages, page, soundOn, onPageChange, onSoundChange }: Props) {
  const [tooltip, setTooltip]   = useState<{ left: number; width: number; labelLeft: number; idx: number } | null>(null)
  const [inFs, setInFs]         = useState(false)
  const coreRef                 = useRef<HTMLDivElement>(null)
  const btnRefs                 = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const sync = () => setInFs(!!(document.fullscreenElement || (document as { webkitFullscreenElement?: Element }).webkitFullscreenElement))
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  const showTooltip = useCallback((idx: number) => {
    const btn  = btnRefs.current[idx]
    const core = coreRef.current
    if (!btn || !core) return
    const btnRect  = btn.getBoundingClientRect()
    const coreRect = core.getBoundingClientRect()
    setTooltip({ left: btnRect.left - coreRect.left, width: btnRect.width, labelLeft: idx, idx })
  }, [])

  const hideTooltip = useCallback(() => setTooltip(null), [])

  const navPrev = () => { document.querySelector<HTMLElement>('.df-ui-prev')?.click() }
  const navNext = () => { document.querySelector<HTMLElement>('.df-ui-next')?.click() }

  const navFirst = () => {
    const app = getApp(); if (!app) return
    app.start(); onPageChange(1)
  }
  const navLast = () => {
    const app = getApp(); if (!app) return
    app.end(); onPageChange(totalPages)
  }
  const navCover = () => {
    const app = getApp(); if (!app) return
    app.start(); onPageChange(1)
  }

  const toggleSound = () => {
    const next = !soundOn
    onSoundChange(next)
    const app = getApp()
    if (app?.viewer) app.viewer.soundOn = next
    savePrefs({ sound: next })
  }

  const toggleFullscreen = () => {
    const el  = document.documentElement
    const cur = !!(document.fullscreenElement || (document as { webkitFullscreenElement?: Element }).webkitFullscreenElement)
    if (!cur) {
      const enter = (el.requestFullscreen ?? (el as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen)?.bind(el)
      enter?.().catch(() => {})
    } else {
      const exit = (document.exitFullscreen ?? (document as { webkitExitFullscreen?: () => Promise<void> }).webkitExitFullscreen)?.bind(document)
      exit?.().catch(() => {})
    }
  }

  return (
    <nav id="ctrl-nav" aria-label="Flipbook controls">
      <div id="ctrl-core" ref={coreRef}>

        {tooltip && (
          <div
            id="ctrl-tooltip"
            aria-hidden="true"
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 14px)',
              left: tooltip.left,
              width: tooltip.width,
              opacity: 1,
              overflow: 'hidden',
              borderRadius: 10,
              background: 'rgba(15,15,15,0.72)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              pointerEvents: 'none',
              transition: 'opacity 0.18s ease',
              whiteSpace: 'nowrap',
              padding: '7px 14px',
            }}
          >
            <span style={{ fontSize: 8, fontWeight: 500, color: '#fff', display: 'block' }}>
              {LABELS[tooltip.idx]}
            </span>
          </div>
        )}

        <ul id="ctrl-buttons">

          <li>
            <button
              className="ctrl-btn" id="ctrl-first" title="First Page"
              ref={el => { btnRefs.current[0] = el }}
              onMouseEnter={() => showTooltip(0)} onMouseLeave={hideTooltip}
              onClick={navFirst}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18.75 19.5 11.25 12l7.5-7.5"/><path d="M12.75 19.5 5.25 12l7.5-7.5"/>
              </svg>
              <span className="sr-only">First Page</span>
            </button>
          </li>

          <li>
            <button
              className="ctrl-btn" id="ctrl-prev" title="Previous Page"
              ref={el => { btnRefs.current[1] = el }}
              onMouseEnter={() => showTooltip(1)} onMouseLeave={hideTooltip}
              onClick={navPrev}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15.75 19.5 8.25 12l7.5-7.5"/>
              </svg>
              <span className="sr-only">Previous Page</span>
            </button>
          </li>

          <li>
            <div id="ctrl-counter" aria-live="polite">
              <span id="ctrl-page-num">{page}</span>
              <span className="ctrl-counter-sep">/</span>
              <span id="ctrl-page-total">{totalPages}</span>
            </div>
          </li>

          <li>
            <button
              className="ctrl-btn" id="ctrl-next" title="Next Page"
              ref={el => { btnRefs.current[2] = el }}
              onMouseEnter={() => showTooltip(2)} onMouseLeave={hideTooltip}
              onClick={navNext}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
              </svg>
              <span className="sr-only">Next Page</span>
            </button>
          </li>

          <li>
            <button
              className="ctrl-btn" id="ctrl-last" title="Last Page"
              ref={el => { btnRefs.current[3] = el }}
              onMouseEnter={() => showTooltip(3)} onMouseLeave={hideTooltip}
              onClick={navLast}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5.25 4.5l7.5 7.5-7.5 7.5"/><path d="M11.25 4.5l7.5 7.5-7.5 7.5"/>
              </svg>
              <span className="sr-only">Last Page</span>
            </button>
          </li>

          <li className="ctrl-sep" aria-hidden="true" />

          <li>
            <button
              className="ctrl-btn" id="ctrl-cover" title="Cover"
              ref={el => { btnRefs.current[4] = el }}
              onMouseEnter={() => showTooltip(4)} onMouseLeave={hideTooltip}
              onClick={navCover}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/>
              </svg>
              <span className="sr-only">Cover</span>
            </button>
          </li>

          <li>
            <button
              className="ctrl-btn" id="ctrl-sound" title={soundOn ? 'Sound On' : 'Sound Off'}
              ref={el => { btnRefs.current[5] = el }}
              onMouseEnter={() => showTooltip(5)} onMouseLeave={hideTooltip}
              onClick={toggleSound}
            >
              {soundOn ? (
                <svg id="icon-sound-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"/>
                </svg>
              ) : (
                <svg id="icon-sound-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"/>
                </svg>
              )}
              <span className="sr-only">Sound</span>
            </button>
          </li>

          <li>
            <button
              className="ctrl-btn" id="ctrl-fullscreen" title="Full Screen"
              ref={el => { btnRefs.current[6] = el }}
              onMouseEnter={() => showTooltip(6)} onMouseLeave={hideTooltip}
              onClick={toggleFullscreen}
            >
              {inFs ? (
                <svg id="icon-fullscreen-exit" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"/>
                </svg>
              ) : (
                <svg id="icon-fullscreen-enter" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"/>
                </svg>
              )}
              <span className="sr-only">Full Screen</span>
            </button>
          </li>

          <li>
            <button
              className="ctrl-btn" id="ctrl-download" title="PDF download — coming soon"
              ref={el => { btnRefs.current[7] = el }}
              onMouseEnter={() => showTooltip(7)} onMouseLeave={hideTooltip}
              disabled
              style={{ opacity: 0.4, cursor: 'not-allowed' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/>
              </svg>
              <span className="sr-only">Download PDF</span>
            </button>
          </li>

        </ul>

        <div className="ctrl-pill-bg" />
      </div>
    </nav>
  )
}
