import { Fragment, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
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

interface TooltipSetting {
  left: number
  x: number
  width: number
  offsetLeft: number
  id: string | null
}

type ControlId = 'first' | 'prev' | 'next' | 'last' | 'cover' | 'sound' | 'fullscreen' | 'download'

const controls = [
  { id: 'first' as ControlId,      label: 'First Page' },
  { id: 'prev' as ControlId,       label: 'Previous Page' },
  { id: 'next' as ControlId,       label: 'Next Page' },
  { id: 'last' as ControlId,       label: 'Last Page' },
  { id: 'cover' as ControlId,      label: 'Cover' },
  { id: 'sound' as ControlId,      label: 'Sound' },
  { id: 'fullscreen' as ControlId, label: 'Full Screen' },
  { id: 'download' as ControlId,   label: 'Download' },
]

function getApp(): DFApp | undefined {
  return (window as unknown as LocalWindow).jQuery('#portfolio-viewer').data('dfApp')
}

export function NavPill({ totalPages, page, soundOn, onPageChange, onSoundChange }: Props) {
  const [activeId, setActiveId] = useState<ControlId>('cover')
  const [inFs, setInFs] = useState(false)
  const [tooltipSetting, setTooltipSetting] = useState<TooltipSetting>({
    left: 0, x: 0, width: 0, offsetLeft: 0, id: null,
  })

  const tooltipRef = useRef<HTMLDivElement>(null)

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

  const handleMouseEnter = (index: number) => {
    const listItems = tooltipRef.current?.querySelectorAll('li')
    if (!listItems?.[index]) return
    const itemWidth = listItems[index].clientWidth
    const offsetLeft = -listItems[index].offsetLeft
    const x = (itemWidth - 36) / 2
    setTooltipSetting({
      left: (index / controls.length) * 100,
      x: -x,
      width: itemWidth,
      offsetLeft,
      id: controls[index].id,
    })
  }

  const handleMouseLeave = () =>
    setTooltipSetting(prev => ({ ...prev, id: null }))

  const activate = (id: ControlId) => setActiveId(id)

  const navFirst = () => { const app = getApp(); if (!app) return; app.start(); onPageChange(1); activate('first') }
  const navPrev  = () => { document.querySelector<HTMLElement>('.df-ui-prev')?.click(); activate('prev') }
  const navNext  = () => { document.querySelector<HTMLElement>('.df-ui-next')?.click(); activate('next') }
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
    const el = document.documentElement
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

  // Keep tooltip position fresh when page/sound state changes
  useEffect(() => {
    if (!tooltipSetting.id) return
    const index = controls.findIndex(c => c.id === tooltipSetting.id)
    if (index >= 0) handleMouseEnter(index)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, soundOn])

  const btn = (id: ControlId) =>
    `relative z-10 grid h-9 w-9 place-items-center rounded-xl p-2 border-0 bg-transparent cursor-pointer transition-all duration-300 ${
      activeId === id
        ? 'text-white [text-shadow:rgba(255,255,255,0.5)_1px_1px_12px]'
        : 'text-white/70 hover:text-white'
    }`

  const ActiveDecor = ({ id }: { id: ControlId }) =>
    activeId === id ? (
      <Fragment>
        <motion.div layoutId="np-pill" className="absolute inset-0 rounded-xl bg-white/5" style={{ zIndex: -1 }} transition={{ type: 'spring', duration: 0.7 }} />
        <motion.div layoutId="np-shade" className="absolute left-0 w-full rounded-full bg-white/10" style={{ bottom: -90, height: 100, filter: 'blur(7px)', zIndex: -2 }} transition={{ type: 'spring', duration: 0.7 }} />
      </Fragment>
    ) : null

  return (
    <nav
      id="ctrl-nav"
      aria-label="Flipbook controls"
      style={{
        position: 'fixed',
        bottom: 'var(--nav-bottom, 28px)',
        left: '50%',
        transform: 'translateX(calc(-50% + var(--nav-offset-x, 0px))) scale(var(--nav-scale, 1))',
        transformOrigin: 'bottom center',
        zIndex: 200,
      }}
    >
      <div className="relative isolate">

        {/* Spatial tooltip */}
        <div
          ref={tooltipRef}
          className="absolute bottom-[calc(100%+10px)] overflow-hidden rounded-2xl bg-black/50 transition-all duration-300"
          style={{
            left: `${tooltipSetting.left}%`,
            transform: `translateX(${tooltipSetting.x}px)`,
            width: `${tooltipSetting.width}px`,
            opacity: tooltipSetting.id ? 1 : 0,
          }}
        >
          <ul className="flex transition-all duration-300" style={{ transform: `translateX(${tooltipSetting.offsetLeft}px)` }}>
            {controls.map(item => (
              <li key={item.id} className="relative isolate grid px-3 py-2">
                <span className={`text-sm text-white transition-all duration-300 ${tooltipSetting.id === item.id ? 'delay-75' : 'blur-[2px] opacity-50'}`}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Pill */}
        <ul className="relative flex items-center overflow-hidden rounded-full border border-white/20 bg-black/50 backdrop-blur-md px-4 py-2 list-none m-0">

          {/* Top gradient line */}
          <div className="absolute -top-px left-0 z-10 h-px w-full bg-linear-to-r from-transparent from-20% via-white/60 via-50% to-transparent to-80%" />

          <li className="group relative isolate">
            <button onClick={navFirst} onMouseEnter={() => handleMouseEnter(0)} onMouseLeave={handleMouseLeave} className={btn('first')} aria-label="First Page">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M18.5 18 12.5 12l6-6" /><path d="M11.5 18 5.5 12l6-6" />
              </svg>
            </button>
            <ActiveDecor id="first" />
          </li>

          <li className="group relative isolate">
            <button onClick={navPrev} onMouseEnter={() => handleMouseEnter(1)} onMouseLeave={handleMouseLeave} className={btn('prev')} aria-label="Previous Page">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M15.75 18 9.75 12l6-6" />
              </svg>
            </button>
            <ActiveDecor id="prev" />
          </li>

          <li className="px-3 text-sm font-semibold tracking-[0.04em] text-white/80 select-none tabular-nums">
            {page} / {totalPages}
          </li>

          <li className="group relative isolate">
            <button onClick={navNext} onMouseEnter={() => handleMouseEnter(2)} onMouseLeave={handleMouseLeave} className={btn('next')} aria-label="Next Page">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="m8.25 6 6 6-6 6" />
              </svg>
            </button>
            <ActiveDecor id="next" />
          </li>

          <li className="group relative isolate">
            <button onClick={navLast} onMouseEnter={() => handleMouseEnter(3)} onMouseLeave={handleMouseLeave} className={btn('last')} aria-label="Last Page">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="m5.5 6 6 6-6 6" /><path d="m12.5 6 6 6-6 6" />
              </svg>
            </button>
            <ActiveDecor id="last" />
          </li>

          <li className="mx-1 h-7 w-px bg-white/20 self-center" aria-hidden="true" />

          <li className="group relative isolate">
            <button onClick={navCover} onMouseEnter={() => handleMouseEnter(4)} onMouseLeave={handleMouseLeave} className={btn('cover')} aria-label="Cover">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h4.75v-4.75h3.5V20h4.75v-9.5" />
              </svg>
            </button>
            <ActiveDecor id="cover" />
          </li>

          <li className="group relative isolate">
            <button onClick={toggleSound} onMouseEnter={() => handleMouseEnter(5)} onMouseLeave={handleMouseLeave} className={btn('sound')} aria-label={soundOn ? 'Mute' : 'Unmute'}>
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
            <ActiveDecor id="sound" />
          </li>

          <li className="group relative isolate">
            <button onClick={toggleFullscreen} onMouseEnter={() => handleMouseEnter(6)} onMouseLeave={handleMouseLeave} className={btn('fullscreen')} aria-label="Full Screen">
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
            <ActiveDecor id="fullscreen" />
          </li>

          <li className="mx-1 h-7 w-px bg-white/20 self-center" aria-hidden="true" />

          <li className="group relative isolate">
            <button onMouseEnter={() => handleMouseEnter(7)} onMouseLeave={handleMouseLeave} disabled className="relative z-10 grid h-9 w-9 place-items-center rounded-xl p-2 border-0 bg-transparent cursor-not-allowed text-white/25" aria-label="Download">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M12 4v10" /><path d="m8 10 4 4 4-4" />
                <path d="M4 18.5v1.25C4 20.44 4.56 21 5.25 21h13.5c.69 0 1.25-.56 1.25-1.25V18.5" />
              </svg>
            </button>
          </li>

        </ul>
      </div>
    </nav>
  )
}
