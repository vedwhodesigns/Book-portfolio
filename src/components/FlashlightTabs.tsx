import { Fragment, useState } from 'react'
import { motion } from 'motion/react'

const tabs = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'work', label: 'Work' },
  { id: 'i-vibe-here', label: 'I Vibe here' },
]

interface Props {
  activeTab?: number
  onTabChange?: (i: number) => void
}

export function FlashlightTabs({ activeTab, onTabChange }: Props) {
  const [localActive, setLocalActive] = useState(0)
  const [mailOpen, setMailOpen] = useState(false)

  const active = activeTab ?? localActive
  const setActive = (i: number) => {
    setLocalActive(i)
    onTabChange?.(i)
  }

  return (
    <div className="flex items-center gap-3">
      <nav className="relative isolate">
        <ul className="relative flex overflow-hidden rounded-full border border-white/20 bg-black/50 backdrop-blur-md p-1.5 list-none m-0">
          {tabs.map((tab, index) => (
            <li key={tab.id} className="group relative isolate">
              <button
                onClick={() => setActive(index)}
                className={`relative z-10 px-4 py-2 text-sm font-medium transition-all duration-300 border-0 bg-transparent cursor-pointer whitespace-nowrap ${
                  active === index
                    ? 'text-white [text-shadow:rgba(255,255,255,0.5)_1px_1px_12px]'
                    : 'text-white/70 hover:text-white'
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

        {/* Beam */}
        <div className="absolute inset-0 -bottom-px -z-10 overflow-hidden rounded-full">
          <motion.div
            className="absolute inset-0 w-1/4"
            animate={{ x: `${100 * active}%` }}
            transition={{ type: 'spring', duration: 0.7 }}
          >
            <div className="h-full w-full scale-x-150 bg-linear-to-r from-transparent via-white/60 via-40% to-transparent" />
          </motion.div>
        </div>
      </nav>

      {/* Mail button */}
      <div className="rounded-full border border-white/20 bg-black/50 backdrop-blur-md p-1.5">
        <button
          type="button"
          aria-label="Contact"
          onMouseEnter={() => setMailOpen(true)}
          onMouseLeave={() => setMailOpen(false)}
          className="group relative grid h-9 w-9 place-items-center rounded-full text-white/90 transition-colors hover:text-white cursor-pointer border-0 bg-transparent"
        >
          {/* Top gradient line on mail button */}
          <div className="absolute -top-[7px] left-0 z-10 h-px w-full bg-linear-to-r from-transparent from-20% via-white/60 via-50% to-transparent to-80%" />

          <motion.svg
            xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className="absolute h-5 w-5"
            animate={{ opacity: mailOpen ? 0 : 1, y: mailOpen ? -4 : 0, scale: mailOpen ? 0.85 : 1 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </motion.svg>

          <motion.svg
            xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className="absolute h-5 w-5"
            animate={{ opacity: mailOpen ? 1 : 0, y: mailOpen ? 0 : 4, scale: mailOpen ? 1 : 0.85 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            <path d="M3 9.5 12 14l9-4.5" />
            <path d="M3 9.5 12 4l9 5.5" />
            <path d="M3 9.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9.5" />
          </motion.svg>
        </button>
      </div>
    </div>
  )
}
