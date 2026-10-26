// Procedural surface detail, generated once at start-up. Everything tiles so
// it can repeat at a fine scale and stay sharp however close the camera is.
import { CanvasTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, NearestFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace } from 'three'
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
  /** Plastic sleeve crinkles across the whole sheet (normal map). */
  crinkle: DataTexture
  /** The desk under the mat: varnished wood planks. */
  table: CanvasTexture
  /** Sunlight through a window: frame bars and leaves, projected by the key light. */
  gobo: CanvasTexture
  /** Fine random mask for partial (translucent) shadow casting; green channel. */
  shadowDither: DataTexture
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

  // Desk: oiled wood planks, grain running along x, each plank a little
  // different in tone.
  const T = 512
  const [tc, tctx] = makeCanvas(T, T)
  const warp = fbm(T, 37, 8, 4)
  const fleck = fbm(T, 41, 64, 2)
  const img = tctx.createImageData(T, T)
  const PLANKS = 4
  const pr = rng(43)
  const plank = Array.from({ length: PLANKS }, () => ({ tone: 0.88 + pr() * 0.24, phase: pr() * 100, ring: 0.6 + pr() * 0.8 }))
  const dark = [74, 46, 25], light = [168, 116, 68]
  for (let y = 0; y < T; y++) {
    const k = Math.floor((y / T) * PLANKS)
    const pk = plank[k]
    const inPlank = (y / T) * PLANKS - k
    for (let x = 0; x < T; x++) {
      // Grain: fine lines bent by slow noise stretched along the board.
      const w = warp[y * T + (x >> 3)] * 26 + warp[((y >> 2) * T + x) % (T * T)] * 6
      const fine = 0.5 + 0.5 * Math.sin((y + w + pk.phase) * 1.15)
      const rings = 0.5 + 0.5 * Math.sin((y * 0.08 + w * 0.12 + pk.phase) * pk.ring)
      let t = 0.35 + 0.3 * rings + 0.22 * Math.pow(fine, 3) + (fleck[y * T + x] - 0.5) * 0.25
      t = Math.min(1, Math.max(0, t)) * pk.tone
      // Seams between boards.
      const seam = inPlank < 0.012 || inPlank > 0.988 ? 0.45 : 1
      const i = (y * T + x) * 4
      for (let c = 0; c < 3; c++) img.data[i + c] = Math.min(255, (dark[c] + (light[c] - dark[c]) * t) * seam)
      img.data[i + 3] = 255
    }
  }
  tctx.putImageData(img, 0, 0)
  const table = new CanvasTexture(tc as HTMLCanvasElement)
  table.colorSpace = SRGBColorSpace
  table.wrapS = table.wrapT = RepeatWrapping
  table.repeat.set(3, 3)

  // Window light: drawn tiny and scaled up, so every edge comes out soft.
  const G = 64
  const [small, sctx] = makeCanvas(G, G)
  sctx.fillStyle = '#fff'
  sctx.fillRect(0, 0, G, G)
  const gr = rng(61)
  // Window frame: a mullion and a transom, out of focus.
  sctx.fillStyle = 'rgba(70,64,58,0.45)'
  sctx.save()
  sctx.translate(G / 2, G / 2)
  sctx.rotate(-0.5)
  sctx.fillRect(-G, -G * 0.22, G * 2, 3)
  sctx.fillRect(G * 0.18, -G, 3, G * 2)
  sctx.restore()
  // Leaves outside.
  for (let i = 0; i < 18; i++) {
    const cx = gr() * G, cy = gr() < 0.75 ? gr() * G * 0.4 : gr() * G
    sctx.fillStyle = `rgba(60,58,50,${0.1 + gr() * 0.18})`
    sctx.beginPath()
    sctx.ellipse(cx, cy, 1.5 + gr() * 4, 1 + gr() * 2.5, gr() * Math.PI, 0, Math.PI * 2)
    sctx.fill()
  }
  const GO = 256
  const [goboCanvas, gctx] = makeCanvas(GO, GO)
  gctx.imageSmoothingEnabled = true
  gctx.imageSmoothingQuality = 'high'
  gctx.drawImage(small as HTMLCanvasElement, 0, 0, GO, GO)
  const gobo = new CanvasTexture(goboCanvas as HTMLCanvasElement)
  gobo.colorSpace = SRGBColorSpace

  // ~40% of points cast: tracing paper's shadow is a fraction of paper's.
  const D = 64
  const dr = rng(53)
  const dither = new Uint8Array(D * D * 4)
  for (let i = 0; i < D * D; i++) {
    const v = dr() < 0.4 ? 255 : 0
    dither[i * 4] = dither[i * 4 + 1] = dither[i * 4 + 2] = v
    dither[i * 4 + 3] = 255
  }
  const shadowDither = dataTexture(dither, D, 12, 16)
  shadowDither.magFilter = NearestFilter
  shadowDither.minFilter = NearestFilter
  shadowDither.generateMipmaps = false

  return { fibreNormal, grainRoughness, crinkle, table, gobo, shadowDither }
}
