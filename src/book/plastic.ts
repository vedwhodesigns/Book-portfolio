// Crinkles for the plastic sleeve, as a tangent-space normal map. Wrinkles
// gather near the edges and corners like a real punched pocket; the middle
// stays mostly smooth so reflections glide across it.
import { makeCanvas, rng } from './art'

export function renderCrinkleNormals(size = 1024): HTMLCanvasElement {
  const [hc, h] = makeCanvas(size, size)
  h.fillStyle = 'rgb(128,128,128)'
  h.fillRect(0, 0, size, size)
  const r = rng(77)
  const edge = () => {
    // Biased toward the edges: 0..0.22 or 0.78..1 most of the time.
    const t = r()
    return r() < 0.75 ? (t < 0.5 ? t * 0.44 : 1 - (t - 0.5) * 0.44) : r()
  }
  h.lineCap = 'round'
  // Fine creases, mostly along the edges where a pocket puckers.
  for (let i = 0; i < 60; i++) {
    const nearX = r() < 0.5
    const x = (nearX ? edge() : r()) * size
    const y = (nearX ? r() : edge()) * size
    const a = r() * Math.PI
    const len = size * (0.02 + r() * 0.12)
    h.strokeStyle = r() > 0.5 ? `rgba(255,255,255,${0.06 + r() * 0.1})` : `rgba(0,0,0,${0.06 + r() * 0.08})`
    h.lineWidth = size * (0.004 + r() * 0.008)
    h.beginPath()
    h.moveTo(x, y)
    h.quadraticCurveTo(
      x + Math.cos(a) * len * 0.5 + (r() - 0.5) * len * 0.3,
      y + Math.sin(a) * len * 0.5 + (r() - 0.5) * len * 0.3,
      x + Math.cos(a) * len,
      y + Math.sin(a) * len,
    )
    h.stroke()
  }
  // Broad, gentle undulation across the whole sheet.
  for (let i = 0; i < 12; i++) {
    const x = r() * size, y = r() * size, rad = size * (0.12 + r() * 0.3)
    const g = h.createRadialGradient(x, y, 0, x, y, rad)
    g.addColorStop(0, r() > 0.5 ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.28)')
    g.addColorStop(1, 'rgba(128,128,128,0)')
    h.fillStyle = g
    h.fillRect(0, 0, size, size)
  }
  // Soften by scaling down and back up (canvas filters are slow or missing on some browsers).
  const small = Math.round(size / 3)
  const [sc, sctx] = makeCanvas(small, small)
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(hc, 0, 0, small, small)
  const [, b] = makeCanvas(size, size)
  b.imageSmoothingQuality = 'high'
  b.drawImage(sc, 0, 0, size, size)
  const src = b.getImageData(0, 0, size, size).data

  const [nc, n] = makeCanvas(size, size)
  const out = n.createImageData(size, size)
  const H = (x: number, y: number) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255
  const strength = 5
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const du = (H(x + 1, y) - H(x - 1, y)) * strength
      const dv = (H(x, y - 1) - H(x, y + 1)) * strength
      const len = Math.hypot(du, dv, 1)
      const o = (y * size + x) * 4
      out.data[o] = ((-du / len) * 0.5 + 0.5) * 255
      out.data[o + 1] = ((-dv / len) * 0.5 + 0.5) * 255
      out.data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255
      out.data[o + 3] = 255
    }
  }
  n.putImageData(out, 0, 0)
  return nc
}
