// Renders a PageSpec into a canvas. Everything is laid out in design units on
// a 1000 × 1389 page (aspect 0.72) and scaled to the requested texture size.
import type { Hotspot, PageSpec, SleeveItem } from './types'
import {
  applyGrain, drawImage, font, FONT_MONO, FONT_SANS, FONT_SERIF, INK, label, makeCanvas, MUTED, PAPER, paragraph, rng, tracked,
} from './art'

export const PAGE_W = 1000
export const PAGE_H = 1389
export const PAGE_ASPECT = PAGE_W / PAGE_H

export type Side = 'recto' | 'verso'

export interface PageRender {
  canvas: HTMLCanvasElement
  hotspots: Hotspot[]
}

interface Frame {
  ctx: CanvasRenderingContext2D
  side: Side
  folio: number | null
  /** Content box, mirrored so the wider margin sits at the gutter. */
  x0: number
  x1: number
  hot: Hotspot[]
  /** Grain size compensation for the texture scale. */
  px: number
}

const HAIRLINE = 'rgba(28,27,25,0.22)'

export function renderPage(spec: PageSpec, side: Side, folio: number | null, texW: number): PageRender {
  const texH = Math.round(texW / PAGE_ASPECT)
  const [canvas, ctx] = makeCanvas(texW, texH)
  const k = texW / PAGE_W
  ctx.scale(k, k)
  const gutter = 96, outer = 72
  const f: Frame = {
    ctx, side, folio, hot: [], px: 1 / k,
    x0: side === 'recto' ? gutter : outer,
    x1: side === 'recto' ? PAGE_W - outer : PAGE_W - gutter,
  }
  ctx.textBaseline = 'alphabetic'
  DRAW[spec.kind](f, spec as never)
  if (spec.kind !== 'sleeve') gutterShade(f, spec.kind === 'vellum')
  return { canvas, hotspots: f.hot }
}

/** Plain stock: the reverse of single-sided pages and a stand-in while artwork loads. */
export function renderPlain(texW: number): HTMLCanvasElement {
  const texH = Math.round(texW / PAGE_ASPECT)
  const [canvas, ctx] = makeCanvas(texW, texH)
  const k = texW / PAGE_W
  ctx.scale(k, k)
  paperBase({ ctx, side: 'recto', folio: null, hot: [], px: 1 / k, x0: 0, x1: PAGE_W }, 37)
  return canvas
}

// ---------------------------------------------------------------------------
// Shared pieces

function paperBase(f: Frame, seed: number) {
  const { ctx } = f
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)
  // Large, faint tonal drift so the sheet never reads as flat white.
  const r = rng(seed)
  for (let i = 0; i < 3; i++) {
    const g = ctx.createRadialGradient(r() * PAGE_W, r() * PAGE_H, 0, r() * PAGE_W, r() * PAGE_H, 700)
    g.addColorStop(0, r() > 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(120,110,95,0.05)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, PAGE_W, PAGE_H)
  }
  // Just enough noise to dither the gradients; the real grain is in the material.
  applyGrain(ctx, PAGE_W, PAGE_H, 0.05, f.px)
}

function darkBase(f: Frame, light: [number, number]) {
  const { ctx } = f
  ctx.fillStyle = '#0e0e0d'
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)
  const g = ctx.createRadialGradient(light[0], light[1], 0, light[0], light[1], 1100)
  g.addColorStop(0, 'rgba(200,198,193,0.55)')
  g.addColorStop(0.45, 'rgba(90,89,86,0.25)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)
  applyGrain(ctx, PAGE_W, PAGE_H, 0.35, f.px * 1.4)
}

/** Darkening toward the spine: sells the curve of the paper into the binding. */
function gutterShade(f: Frame, soft: boolean) {
  const { ctx, side } = f
  const gx = side === 'recto' ? 0 : PAGE_W
  const dir = side === 'recto' ? 1 : -1
  const g = ctx.createLinearGradient(gx, 0, gx + dir * 110, 0)
  g.addColorStop(0, `rgba(0,0,0,${soft ? 0.05 : 0.16})`)
  g.addColorStop(0.35, `rgba(0,0,0,${soft ? 0.02 : 0.05})`)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(Math.min(gx, gx + dir * 110), 0, 110, PAGE_H)
}

function runningHeads(f: Frame, left: string, right: string, color = MUTED) {
  label(f.ctx, left, f.x0, 78, 13, color)
  label(f.ctx, right, f.x1, 78, 13, color, 'right')
}

function folio(f: Frame, inner: string, color = MUTED) {
  if (f.folio == null) return
  const n = String(f.folio).padStart(2, '0')
  if (f.side === 'recto') {
    label(f.ctx, inner, f.x0, PAGE_H - 52, 12, color)
    label(f.ctx, n, f.x1, PAGE_H - 52, 12, color, 'right')
  } else {
    label(f.ctx, n, f.x0, PAGE_H - 52, 12, color)
    label(f.ctx, inner, f.x1, PAGE_H - 52, 12, color, 'right')
  }
}

function rule(f: Frame, x0: number, x1: number, y: number, color = HAIRLINE) {
  f.ctx.fillStyle = color
  f.ctx.fillRect(x0, y, x1 - x0, 1.2)
}

function link(f: Frame, text: string, href: string, x: number, y: number, size: number, align: 'left' | 'right' = 'left') {
  const { ctx } = f
  ctx.font = font(FONT_SANS, size, 400)
  ctx.fillStyle = INK
  const w = ctx.measureText(text).width
  const lx = align === 'left' ? x : x - w
  ctx.fillText(text, lx, y)
  ctx.fillRect(lx, y + size * 0.22, w, 1.2)
  f.hot.push({ x: lx - 10, y: y - size - 8, w: w + 20, h: size * 1.6 + 16, href })
  return w
}

/** Light, staggered display type — the signature of the book. */
function staggered(f: Frame, lines: string[], top: number, size: number, color = INK, glow = false) {
  const { ctx } = f
  ctx.font = font(FONT_SANS, size, 300)
  ctx.fillStyle = color
  if (glow) {
    ctx.shadowColor = 'rgba(255,255,255,0.45)'
    ctx.shadowBlur = (size * 0.35) / f.px
  }
  lines.forEach((line, i) => {
    const y = top + i * size * 1.06
    const short = line.length <= 2
    if (i === 0) tracked(ctx, line, f.x0, y, -size * 0.02)
    else tracked(ctx, line, f.x1 - (short ? size * 1.6 : 0), y, -size * 0.02, 'right')
  })
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'
}

function framedImage(f: Frame, spec: Parameters<typeof drawImage>[1], x: number, y: number, w: number, h: number, capL: string, capR: string) {
  const { ctx } = f
  ctx.strokeStyle = HAIRLINE
  ctx.lineWidth = 1.2
  ctx.strokeRect(x, y, w, h + 46)
  drawImage(ctx, spec, x + 10, y + 10, w - 20, h - 10)
  label(ctx, capL, x + 14, y + h + 30, 11, MUTED)
  label(ctx, capR, x + w - 14, y + h + 30, 11, MUTED, 'right')
}

// ---------------------------------------------------------------------------
// Plastic sleeve contents

function itemHeight(it: SleeveItem) {
  return it.type === 'photo' ? it.w * 1.28 : it.type === 'polaroid' ? it.w * 1.2 : it.type === 'note' ? it.w * 0.72 : it.type === 'ticket' ? it.w * 0.42 : it.w * 2.4
}

/** Draws one item centred on its position. `back` draws the reverse side. */
function sleeveItem(f: Frame, it: SleeveItem, back: boolean, onBlack: boolean, painted: boolean) {
  const { ctx } = f
  const k = 1 / f.px
  const w = it.w, h = itemHeight(it)
  ctx.save()
  ctx.translate(it.x, it.y)
  ctx.rotate((it.rot * Math.PI) / 180)
  const shadow = () => {
    if (!painted) return
    ctx.shadowColor = onBlack ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.32)'
    ctx.shadowBlur = 22 * k
    ctx.shadowOffsetX = 4 * k
    ctx.shadowOffsetY = 10 * k
  }
  const noShadow = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0 }
  const sheet = (color: string) => { shadow(); ctx.fillStyle = color; ctx.fillRect(-w / 2, -h / 2, w, h); noShadow() }

  if (it.type === 'clip') {
    if (!back) {
      shadow()
      const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0)
      g.addColorStop(0, '#8d8d8a'); g.addColorStop(0.45, '#f4f4f1'); g.addColorStop(1, '#7a7a77')
      ctx.strokeStyle = g
      ctx.lineWidth = w * 0.12
      ctx.lineCap = 'round'
      ctx.beginPath()
      // Classic two-loop paper clip.
      const r1 = w / 2, r2 = w * 0.32
      ctx.moveTo(r2, h * 0.25)
      ctx.lineTo(r2, -h / 2 + r2)
      ctx.arc(0, -h / 2 + r2, r2, 0, Math.PI, true)
      ctx.lineTo(-r2, h / 2 - r1)
      ctx.arc(0, h / 2 - r1, r1 * 0.94, Math.PI, 0, true)
      ctx.lineTo(r1 * 0.94, -h / 2 + r1 * 1.2)
      ctx.stroke()
      noShadow()
    }
  } else if (back) {
    // Reverse sides: plain stock with a faint backprint.
    sheet(it.type === 'ticket' ? '#c4b28f' : it.type === 'polaroid' ? '#dcdad4' : '#d9d5cd')
    label(ctx, it.type === 'polaroid' ? 'Instant film' : it.type === 'photo' ? 'Photo paper — archival' : '', 0, 0, w * 0.035, 'rgba(0,0,0,0.25)', 'center')
  } else if (it.type === 'photo') {
    sheet('#d8d6d1')
    drawImage(ctx, it.image ?? { seed: 1, tone: 'stone' }, -w / 2, -h / 2, w, h)
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2)
    g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.4, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(-w / 2, -h / 2, w, h)
  } else if (it.type === 'polaroid') {
    sheet('#f5f4f0')
    const m = w * 0.065
    drawImage(ctx, it.image ?? { seed: 2, tone: 'smoke' }, -w / 2 + m, -h / 2 + m, w - 2 * m, w - 2 * m)
    if (it.text) {
      ctx.font = font(FONT_SERIF, w * 0.085, 400, 'italic')
      ctx.fillStyle = '#2b2a27'
      ctx.fillText(it.text, -w / 2 + m * 1.4, h / 2 - h * 0.075)
    }
  } else if (it.type === 'note') {
    sheet('#f3f1eb')
    ctx.font = font(FONT_SANS, w * 0.058, 400)
    ctx.fillStyle = INK
    paragraph(ctx, it.text ?? '', -w / 2 + w * 0.08, -h / 2 + w * 0.13, w * 0.84, w * 0.074)
    label(ctx, 'N° 01', -w / 2 + w * 0.08, h / 2 - w * 0.07, w * 0.026, MUTED)
  } else if (it.type === 'ticket') {
    sheet('#d6c39e')
    ctx.setLineDash([w * 0.012, w * 0.012])
    ctx.strokeStyle = 'rgba(60,40,20,0.5)'
    ctx.lineWidth = w * 0.006
    ctx.beginPath()
    ctx.moveTo(w * 0.22, -h / 2)
    ctx.lineTo(w * 0.22, h / 2)
    ctx.stroke()
    ctx.setLineDash([])
    label(ctx, it.text ?? 'Admit one', -w / 2 + w * 0.06, -h * 0.05, w * 0.04, '#3b2b1a')
    label(ctx, 'No. 0042', -w / 2 + w * 0.06, h * 0.25, w * 0.032, 'rgba(59,43,26,0.7)')
    label(ctx, '01', w * 0.36, h * 0.08, w * 0.07, '#3b2b1a', 'center')
  }
  ctx.restore()
}

function drawSleeve(f: Frame, s: Extract<PageSpec, { kind: 'sleeve' }>) {
  const { ctx } = f
  const front = f.side === 'recto'
  const spine = front ? 0 : PAGE_W
  const dir = front ? 1 : -1
  const STRIP = 66
  // Clear areas stay fully transparent: the film is a real material drawn on top.
  // Backing card inside the pocket.
  const bx0 = front ? STRIP + 18 : 24, bx1 = front ? PAGE_W - 24 : PAGE_W - STRIP - 18
  if (s.backing !== 'clear') {
    ctx.fillStyle = s.backing === 'black' ? '#141414' : '#ebe8e1'
    ctx.fillRect(bx0, 22, bx1 - bx0, PAGE_H - 44)
    ctx.save()
    ctx.beginPath()
    ctx.rect(bx0, 22, bx1 - bx0, PAGE_H - 44)
    ctx.clip()
    applyGrain(ctx, PAGE_W, PAGE_H, s.backing === 'black' ? 0.25 : 0.14, f.px * 1.3)
    ctx.restore()
  }
  // From behind, a backing card hides the items; a clear sleeve shows their reverse sides.
  const mirrored = s.backing === 'clear' ? s.items.map(it => ({ ...it, x: PAGE_W - it.x, rot: -it.rot })) : []
  const items = front ? s.items : s.backItems ?? mirrored
  const derivedBack = !front && !s.backItems
  // Items in a clear sleeve get real shadows from the scene; on a card they're painted.
  for (const it of items) sleeveItem(f, it, derivedBack, s.backing === 'black', s.backing !== 'clear')

  // Welded seams: serrated along the bottom and beside the strip.
  ctx.fillStyle = 'rgba(232,232,228,1)'
  for (let x = 0; x < PAGE_W; x += 7) ctx.fillRect(x, PAGE_H - 9, 3.5, 4)
  const sx = spine + dir * STRIP
  for (let y = 0; y < PAGE_H; y += 7) ctx.fillRect(sx - (front ? 0 : 4), y, 4, 3.5)

  // Reinforced binding strip with punched holes.
  const stripX = front ? 0 : PAGE_W - STRIP
  ctx.fillStyle = '#f1f1ee'
  ctx.fillRect(stripX, 0, STRIP, PAGE_H)
  ctx.fillStyle = 'rgba(0,0,0,0.05)'
  for (let x = stripX + 4; x < stripX + STRIP; x += 5) ctx.fillRect(x, 0, 0.8, PAGE_H)
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  const hx = spine + dir * 30
  for (let i = 0; i < 11; i++) {
    const y = 90 + i * ((PAGE_H - 180) / 10)
    ctx.beginPath()
    if (i % 2) ctx.roundRect(hx - 10, y - 20, 20, 40, 10)
    else ctx.arc(hx, y, 10.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Templates

type Spec<K extends PageSpec['kind']> = Extract<PageSpec, { kind: K }>
type Drawers = { [K in PageSpec['kind']]: (f: Frame, s: Spec<K>) => void }

const DRAW: Drawers = {
  cover(f, s) {
    darkBase(f, [PAGE_W * 0.35, PAGE_H * 0.18])
    label(f.ctx, s.eyebrow, f.x0, 78, 13, 'rgba(240,238,233,0.7)')
    label(f.ctx, 'No. 01', f.x1, 78, 13, 'rgba(240,238,233,0.7)', 'right')
    label(f.ctx, 'Vedant Parikh', f.x0, 1010, 13, 'rgba(240,238,233,0.75)')
    const { ctx } = f
    ctx.font = font(FONT_SANS, 82, 300)
    ctx.fillStyle = '#f3f1ec'
    ctx.shadowColor = 'rgba(255,255,255,0.5)'
    ctx.shadowBlur = 26 / f.px
    s.titleLines.forEach((line, i) => tracked(ctx, line, f.x0 + i * 52, 1100 + i * 88, -1.5))
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'
    label(ctx, s.footerLeft, f.x0, PAGE_H - 52, 12, 'rgba(240,238,233,0.55)')
    label(ctx, s.footerRight, f.x1, PAGE_H - 52, 12, 'rgba(240,238,233,0.55)', 'right')
  },

  backCover(f, s) {
    darkBase(f, [PAGE_W * 0.7, PAGE_H * 0.85])
    s.lines.forEach((line, i) => label(f.ctx, line, PAGE_W / 2, PAGE_H / 2 + i * 26, 12, 'rgba(240,238,233,0.6)', 'center'))
  },

  fullImage(f, s) {
    drawImage(f.ctx, s.image, 0, 0, PAGE_W, PAGE_H)
    s.captionLines.forEach((line, i) => label(f.ctx, line, f.x0, PAGE_H - 74 + i * 20, 11, 'rgba(245,243,238,0.85)'))
  },

  contents(f, s) {
    paperBase(f, 3)
    runningHeads(f, 'Index', 'Book Portfolio')
    rule(f, f.x0, f.x1, 96)
    staggered(f, [s.title], 290, 92)
    let y = 520
    for (const e of s.entries) {
      rule(f, f.x0, f.x1, y - 46)
      label(f.ctx, e.num, f.x0, y, 13, MUTED)
      f.ctx.font = font(FONT_SANS, 34, 300)
      f.ctx.fillStyle = INK
      f.ctx.fillText(e.title, f.x0 + 120, y + 2)
      label(f.ctx, `Page ${e.page}`, f.x1, y, 13, MUTED, 'right')
      y += 84
    }
    rule(f, f.x0, f.x1, y - 46)
    f.ctx.font = font(FONT_MONO, 13, 400)
    f.ctx.fillStyle = MUTED
    paragraph(f.ctx, s.note.toUpperCase(), f.x0 + (f.x1 - f.x0) * 0.45, 1150, (f.x1 - f.x0) * 0.55, 21)
    folio(f, 'Contents')
  },

  chapterTitle(f, s) {
    paperBase(f, 5)
    rule(f, f.x0, f.x1, 52)
    runningHeads(f, s.chapter, s.running)
    staggered(f, s.titleLines, 330, 74)
    const lx = f.x0 + 210
    label(f.ctx, 'Sections', f.x0, 770, 12, INK)
    for (const [i, sec] of s.sections.entries()) {
      label(f.ctx, sec.label, lx, 770 + i * 30, 12, MUTED)
      label(f.ctx, sec.page, f.x1, 770 + i * 30, 12, MUTED, 'right')
    }
    rule(f, lx, f.x1, 790 + (s.sections.length - 1) * 30)
    label(f.ctx, 'Overview', f.x0, 940, 12, INK)
    f.ctx.font = font(FONT_SANS, 21, 400)
    f.ctx.fillStyle = '#3d3b37'
    let y = paragraph(f.ctx, s.overview, lx, 940, f.x1 - lx, 30, { justify: true })
    y += 40
    for (const d of s.details) {
      rule(f, lx, f.x1, y - 30)
      label(f.ctx, d.label, f.x0, y, 12, INK)
      if (d.href) link(f, d.value, d.href, lx, y + 2, 21)
      else {
        f.ctx.font = font(FONT_SANS, 21, 400)
        f.ctx.fillStyle = INK
        f.ctx.fillText(d.value, lx, y + 2)
      }
      y += 58
    }
    folio(f, s.running)
  },

  opener(f, s) {
    drawImage(f.ctx, s.image, 0, 0, PAGE_W, PAGE_H)
    const g = f.ctx.createLinearGradient(0, PAGE_H * 0.45, 0, PAGE_H)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.75)')
    f.ctx.fillStyle = g
    f.ctx.fillRect(0, 0, PAGE_W, PAGE_H)
    label(f.ctx, s.chapter, f.x0 + 40, 1010, 13, 'rgba(240,238,233,0.8)')
    const { ctx } = f
    ctx.font = font(FONT_SANS, 76, 300)
    ctx.fillStyle = '#f3f1ec'
    ctx.shadowColor = 'rgba(255,255,255,0.5)'
    ctx.shadowBlur = 24 / f.px
    s.titleLines.forEach((line, i) => tracked(ctx, line, f.x0 + 40 + i * 48, 1095 + i * 82, -1.5))
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'
    s.captionLines.forEach((line, i) => label(ctx, line, f.x0, PAGE_H - 74 + i * 20, 11, 'rgba(245,243,238,0.7)'))
  },

  projectText(f, s) {
    paperBase(f, 9)
    const w = (f.x1 - f.x0) * 0.56
    framedImage(f, s.image, f.x0, 64, w, 430, s.captionLeft, s.captionRight)
    label(f.ctx, s.chapter, f.x1, 82, 12, MUTED, 'right')
    f.ctx.font = font(FONT_SANS, 30, 400)
    f.ctx.fillStyle = INK
    f.ctx.textAlign = 'right'
    f.ctx.fillText(s.running, f.x1, 124)
    f.ctx.textAlign = 'left'
    f.ctx.font = font(FONT_SANS, 19, 400)
    f.ctx.fillStyle = '#4a4843'
    let y = 760
    s.paragraphs.forEach((p, i) => {
      y = paragraph(f.ctx, p, f.x0, y, w, 25.5, { justify: true, indent: i === 0 ? 70 : 0 }) + (i === 0 ? 70 : 40)
    })
    folio(f, s.running)
  },

  projectVisual(f, s) {
    paperBase(f, 13)
    const cw = f.x1 - f.x0
    f.ctx.font = font(FONT_SANS, 17, 400)
    f.ctx.fillStyle = '#4a4843'
    paragraph(f.ctx, s.intro, f.x0, 112, cw * 0.44, 23, { justify: true })
    label(f.ctx, s.chapter, f.x0, 82, 12, MUTED)
    framedImage(f, s.image, f.x0 + cw * 0.52, 64, cw * 0.48, 360, s.captionLeft, s.captionRight)
    const { ctx } = f
    ctx.font = font(FONT_SERIF, 52, 400)
    ctx.fillStyle = 'rgba(28,27,25,0.82)'
    ctx.textAlign = 'center'
    const lines = (() => {
      ctx.textAlign = 'left'
      const out: string[] = []
      let line = ''
      for (const word of s.quote.split(' ')) {
        const t = line ? `${line} ${word}` : word
        if (ctx.measureText(t).width > cw * 0.82 && line) { out.push(line); line = word } else line = t
      }
      if (line) out.push(line)
      return out
    })()
    ctx.textAlign = 'center'
    lines.forEach((line, i) => ctx.fillText(line, f.x0 + cw / 2, 640 + i * 54))
    ctx.textAlign = 'left'
    // Image band bleeding off the outer edge.
    const [bx, bw] = f.side === 'recto' ? [f.x0 - 30, PAGE_W - f.x0 + 30] : [0, f.x1 + 30]
    drawImage(ctx, { ...s.image, seed: s.image.seed + 3 }, bx, 880, bw, 400)
    folio(f, s.captionRight)
  },

  grid(f, s) {
    paperBase(f, 17)
    runningHeads(f, s.chapter, s.running)
    rule(f, f.x0, f.x1, 96)
    staggered(f, [s.title], 240, 70)
    f.ctx.font = font(FONT_SANS, 19, 400)
    f.ctx.fillStyle = '#4a4843'
    paragraph(f.ctx, s.text, f.x0, 310, (f.x1 - f.x0) * 0.62, 26)
    const gap = 18, cw = f.x1 - f.x0, tw = (cw - gap) / 2, th = tw * 1.18
    s.tiles.forEach((t, i) => {
      const x = f.x0 + (i % 2) * (tw + gap), y = 430 + Math.floor(i / 2) * (th + gap)
      drawImage(f.ctx, t, x, y, tw, th)
      label(f.ctx, `Study 0${i + 1}`, x + 14, y + th - 16, 11, 'rgba(245,243,238,0.85)')
    })
    if (s.link) link(f, `→ ${s.link.label}`, s.link.href, f.x0, 1290, 20)
    folio(f, s.running)
  },

  list(f, s) {
    paperBase(f, 19)
    runningHeads(f, s.chapter, s.running)
    rule(f, f.x0, f.x1, 96)
    staggered(f, [s.title], 250, 80)
    let y = 420
    for (const g of s.groups) {
      label(f.ctx, g.heading, f.x0, y, 12, INK)
      y += 64
      for (const r of g.rows) {
        rule(f, f.x0, f.x1, y - 40)
        label(f.ctx, r.left, f.x0, y, 12, MUTED)
        if (r.mid) {
          f.ctx.font = font(FONT_SANS, 26, 300)
          f.ctx.fillStyle = INK
          f.ctx.fillText(r.mid, f.x0 + 200, y + 2)
        }
        label(f.ctx, r.right, f.x1, y, 12, MUTED, 'right')
        y += 68
      }
      rule(f, f.x0, f.x1, y - 40)
      y += 70
    }
    if (s.link) link(f, `→ ${s.link.label}`, s.link.href, f.x0, Math.max(y + 20, 1160), 22)
    folio(f, s.running)
  },

  closing(f, s) {
    paperBase(f, 23)
    rule(f, f.x0, f.x1, 52)
    runningHeads(f, 'Contact', 'Book Portfolio')
    staggered(f, s.titleLines, 340, 96)
    f.ctx.font = font(FONT_SANS, 21, 400)
    f.ctx.fillStyle = '#3d3b37'
    paragraph(f.ctx, s.text, f.x0, 820, (f.x1 - f.x0) * 0.6, 30)
    let y = 1000
    for (const l of s.links) {
      rule(f, f.x0, f.x1, y - 40)
      link(f, `→ ${l.label}`, l.href, f.x0, y, 23)
      y += 70
    }
    rule(f, f.x0, f.x1, y - 40)
    folio(f, 'Contact')
  },

  colophon(f, s) {
    paperBase(f, 29)
    s.lines.forEach((line, i) => label(f.ctx, line, f.x0, 1120 + i * 24, 12, i === 0 ? INK : MUTED))
  },

  sleeve: drawSleeve,

  vellum(f, s) {
    // Ink on white. The material makes the sheet translucent and blurs
    // whatever lies beneath; the print itself stays crisp on the surface.
    const { ctx } = f
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, PAGE_W, PAGE_H)
    // Formation: the cloudy, uneven fibre density you see when tracing paper
    // is held to the light. Denser patches transmit a little less.
    const r = rng(43)
    for (let i = 0; i < 140; i++) {
      const x = r() * PAGE_W, y = r() * PAGE_H, rad = 30 + r() * 140
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
      g.addColorStop(0, `rgba(90,88,82,${0.025 + r() * 0.045})`)
      g.addColorStop(1, 'rgba(90,88,82,0)')
      ctx.fillStyle = g
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
    }
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(120,116,108,${0.03 + r() * 0.05})`
      ctx.save()
      ctx.translate(r() * PAGE_W, r() * PAGE_H)
      ctx.rotate(r() * Math.PI)
      ctx.fillRect(0, 0, 4 + r() * 18, 0.8)
      ctx.restore()
    }
    label(ctx, s.chapter, f.x0, 82, 13, 'rgba(28,27,25,0.85)')
    label(ctx, 'Interleaf', f.x1, 82, 13, 'rgba(28,27,25,0.85)', 'right')
    ctx.font = font(FONT_MONO, 13, 400)
    ctx.fillStyle = 'rgba(28,27,25,0.75)'
    paragraph(ctx, s.note.toUpperCase(), f.x0, 140, (f.x1 - f.x0) * 0.5, 20)
    ctx.font = font(FONT_SERIF, 150, 400)
    ctx.fillStyle = '#1a1917'
    ctx.textAlign = 'right'
    s.titleLines.forEach((line, i, all) => ctx.fillText(line, f.x1, PAGE_H - 110 - (all.length - 1 - i) * 138))
    ctx.textAlign = 'left'
  },

}
