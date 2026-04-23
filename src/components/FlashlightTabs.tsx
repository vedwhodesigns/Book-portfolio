import { Fragment, useState } from 'react'
import { motion } from 'motion/react'

interface LocalWindow {
  jQuery: (selector: string) => { data: (key: string) => DFApp | undefined }
}
interface DFApp {
  currentPageNumber: number
  viewer?: { soundOn: boolean }
  start: () => void
  end: () => void
  gotoPage?: (n: number) => void
}

function getApp(): DFApp | undefined {
  return (window as unknown as LocalWindow).jQuery('#portfolio-viewer').data('dfApp')
}

const VIBE_URL = 'https://www.instagram.com/vedwhodesigns'

const tabs = [
  { id: 'home',        label: 'HOME' },
  { id: 'about',       label: 'ABOUT' },
  { id: 'work',        label: 'WORK' },
  { id: 'i-vibe-here', label: 'I VIBED HERE' },
]

interface Props {
  activeTab?: number
  onTabChange?: (i: number) => void
  onPageChange?: (p: number) => void
}

export function FlashlightTabs({ activeTab, onTabChange, onPageChange }: Props) {
  const [localActive, setLocalActive] = useState(0)
  const [mailOpen, setMailOpen] = useState(false)

  const active = activeTab ?? localActive
  const setActive = (i: number) => { setLocalActive(i); onTabChange?.(i) }

  const handleTab = (index: number) => {
    setActive(index)
    const app = getApp()
    if (index === 0) { app?.start(); onPageChange?.(1) }
    else if (index === 1) { if (app?.gotoPage) app.gotoPage(5); else app?.start(); onPageChange?.(5) }
    else if (index === 3) { window.open(VIBE_URL, '_blank', 'noopener,noreferrer') }
  }

  return (
    <div className="flex items-center gap-3">
      <nav className="relative isolate">
        {/* p-1.5 from reference code */}
        <ul
          className="relative flex items-center overflow-hidden rounded-[32px] p-1.5 list-none m-0"
          style={{ background: 'rgba(19,19,19,0.9)' }}
        >
          {tabs.map((tab, index) => (
            <li key={tab.id} className="group relative isolate">
              {/* px-4 py-2 text-sm font-medium from reference code */}
              <button
                onClick={() => handleTab(index)}
                className={`relative z-10 px-4 py-2 text-sm font-medium transition-all duration-300 border-0 bg-transparent cursor-pointer whitespace-nowrap focus:outline-none ${
                  active === index
                    ? 'text-white [text-shadow:rgba(255,255,255,0.5)_1px_1px_12px]'
                    : 'text-white/80 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
              {active === index && (
                <Fragment>
                  <motion.div
                    layoutId="ft-pill"
                    className="absolute inset-0 rounded-full bg-white/5 group-first-of-type:rounded-l-3xl group-first-of-type:rounded-r-md group-last-of-type:rounded-l-md group-last-of-type:rounded-r-3xl"
                    style={{ zIndex: -1 }}
                    transition={{ type: 'spring', duration: 0.7 }}
                  />
                  <motion.div
                    layoutId="ft-shade"
                    className="absolute left-0 w-full rounded-full bg-white/10"
                    style={{ bottom: -90, height: 100, filter: 'blur(7px)', zIndex: -2 }}
                    transition={{ type: 'spring', duration: 0.7 }}
                  />
                </Fragment>
              )}
            </li>
          ))}
        </ul>

        {/* Top gradient line */}
        <div className="absolute -top-px z-10 h-px w-full bg-linear-to-r from-transparent from-20% via-white/60 via-50% to-transparent to-80%" />

        {/* Beam — w-1/4 for 4 tabs */}
        <div className="absolute inset-0 -bottom-px -z-10 overflow-hidden rounded-[32px]">
          <motion.div
            className="absolute inset-0 w-1/4"
            animate={{ x: `${100 * active}%` }}
            transition={{ type: 'spring', duration: 0.7 }}
          >
            <div className="h-full w-full scale-x-150 bg-linear-to-r from-transparent via-white/60 via-40% to-transparent" />
          </motion.div>
        </div>
      </nav>

      {/* Mail — p-1.5 outer to match pill height, p-2 inner, h-5 w-5 icon */}
      <a
        href="mailto:vedwhodesigns@gmail.com"
        aria-label="Contact"
        onMouseEnter={() => setMailOpen(true)}
        onMouseLeave={() => setMailOpen(false)}
        className="relative flex items-center justify-center rounded-[32px] cursor-pointer text-white hover:text-white transition-colors"
        style={{ background: 'rgba(19,19,19,0.9)' }}
      >
        <div className="relative w-5 h-5 px-[18px] py-[14px] box-content">
          <motion.svg
            xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className="absolute inset-0 h-5 w-5"
            animate={{ opacity: mailOpen ? 0 : 1, y: mailOpen ? -4 : 0, scale: mailOpen ? 0.85 : 1 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </motion.svg>
          <motion.svg
            xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className="absolute inset-0 h-5 w-5"
            animate={{ opacity: mailOpen ? 1 : 0, y: mailOpen ? 0 : 4, scale: mailOpen ? 1 : 0.85 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            <path d="M3 9.5 12 14l9-4.5" />
            <path d="M3 9.5 12 4l9 5.5" />
            <path d="M3 9.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9.5" />
          </motion.svg>
        </div>
      </a>
    </div>
  )
}
