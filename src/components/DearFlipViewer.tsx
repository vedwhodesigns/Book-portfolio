import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    jQuery: (selector: string) => {
      data: (key: string) => DearFlipApp | undefined
    }
    DEARFLIP: {
      Application: new (opts: Record<string, unknown>) => DearFlipApp
      defaults: { minZoom: number }
    }
  }
}

interface DearFlipApp {
  currentPageNumber: number
  viewer?: { soundOn: boolean; stage?: unknown }
  start: () => void
  end: () => void
  resize?: () => void
}

interface Props {
  pages: string[]
  startPage: number
  startSound: boolean
  onFlip: (pageNum: number) => void
  onReady: () => void
  onAppReady: (app: DearFlipApp) => void
}

const NAV_SELECTORS = '.df-ui,.df-ui-center,.df-ui-nav,.df-ui-prev,.df-ui-next,.df-ui-left,.df-ui-right,.df-control-bar,.df-sidemenu-wrapper'

function killNativeControls(): void {
  document.querySelectorAll(NAV_SELECTORS).forEach(el => {
    const e = el as HTMLElement
    e.style.setProperty('display',        'none',   'important')
    e.style.setProperty('visibility',     'hidden', 'important')
    e.style.setProperty('opacity',        '0',      'important')
    e.style.setProperty('pointer-events', 'none',   'important')
  })
}

export function DearFlipViewer({ pages, startPage, startSound, onFlip, onReady, onAppReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const initialized  = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const vPad = Math.round(window.innerHeight * 0.15)
    const hPad = Math.round(window.innerWidth  * 0.12)

    if (window.DEARFLIP) window.DEARFLIP.defaults.minZoom = 0.35

    new window.DEARFLIP.Application({
      source:              pages,
      element:             window.jQuery('#portfolio-viewer'),
      height:              window.innerHeight,
      paddingTop:          vPad,
      paddingBottom:       vPad,
      paddingLeft:         hPad,
      paddingRight:        hPad,
      backgroundColor:     '#b8b5b0',
      is3D:                true,
      has3DShadow:         true,
      hasSpiral:           true,
      spiralColor:         0xC0C0C0,
      flipbookHardPages:   'cover',
      duration:            900,
      enableSound:         startSound,
      showDownloadControl: false,
      showShareControl:    false,
      showSearchControl:   false,
      controlsPosition:    'bottom',
      autoEnableThumbnail: false,
      openPage:            startPage,
      minZoom:             0.35,
      maxZoom:             3,
      onFlip(app: DearFlipApp) {
        onFlip(app.currentPageNumber || 1)
      },
      onPagesReady() {
        onReady()
      },
    } as Record<string, unknown>)

    // Kill native controls — CSS layer handles display:none, JS layer handles runtime re-injection
    killNativeControls()
    setTimeout(() => killNativeControls(), 300)
    setTimeout(() => killNativeControls(), 800)

    const observer = new MutationObserver(mutations => {
      if (mutations.some(m => m.addedNodes.length > 0)) killNativeControls()
    })
    if (containerRef.current) {
      observer.observe(containerRef.current, { childList: true, subtree: true })
    }
    setTimeout(() => observer.disconnect(), 5000)

    // Patch Three.js renderer to fill viewport
    let attempts = 0
    const patchInterval = setInterval(() => {
      attempts++
      const dfApp = window.jQuery('#portfolio-viewer').data('dfApp')
      if (dfApp) {
        onAppReady(dfApp)
        const viewer = dfApp.viewer as { stage?: { renderer?: { setSize: (w: number, h: number) => void }; camera?: { aspect: number; updateProjectionMatrix: () => void }; cssRenderer?: { setSize: (w: number, h: number) => void } } } | undefined
        const stage = viewer?.stage
        if (stage?.renderer && stage?.camera) {
          stage.renderer.setSize(window.innerWidth, window.innerHeight)
          stage.camera.aspect = window.innerWidth / window.innerHeight
          stage.camera.updateProjectionMatrix()
          if (stage.cssRenderer) stage.cssRenderer.setSize(window.innerWidth, window.innerHeight)
          clearInterval(patchInterval)
        }
      }
      if (attempts > 30) clearInterval(patchInterval)
    }, 100)

    // Click-zone guard — block flip outside book area
    const hPadPct = window.innerWidth  * 0.12
    const vPadPct = window.innerHeight * 0.15
    const bookLeft   = hPadPct
    const bookRight  = window.innerWidth  - hPadPct
    const bookTop    = vPadPct
    const bookBottom = window.innerHeight - vPadPct

    const guardMouse = (e: MouseEvent): void => {
      if (e.clientX < bookLeft || e.clientX > bookRight ||
          e.clientY < bookTop  || e.clientY > bookBottom) {
        e.stopPropagation()
      }
    }
    const guardTouch = (e: TouchEvent): void => {
      const t = e.touches[0]
      if (t.clientX < bookLeft || t.clientX > bookRight ||
          t.clientY < bookTop  || t.clientY > bookBottom) {
        e.stopPropagation()
      }
    }

    const addGuards = (): void => {
      containerRef.current?.addEventListener('mousedown', guardMouse, { capture: true })
      containerRef.current?.addEventListener('touchstart', guardTouch, { capture: true })
    }
    setTimeout(addGuards, 1200)

    // Resize handler
    let resizeTimer: ReturnType<typeof setTimeout>
    const onResize = (): void => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        const dfApp = window.jQuery('#portfolio-viewer').data('dfApp')
        if (dfApp?.resize) dfApp.resize()
      }, 100)
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      observer.disconnect()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <div id="portfolio-viewer" ref={containerRef} />
}
