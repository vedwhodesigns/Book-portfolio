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

  return <div ref={el} className="fixed inset-0" />
}
