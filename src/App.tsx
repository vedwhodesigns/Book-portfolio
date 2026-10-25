import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BookEngine, EngineState } from './book/BookEngine'
import { PaperSound } from './book/paperSound'
import { BookText } from './components/BookText'
import { BookView } from './components/BookView'
import { Chrome, type Chapter } from './components/Chrome'
import { BOOK } from './content/book'
import { loadPrefs, savePrefs } from './lib/prefs'

const CHAPTERS: Chapter[] = [
  { label: 'Index', pageId: 'contents', section: 'Index' },
  { label: 'About', pageId: 'vellum-about', section: 'About' },
  { label: 'Work', pageId: 'vellum-work', section: 'Work' },
  { label: 'Playground', pageId: 'vellum-playground', section: 'Playground' },
  { label: 'Résumé', pageId: 'resume-experience', section: 'Résumé' },
  { label: 'Contact', pageId: 'closing', section: 'Contact' },
]

const TOTAL_PAGES = 2 + BOOK.spreads.length * 2

const FONTS = ['300 40px "Inter Tight"', '400 20px "Inter Tight"', '400 14px "IBM Plex Mono"', '400 40px "Instrument Serif"', 'italic 400 40px "Instrument Serif"']

/** Page artwork is drawn to canvas, so fonts must be ready before the first page is. */
function useFontsReady() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const timeout = new Promise(r => setTimeout(r, 4000))
    void Promise.race([Promise.all(FONTS.map(f => document.fonts.load(f))), timeout]).then(() => setReady(true))
  }, [])
  return ready
}

function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight })
  const [vp, setVp] = useState(read)
  useEffect(() => {
    const on = () => setVp(read())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return vp
}

export default function App() {
  const prefs = useMemo(loadPrefs, [])
  const fontsReady = useFontsReady()
  const engine = useRef<BookEngine | null>(null)
  const sound = useMemo(() => new PaperSound(), [])
  const [state, setState] = useState<EngineState | null>(null)
  const [soundOn, setSoundOn] = useState(prefs.sound !== false)
  const [hinted, setHinted] = useState(!!prefs.hinted)
  const firstTurned = useRef<number | null>(null)
  const vp = useViewport()

  const compact = vp.h < 520 || vp.w < 420
  const chrome = useMemo(() => (compact ? { top: 48, bottom: 52 } : { top: 64, bottom: 68 }), [compact])
  const touch = useMemo(() => window.matchMedia('(pointer: coarse)').matches, [])

  sound.enabled = soundOn

  const onState = useCallback((s: EngineState) => {
    setState(s)
    const page = s.overlay ? undefined : (s.right ?? s.left)?.spec.id
    if (page) savePrefs({ page })
    if (firstTurned.current === null) firstTurned.current = s.turned
    else if (s.turned !== firstTurned.current) {
      setHinted(true)
      savePrefs({ hinted: true })
    }
  }, [])

  const toggleSound = () => {
    const on = !soundOn
    setSoundOn(on)
    savePrefs({ sound: on })
    if (on) sound.unlock()
  }

  const hint = hinted ? null : touch ? 'Swipe to turn' : 'Drag a corner to turn'

  return (
    <div style={{ ['--chrome-top' as string]: `${chrome.top}px`, ['--chrome-bottom' as string]: `${chrome.bottom}px` }}>
      {fontsReady && <BookView engineRef={engine} sound={sound} chrome={chrome} startPage={prefs.page} onState={onState} />}
      <Chrome
        state={state}
        chapters={CHAPTERS}
        totalPages={TOTAL_PAGES}
        soundOn={soundOn}
        hint={hint}
        compact={compact}
        onPrev={() => { sound.unlock(); engine.current?.prev() }}
        onNext={() => { sound.unlock(); engine.current?.next() }}
        onChapter={id => { sound.unlock(); engine.current?.goToPage(id) }}
        onSound={toggleSound}
      />
      <div
        className={`pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-ink transition-opacity duration-700 ${state ? 'opacity-0' : 'opacity-100'}`}
        aria-hidden={!!state}
      >
        <span className="animate-pulse font-mono text-[11px] uppercase tracking-[0.12em] text-paper/50">Opening the book</span>
      </div>
      <BookText />
    </div>
  )
}
