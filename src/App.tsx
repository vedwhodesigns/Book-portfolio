import { useState, useEffect, useRef, useCallback } from 'react'
import { DearFlipViewer } from './components/DearFlipViewer'
import { NavPill } from './components/NavPill'
import { Peripherals } from './components/Peripherals'
import { FlashlightTabs } from './components/FlashlightTabs'
import { generatePages } from './lib/pageGenerator'
import { loadPrefs, savePrefs } from './lib/prefs'

const TOTAL_SPREADS = 12
const DECOR_TRANSITION_MS = 320

export default function App() {
  const prefs       = loadPrefs()
  const startPage   = (prefs.page && prefs.page > 1) ? prefs.page : 1
  const startSound  = prefs.sound !== false

  const [pages]          = useState(() => generatePages(TOTAL_SPREADS))
  const [page, setPage]  = useState(startPage)
  const [soundOn, setSoundOn] = useState(startSound)
  const [transitioning, setTransitioning] = useState(false)
  const [ready, setReady] = useState(false)

  const lastPage    = useRef(startPage)
  const transTimer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const handleFlip = useCallback((pageNum: number) => {
    if (pageNum === lastPage.current) return
    lastPage.current = pageNum
    setTransitioning(true)
    clearTimeout(transTimer.current)
    transTimer.current = setTimeout(() => {
      setPage(pageNum)
      setTransitioning(false)
    }, DECOR_TRANSITION_MS)
    savePrefs({ page: pageNum })
  }, [])

  const handleSoundChange = useCallback((on: boolean) => {
    setSoundOn(on)
    savePrefs({ sound: on })
  }, [])

  // Safety preloader fallback
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 5000)
    return () => clearTimeout(t)
  }, [])

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  document.querySelector<HTMLElement>('.df-ui-prev')?.click()
      if (e.key === 'ArrowRight') document.querySelector<HTMLElement>('.df-ui-next')?.click()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      {!ready && (
        <div id="preloader" aria-label="Loading portfolio">
          <div className="preloader-inner">
            <div className="preloader-spinner" />
            <div className="preloader-text">LOADING PORTFOLIO</div>
          </div>
        </div>
      )}

      <div style={{ position: 'fixed', top: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 200 }}>
        <FlashlightTabs onPageChange={setPage} />
      </div>

      <Peripherals page={page} transitioning={transitioning} />

      <DearFlipViewer
        pages={pages}
        startPage={startPage}
        startSound={startSound}
        onFlip={handleFlip}
        onReady={() => setReady(true)}
        onAppReady={() => {}}
      />

      <NavPill
        totalPages={pages.length}
        page={page}
        soundOn={soundOn}
        onPageChange={setPage}
        onSoundChange={handleSoundChange}
      />
    </>
  )
}
