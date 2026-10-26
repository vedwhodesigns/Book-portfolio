import { useEffect, useRef, type RefObject } from 'react'
import { BookEngine, type EngineState } from '../book/BookEngine'
import type { PaperSound } from '../book/paperSound'
import { BOOK } from '../content/book'

interface Props {
  engineRef: RefObject<BookEngine | null>
  sound: PaperSound
  chrome: { top: number; bottom: number }
  startPage?: string
  onState: (s: EngineState) => void
}

export function BookView({ engineRef, sound, chrome, startPage, onState }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const onStateRef = useRef(onState)
  onStateRef.current = onState

  useEffect(() => {
    if (!el.current) return
    const engine = new BookEngine(el.current, {
      book: BOOK,
      sound,
      chrome,
      startPage,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      onState: s => onStateRef.current(s),
    })
    engineRef.current = engine
    if (import.meta.env.DEV) (window as { __book?: BookEngine }).__book = engine
    return () => {
      engine.destroy()
      engineRef.current = null
    }
    // The engine is created once; chrome changes are pushed below.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    engineRef.current?.setChrome(chrome)
  }, [chrome.top, chrome.bottom]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div ref={el} className="fixed inset-0" />
      {/* Lens falloff, as in a photograph of the desk, and a little shade
          under the header and footer so their text reads over the mat. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background: [
            'linear-gradient(to bottom, rgba(10,10,9,0.55), transparent 110px)',
            'linear-gradient(to top, rgba(10,10,9,0.55), transparent 110px)',
            'radial-gradient(ellipse 80% 75% at 50% 46%, transparent 60%, rgba(0,0,0,0.22) 100%)',
          ].join(', '),
        }}
      />
    </>
  )
}
