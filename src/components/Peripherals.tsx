import { useRef } from 'react'
import { PAGE_DATA, type ArtifactItem } from '../lib/pageData'

interface Props {
  page: number
  transitioning: boolean
}

function buildArtifacts(items: ArtifactItem[]) {
  return items.map((item, i) => (
    <span key={i} style={{ display: 'contents' }}>
      <div className="artifact-item">
        {item.src
          ? <img src={item.src} alt={item.label} />
          : item.label}
      </div>
      {i < items.length - 1 && <span className="artifact-arrow">→</span>}
    </span>
  ))
}

export function Peripherals({ page, transitioning }: Props) {
  const idx  = Math.max(0, Math.min(page - 1, PAGE_DATA.length - 1))
  const data = PAGE_DATA[idx]

  const cls = (base: string) => transitioning ? `${base} transitioning` : base

  return (
    <>
      {/* stage-label removed */}

      <div className={cls('side-text side-text--left')} id="side-text-left" aria-hidden="true">
        <span>{data.left}</span>
      </div>
      <div className={cls('side-text side-text--right')} id="side-text-right" aria-hidden="true">
        <span>{data.right}</span>
      </div>

      <div className={cls('artifacts artifacts--top-left')}>{buildArtifacts(data.topLeft)}</div>
      <div className={cls('artifacts artifacts--top-right')}>{buildArtifacts(data.topRight)}</div>
      <div className={cls('artifacts artifacts--bottom-left')}>{buildArtifacts(data.bottomLeft)}</div>
      <div className={cls('artifacts artifacts--bottom-right')}>{buildArtifacts(data.bottomRight)}</div>
    </>
  )
}

/* Hook: manages transitioning state with delay */
export function usePeripheralTransition(page: number, delayMs = 320) {
  const prevPage      = useRef(page)
  const transRef      = useRef(false)
  const setTrans      = useRef<(v: boolean) => void>(() => {})

  return { prevPage, transRef, setTrans, delayMs }
}
