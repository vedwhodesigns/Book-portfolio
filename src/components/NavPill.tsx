import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { savePrefs } from '../lib/prefs'

interface LocalWindow {
  jQuery: (selector: string) => { data: (key: string) => DFApp | undefined }
}
interface DFApp {
  currentPageNumber: number
  viewer?: { soundOn: boolean }
  start: () => void
  end: () => void
  prev: () => void
  next: () => void
}

interface Props {
  totalPages: number
  page: number
  soundOn: boolean
  onPageChange: (p: number) => void
  onSoundChange: (on: boolean) => void
}

type ControlId = 'first' | 'prev' | 'next' | 'last' | 'cover' | 'sound' | 'fullscreen'

function getApp(): DFApp | undefined {
  return (window as unknown as LocalWindow).jQuery('#portfolio-viewer').data('dfApp')
}

// Side pill: px-[18px]*2 + 20px icon = 56px wide
const SIDE_W = 56
const BLOB_GAP = 8

export function NavPill({ totalPages, page, soundOn, onPageChange, onSoundChange }: Props) {
  const [activeId, setActiveId]   = useState<ControlId>('cover')
  const [inFs, setInFs]           = useState(false)
  const [tooltip, setTooltip]     = useState<{ label: string; x: number } | null>(null)
  const navRef                    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sync = () =>
      setInFs(!!(document.fullscreenElement || (document as { webkitFullscreenElement?: Element }).webkitFullscreenElement))
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  const activate = (id: ControlId) => setActiveId(id)

  const navFirst = () => { const app = getApp(); if (!app) return; app.start(); onPageChange(1); activate('first') }
  const navPrev  = () => { const app = getApp(); if (!app) return; app.prev(); activate('prev') }
  const navNext  = () => { const app = getApp(); if (!app) return; app.next(); activate('next') }
  const navLast  = () => { const app = getApp(); if (!app) return; app.end(); onPageChange(totalPages); activate('last') }
  const navCover = () => { const app = getApp(); if (!app) return; app.start(); onPageChange(1); activate('cover') }

  const toggleSound = () => {
    const next = !soundOn
    onSoundChange(next)
    const app = getApp()
    if (app?.viewer) app.viewer.soundOn = next
    savePrefs({ sound: next })
    activate('sound')
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
    activate('fullscreen')
  }

  const showTip = (e: React.MouseEvent<HTMLButtonElement>, label: string) => {
    const navRect = navRef.current?.getBoundingClientRect()
    const btnRect = e.currentTarget.getBoundingClientRect()
    if (!navRect) return
    setTooltip({ label, x: btnRect.left - navRect.left + btnRect.width / 2 })
  }
  const hideTip = () => setTooltip(null)

  const iconBtn = () =>
    `relative cursor-pointer border-0 bg-transparent focus:outline-none transition-colors duration-200 flex items-center justify-center p-2 rounded-full text-white/80 hover:text-white`

  return (
    <nav
      id="ctrl-nav"
      aria-label="Flipbook controls"
      style={{
        position: 'fixed',
        bottom: 'var(--nav-bottom, 32px)',
        left: '50%',
        transform: 'translateX(calc(-50% + var(--nav-offset-x, 0px))) scale(var(--nav-scale, 1))',
        transformOrigin: 'bottom center',
        zIndex: 200,
      }}
    >
      {/* SVG filter */}
      <svg aria-hidden style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        <defs>
          <filter id="gooey-bottom" x="-10%" y="-50%" width="120%" height="200%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" />
          </filter>
        </defs>
      </svg>

      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', isolation: 'isolate' }}>

        {/* Gooey blob layer — background only, no text/icons */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: -1,
            filter: 'url(#gooey-bottom)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'stretch',
          }}
        >
          <div style={{ flex: 1, background: 'rgba(19,19,19,0.9)', borderRadius: 32 }} />
          <div style={{ width: BLOB_GAP }} />
          <div style={{ width: SIDE_W, background: 'rgba(19,19,19,0.9)', borderRadius: 9999 }} />
        </div>

        {/* Main pill — transparent bg */}
        <div ref={navRef} className="relative">

          {/* Tooltip */}
          <AnimatePresence>
            {tooltip && (
              <motion.div
                key={tooltip.label}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-[calc(100%+8px)] pointer-events-none z-50"
                style={{ left: tooltip.x, transform: 'translateX(-50%)' }}
              >
                <div
                  className="rounded-xl px-3 py-1.5 text-[11px] font-medium tracking-widest uppercase text-white whitespace-nowrap"
                  style={{ background: 'rgba(19,19,19,0.9)' }}
                >
                  {tooltip.label}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div
            className="flex items-center rounded-[32px] p-1.5 relative overflow-hidden"
            style={{ background: 'transparent' }}
          >
            {/* Top gradient line */}
            <div className="absolute -top-px left-0 z-10 h-px w-full bg-linear-to-r from-transparent from-20% via-white/40 via-50% to-transparent to-80%" />

            <div className="flex items-center gap-4 px-2">

              {/* Navigation group */}
              <div className="flex items-center gap-1">
                <button onClick={navFirst} onMouseEnter={e => showTip(e, 'First')} onMouseLeave={hideTip} className={iconBtn()} aria-label="First Page">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M18.5 18 12.5 12l6-6" /><path d="M11.5 18 5.5 12l6-6" />
                  </svg>
                </button>

                <button onClick={navPrev} onMouseEnter={e => showTip(e, 'Previous')} onMouseLeave={hideTip} className={iconBtn()} aria-label="Previous Page">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M15.75 18 9.75 12l6-6" />
                  </svg>
                </button>

                <span className="text-sm font-medium text-white tabular-nums select-none px-1 whitespace-nowrap">
                  {page} of {totalPages}
                </span>

                <button onClick={navNext} onMouseEnter={e => showTip(e, 'Next')} onMouseLeave={hideTip} className={iconBtn()} aria-label="Next Page">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="m8.25 6 6 6-6 6" />
                  </svg>
                </button>

                <button onClick={navLast} onMouseEnter={e => showTip(e, 'Last')} onMouseLeave={hideTip} className={iconBtn()} aria-label="Last Page">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="m5.5 6 6 6-6 6" /><path d="m12.5 6 6 6-6 6" />
                  </svg>
                </button>
              </div>

              {/* Action group */}
              <div className="flex items-center gap-1">

                <button onClick={navCover} onMouseEnter={e => showTip(e, 'Cover')} onMouseLeave={hideTip} className={iconBtn()} aria-label="Cover">
                  {activeId === 'cover' && (
                    <motion.div layoutId="np-active" className="absolute inset-0 rounded-full bg-white/10" style={{ zIndex: -1 }} transition={{ type: 'spring', duration: 0.7 }} />
                  )}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h4.75v-4.75h3.5V20h4.75v-9.5" />
                  </svg>
                </button>

                <button onClick={toggleSound} onMouseEnter={e => showTip(e, soundOn ? 'Mute' : 'Unmute')} onMouseLeave={hideTip} className={iconBtn()} aria-label={soundOn ? 'Mute' : 'Unmute'}>
                  {activeId === 'sound' && (
                    <motion.div layoutId="np-active" className="absolute inset-0 rounded-full bg-white/10" style={{ zIndex: -1 }} transition={{ type: 'spring', duration: 0.7 }} />
                  )}
                  {soundOn ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M4 10v4h3.5L12 18V6l-4.5 4H4Z" />
                      <path d="M15.5 9.5a4 4 0 0 1 0 5" /><path d="M18.5 7a8 8 0 0 1 0 10" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M4 10v4h3.5L12 18V6l-4.5 4H4Z" />
                      <path d="m16 9 5 5" /><path d="m21 9-5 5" />
                    </svg>
                  )}
                </button>

                <button onClick={toggleFullscreen} onMouseEnter={e => showTip(e, inFs ? 'Exit Fullscreen' : 'Fullscreen')} onMouseLeave={hideTip} className={iconBtn()} aria-label="Full Screen">
                  {activeId === 'fullscreen' && (
                    <motion.div layoutId="np-active" className="absolute inset-0 rounded-full bg-white/10" style={{ zIndex: -1 }} transition={{ type: 'spring', duration: 0.7 }} />
                  )}
                  {inFs ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M9 4H4v5" /><path d="m4 4 6 6" />
                      <path d="M15 4h5v5" /><path d="m20 4-6 6" />
                      <path d="M9 20H4v-5" /><path d="m4 20 6-6" />
                      <path d="M15 20h5v-5" /><path d="m20 20-6-6" />
                    </svg>
                  )}
                </button>

              </div>
            </div>
          </div>
        </div>

        {/* Gap spacer */}
        <div style={{ width: BLOB_GAP, flexShrink: 0 }} />

        {/* Download / Print button */}
        <button
          onClick={() => window.print()}
          onMouseEnter={e => showTip(e, 'Print')}
          onMouseLeave={hideTip}
          aria-label="Print"
          className="relative flex items-center justify-center rounded-full px-[18px] py-[14px] cursor-pointer focus:outline-none text-white/80 hover:text-white transition-colors"
          style={{ background: 'transparent' }}
        >
          <div className="relative w-5 h-5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="absolute inset-0 h-5 w-5">
              <path d="M12 4v10" /><path d="m8 10 4 4 4-4" />
              <path d="M4 18.5v1.25C4 20.44 4.56 21 5.25 21h13.5c.69 0 1.25-.56 1.25-1.25V18.5" />
            </svg>
          </div>
        </button>

      </div>
    </nav>
  )
}
