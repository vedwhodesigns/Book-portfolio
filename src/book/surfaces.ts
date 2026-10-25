// Procedural surface detail, generated once at start-up. Everything tiles so
// it can repeat at a fine scale and stay sharp however close the camera is.
import { CanvasTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace } from 'three'
import { makeCanvas, rng } from './art'

/** Tileable value-noise fBm in [0, 1]. */
function fbm(size: number, seed: number, baseCells: number, octaves: number): Float32Array {
  const out = new Float32Array(size * size)
  const r = rng(seed)
  let amp = 1, total = 0
  for (let o = 0; o < octaves; o++) {
    const cells = baseCells << o
    const grid = new Float32Array(cells * cells).map(() => r())
    const at = (x: number, y: number) => grid[((y + cells) % cells) * cells + ((x + cells) % cells)]
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * cells, y0 = Math.floor(gy), ty = gy - y0, sy = ty * ty * (3 - 2 * ty)
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * cells, x0 = Math.floor(gx), tx = gx - x0, sx = tx * tx * (3 - 2 * tx)
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx
        out[y * size + x] += (a + (b - a) * sy) * amp
      }
    }
    total += amp
    amp *= 0.5
  }
  for (let i = 0; i < out.length; i++) out[i] /= total
  return out
}

/** Height field (0..1, wrapping) → tangent-space normal map. */
function normalsFromHeight(h: Float32Array, size: number, strength: number) {
  const data = new Uint8Array(size * size * 4)
  const H = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const du = (H(x + 1, y) - H(x - 1, y)) * strength
      const dv = (H(x, y - 1) - H(x, y + 1)) * strength
      const len = Math.hypot(du, dv, 1)
      const o = (y * size + x) * 4
      data[o] = (-du / len * 0.5 + 0.5) * 255
      data[o + 1] = (-dv / len * 0.5 + 0.5) * 255
      data[o + 2] = (1 / len * 0.5 + 0.5) * 255
      data[o + 3] = 255
    }
  }
  return data
}

function dataTexture(data: Uint8Array, size: number, repeatX: number, repeatY: number) {
  const t = new DataTexture(data, size, size, RGBAFormat)
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(repeatX, repeatY)
  t.magFilter = LinearFilter
  t.minFilter = LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  return t
}

/** Fibres drawn with wrap-around so the tile is seamless. */
function fibreHeight(size: number, seed: number, count: number, alpha: number): Float32Array {
  const [, ctx] = makeCanvas(size, size)
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, size, size)
  const r = rng(seed)
  ctx.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const x = r() * size, y = r() * size, a = r() * Math.PI * 2, len = size * (0.02 + r() * 0.07)
    const bend = (r() - 0.5) * len * 0.6
    ctx.strokeStyle = r() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 0.8})`
    ctx.lineWidth = 0.6 + r() * 1.4
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      ctx.beginPath()
      ctx.moveTo(x + dx, y + dy)
      ctx.quadraticCurveTo(x + dx + Math.cos(a) * len * 0.5 - Math.sin(a) * bend, y + dy + Math.sin(a) * len * 0.5 + Math.cos(a) * bend, x + dx + Math.cos(a) * len, y + dy + Math.sin(a) * len)
      ctx.stroke()
    }
  }
  const img = ctx.getImageData(0, 0, size, size).data
  const noise = fbm(size, seed + 1, 32, 3)
  const h = new Float32Array(size * size)
  for (let i = 0; i < h.length; i++) h[i] = img[i * 4] / 255 * 0.7 + noise[i] * 0.3
  return h
}

export interface Surfaces {
  /** Paper fibre relief (normal map, tiled). */
  fibreNormal: DataTexture
  /** Roughness variation, green channel (tiled). */
  grainRoughness: DataTexture
  /** Smoother, finer relief for calendered tracing paper. */
  tracingNormal: DataTexture
  /** Plastic sleeve crinkles across the whole sheet (normal map). */
  crinkle: DataTexture
  /** The desk under the book. */
  table: CanvasTexture
}

export function createSurfaces(): Surfaces {
  const S = 256

  const fibres = fibreHeight(S, 11, 260, 0.35)
  const fibreNormal = dataTexture(normalsFromHeight(fibres, S, 2.2), S, 9, 12)

  const grain = fbm(S, 13, 16, 4)
  const rough = new Uint8Array(S * S * 4)
  for (let i = 0; i < S * S; i++) {
    const g = 0.78 + grain[i] * 0.3 + (fibres[i] - 0.5) * 0.2
    rough[i * 4] = rough[i * 4 + 2] = 0
    rough[i * 4 + 1] = Math.max(0, Math.min(255, g * 255))
    rough[i * 4 + 3] = 255
  }
  const grainRoughness = dataTexture(rough, S, 9, 12)

  const tracingFibres = fibreHeight(S, 23, 160, 0.18)
  const tracingNormal = dataTexture(normalsFromHeight(tracingFibres, S, 1.2), S, 9, 12)

  // Crinkles: soft undulation everywhere, sharper creases toward the edges.
  const C = 512
  const und = fbm(C, 29, 3, 4)
  const [, cctx] = makeCanvas(C, C)
  cctx.fillStyle = '#808080'
  cctx.fillRect(0, 0, C, C)
  const r = rng(31)
  cctx.lineCap = 'round'
  for (let i = 0; i < 28; i++) {
    const nearX = r() < 0.5
    const edge = () => (r() < 0.5 ? r() * 0.16 : 1 - r() * 0.16)
    const x = (nearX ? edge() : r()) * C, y = (nearX ? r() : edge()) * C
    const a = r() * Math.PI, len = C * (0.03 + r() * 0.1)
    cctx.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'
    cctx.lineWidth = 6 + r() * 10
    cctx.beginPath()
    cctx.moveTo(x, y)
    cctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len)
    cctx.stroke()
  }
  const lines = cctx.getImageData(0, 0, C, C).data
  const crinkleH = new Float32Array(C * C)
  for (let i = 0; i < crinkleH.length; i++) crinkleH[i] = und[i] * 0.85 + (lines[i * 4] / 255) * 0.15
  const crinkle = dataTexture(normalsFromHeight(crinkleH, C, 6), C, 1, 1)

  // Desk: dark, slightly warm, with fine tooth.
  const T = 512
  const [tc, tctx] = makeCanvas(T, T)
  const tn = fbm(T, 37, 64, 3)
  const tl = fbm(T, 41, 4, 3)
  const img = tctx.createImageData(T, T)
  for (let i = 0; i < T * T; i++) {
    const v = 0.11 + (tn[i] - 0.5) * 0.05 + (tl[i] - 0.5) * 0.04
    img.data[i * 4] = v * 255 * 1.06
    img.data[i * 4 + 1] = v * 255
    img.data[i * 4 + 2] = v * 255 * 0.92
    img.data[i * 4 + 3] = 255
  }
  tctx.putImageData(img, 0, 0)
  const table = new CanvasTexture(tc)
  table.colorSpace = SRGBColorSpace
  table.wrapS = table.wrapT = RepeatWrapping
  table.repeat.set(6, 6)

  return { fibreNormal, grainRoughness, tracingNormal, crinkle, table }
}
