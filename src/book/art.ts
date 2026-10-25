// Low-level canvas helpers shared by page and background art:
// seeded randomness, paper grain, placeholder imagery and text layout.
import type { ImageSpec, Tone } from './types'

export const FONT_SANS = '"Inter Tight", "Helvetica Neue", Arial, sans-serif'
export const FONT_MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace'
export const FONT_SERIF = '"Instrument Serif", Georgia, serif'

export const INK = '#1c1b19'
export const MUTED = '#77736c'
export const PAPER = '#f3f1ec'

export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A page canvas, or an OffscreenCanvas when drawing inside the page worker. */
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas

export function makeCanvas(w: number, h: number): [AnyCanvas, CanvasRenderingContext2D] {
  if (typeof document === 'undefined') {
    const oc = new OffscreenCanvas(w, h)
    // The 2D APIs used here are shared by both context types.
    return [oc, oc.getContext('2d') as unknown as CanvasRenderingContext2D]
  }
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

// ---------------------------------------------------------------------------
// Grain

let grainTile: AnyCanvas | undefined

/** 256px tile of fine luminance noise plus a few paper fibres. */
function getGrainTile(): AnyCanvas {
  if (grainTile) return grainTile
  const size = 256
  const [c, ctx] = makeCanvas(size, size)
  const img = ctx.createImageData(size, size)
  const r = rng(7)
  for (let i = 0; i < size * size; i++) {
    const v = 128 + (r() - 0.5) * 70 + (r() - 0.5) * 30
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  ctx.globalAlpha = 0.18
  ctx.lineWidth = 0.6
  for (let i = 0; i < 40; i++) {
    const x = r() * size, y = r() * size, a = r() * Math.PI * 2, l = 4 + r() * 14
    ctx.strokeStyle = r() > 0.5 ? '#fff' : '#000'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + r() * 3, y + Math.sin(a) * l * 0.5 + r() * 3, x + Math.cos(a) * l, y + Math.sin(a) * l)
    ctx.stroke()
  }
  grainTile = c
  return c
}

/** Overlays tiled grain using overlay blending. `scale` sizes the grain in canvas px. */
export function applyGrain(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number, scale = 1) {
  const tile = getGrainTile()
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = strength
  const pat = ctx.createPattern(tile, 'repeat')!
  pat.setTransform(new DOMMatrix().scale(scale))
  ctx.fillStyle = pat
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

let fineTile: AnyCanvas | undefined

/**
 * Even, very fine luminance grain (no fibres, no clouds), multiplied over the
 * surface. One tile pixel maps to one texture pixel when `px` is the inverse
 * of the canvas scale. `amount` is the darkest a grain can get (0..1).
 */
export function applyFineGrain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, px: number) {
  if (!fineTile) {
    const size = 256
    const [c, g] = makeCanvas(size, size)
    const img = g.createImageData(size, size)
    const r = rng(97)
    for (let i = 0; i < size * size; i++) {
      // Two uniforms averaged: soft, film-like distribution.
      const n = (r() + r()) / 2
      const v = 255 * (1 - n)
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
      img.data[i * 4 + 3] = 255
    }
    g.putImageData(img, 0, 0)
    fineTile = c
  }
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  ctx.globalAlpha = amount
  const pat = ctx.createPattern(fineTile, 'repeat')!
  pat.setTransform(new DOMMatrix().scale(px))
  ctx.fillStyle = pat
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Placeholder imagery: soft, blurred, photographic-feeling fields of light.

const PALETTES: Record<Tone, { base: string; blobs: string[] }> = {
  smoke: { base: '#2a2928', blobs: ['#d9d6d0', '#8d8a85', '#0d0d0d', '#f2efe9', '#4a4744'] },
  night: { base: '#121212', blobs: ['#c9c7c2', '#3b3a38', '#000000', '#7b7976', '#e9e6e0'] },
  leather: { base: '#3b2418', blobs: ['#7a4a2e', '#c08a5f', '#1d110b', '#d9b48c', '#5e3420'] },
  stone: { base: '#bdb8b0', blobs: ['#ece8e1', '#8f8a82', '#d4cfc6', '#5e5a55', '#faf8f4'] },
}

const imageCache = new Map<string, ImageBitmap>()

/** Preloads real images referenced by the book so page drawing can stay synchronous. */
export async function preloadImages(srcs: string[]): Promise<void> {
  await Promise.all(
    srcs.map(async src => {
      if (imageCache.has(src)) return
      try {
        const blob = await (await fetch(src)).blob()
        imageCache.set(src, await createImageBitmap(blob))
      } catch {
        // A missing image falls back to the generated placeholder.
      }
    }),
  )
}

/** Draws an image (real or generated) covering the rect. */
export function drawImage(ctx: CanvasRenderingContext2D, spec: ImageSpec, x: number, y: number, w: number, h: number) {
  const real = spec.src ? imageCache.get(spec.src) : undefined
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  if (real) {
    const s = Math.max(w / real.width, h / real.height)
    ctx.drawImage(real, x + (w - real.width * s) / 2, y + (h - real.height * s) / 2, real.width * s, real.height * s)
  } else {
    drawPlaceholder(ctx, spec, x, y, w, h)
  }
  ctx.restore()
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, spec: ImageSpec, x: number, y: number, w: number, h: number) {
  const pal = PALETTES[spec.tone]
  const r = rng(spec.seed)
  // Render small, blur, then scale up: cheap and very soft.
  const sw = 120, sh = Math.max(12, Math.round((120 * h) / w))
  const [c, g] = makeCanvas(sw, sh)
  g.fillStyle = pal.base
  g.fillRect(0, 0, sw, sh)
  for (let i = 0; i < 9; i++) {
    const cx = r() * sw, cy = r() * sh, rad = (0.15 + r() * 0.5) * Math.max(sw, sh)
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, rad)
    const col = pal.blobs[Math.floor(r() * pal.blobs.length)]
    grad.addColorStop(0, col)
    grad.addColorStop(1, col + '00')
    g.globalAlpha = 0.35 + r() * 0.5
    g.fillStyle = grad
    g.fillRect(0, 0, sw, sh)
  }
  // A few streaks of light give it a photographic, motion-blurred feel.
  g.globalAlpha = 0.25
  for (let i = 0; i < 3; i++) {
    g.save()
    g.translate(r() * sw, r() * sh)
    g.rotate((r() - 0.5) * 1.2)
    const grad = g.createLinearGradient(-sw * 0.4, 0, sw * 0.4, 0)
    grad.addColorStop(0, '#ffffff00')
    grad.addColorStop(0.5, pal.blobs[0])
    grad.addColorStop(1, '#ffffff00')
    g.fillStyle = grad
    g.fillRect(-sw * 0.4, -2 - r() * 4, sw * 0.8, 4 + r() * 8)
    g.restore()
  }
  // Upscaling the tiny render is what makes it soft.
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(c, x - w * 0.05, y - h * 0.05, w * 1.1, h * 1.1)
  // Vignette.
  const v = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.2, x + w / 2, y + h / 2, Math.max(w, h) * 0.75)
  v.addColorStop(0, '#00000000')
  v.addColorStop(1, '#00000066')
  ctx.fillStyle = v
  ctx.fillRect(x, y, w, h)
  applyGrain(ctx, w + x, h + y, 0.5, Math.max(1, w / 500))
}

// ---------------------------------------------------------------------------
// Typography

export function font(family: string, size: number, weight = 400, style = 'normal') {
  return `${style} ${weight} ${size}px ${family}`
}

/** Draws text with manual tracking (canvas letterSpacing is not universal). Returns width. */
export function tracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number, align: 'left' | 'right' | 'center' = 'left'): number {
  const chars = [...text]
  const widths = chars.map(ch => ctx.measureText(ch).width)
  const total = widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, chars.length - 1)
  let cx = align === 'left' ? x : align === 'right' ? x - total : x - total / 2
  const prevAlign = ctx.textAlign
  ctx.textAlign = 'left'
  chars.forEach((ch, i) => {
    ctx.fillText(ch, cx, y)
    cx += widths[i] + tracking
  })
  ctx.textAlign = prevAlign
  return total
}

/** Mono caps label, the running heads, captions and folios. */
export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: 'left' | 'right' | 'center' = 'left') {
  ctx.font = font(FONT_MONO, size, 400)
  ctx.fillStyle = color
  ctx.textBaseline = 'alphabetic'
  return tracked(ctx, text.toUpperCase(), x, y, size * 0.06, align)
}

export function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, firstIndent = 0): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    const avail = lines.length === 0 ? maxWidth - firstIndent : maxWidth
    if (ctx.measureText(test).width > avail && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Paragraph with optional justification; returns the y after the last line. */
export function paragraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
  opts: { justify?: boolean; indent?: number; align?: 'left' | 'right' } = {},
): number {
  const indent = opts.indent ?? 0
  const lines = wrap(ctx, text, width, indent)
  lines.forEach((line, i) => {
    const lx = x + (i === 0 ? indent : 0)
    const lw = width - (i === 0 ? indent : 0)
    const last = i === lines.length - 1
    if (opts.justify && !last) {
      const words = line.split(' ')
      const wordsW = words.reduce((a, w) => a + ctx.measureText(w).width, 0)
      const gap = (lw - wordsW) / Math.max(1, words.length - 1)
      let cx = lx
      for (const w of words) {
        ctx.fillText(w, cx, y)
        cx += ctx.measureText(w).width + gap
      }
    } else if (opts.align === 'right') {
      ctx.textAlign = 'right'
      ctx.fillText(line, lx + lw, y)
      ctx.textAlign = 'left'
    } else {
      ctx.fillText(line, lx, y)
    }
    y += lineHeight
  })
  return y
}
