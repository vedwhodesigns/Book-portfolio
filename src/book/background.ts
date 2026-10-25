// The surface the book rests on: a dark, softly out-of-focus collage of
// leather and loose printed sheets, generated so no stock imagery is needed.
import { applyGrain, font, FONT_SANS, makeCanvas, rng } from './art'

export function renderBackground(size = 2048): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size)
  const r = rng(2026)
  ctx.fillStyle = '#121110'
  ctx.fillRect(0, 0, size, size)

  // Soft tonal pools.
  for (let i = 0; i < 7; i++) {
    const x = r() * size, y = r() * size, rad = size * (0.2 + r() * 0.35)
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
    const warm = r() > 0.4
    g.addColorStop(0, warm ? 'rgba(74,44,30,0.55)' : 'rgba(60,60,58,0.45)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }

  const objects: (() => void)[] = []

  // Leather swatches with creases.
  for (let i = 0; i < 5; i++) {
    const cx = r() * size, cy = r() * size, w = size * (0.12 + r() * 0.12), h = w * (0.6 + r() * 0.5), a = (r() - 0.5) * 0.9
    const tone = r() > 0.5 ? '#3a2316' : '#1a1513'
    objects.push(() => {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(a)
      ctx.shadowColor = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur = 40
      ctx.fillStyle = tone
      ctx.fillRect(-w / 2, -h / 2, w, h)
      ctx.shadowBlur = 0
      ctx.globalAlpha = 0.35
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1.5
      for (let k = 0; k < 140; k++) {
        const x = (r() - 0.5) * w, y = (r() - 0.5) * h, l = 6 + r() * 30, t = r() * Math.PI
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + Math.cos(t) * l, y + Math.sin(t) * l)
        ctx.stroke()
      }
      ctx.globalAlpha = 0.12
      ctx.fillStyle = '#c99a72'
      ctx.fillRect(-w / 2, -h / 2, w, h * 0.04)
      ctx.restore()
    })
  }

  // Loose printed sheets.
  for (let i = 0; i < 9; i++) {
    const cx = r() * size, cy = r() * size, w = size * (0.07 + r() * 0.07), h = w * 1.35, a = (r() - 0.5) * 1.4
    const photo = r() > 0.6
    objects.push(() => {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(a)
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = 30
      ctx.shadowOffsetY = 8
      ctx.fillStyle = photo ? '#6f6c68' : '#a9a59e'
      ctx.fillRect(-w / 2, -h / 2, w, h)
      ctx.shadowColor = 'transparent'
      if (photo) {
        const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2)
        g.addColorStop(0, '#2c2b29')
        g.addColorStop(0.5, '#bdb9b2')
        g.addColorStop(1, '#151514')
        ctx.fillStyle = g
        ctx.fillRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20)
      } else {
        ctx.fillStyle = 'rgba(30,30,28,0.55)'
        ctx.font = font(FONT_SANS, Math.round(w / 9), 300)
        ctx.fillText('Paper', -w / 2 + w * 0.1, -h / 2 + h * 0.18)
        for (let line = 0; line < 26; line++) {
          const ly = -h / 2 + h * 0.28 + line * (h * 0.026)
          const lw = (w * 0.8) * (line % 7 === 6 ? 0.45 : 0.9 + r() * 0.1)
          ctx.fillStyle = 'rgba(30,30,28,0.32)'
          ctx.fillRect(-w / 2 + w * 0.1, ly, lw, h * 0.008)
        }
      }
      ctx.restore()
    })
  }

  // Shuffle drawing order so sheets and leather overlap naturally.
  objects.sort(() => r() - 0.5).forEach(draw => draw())

  // Out of focus: the book is the only thing that is sharp.
  const [small, sctx] = makeCanvas(size / 4, size / 4)
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(c, 0, 0, size / 4, size / 4)
  const [blurred, b] = makeCanvas(size, size)
  b.imageSmoothingQuality = 'high'
  b.drawImage(small, 0, 0, size, size)
  applyGrain(b, size, size, 0.22, 1.4)
  const v = b.createRadialGradient(size / 2, size / 2, size * 0.15, size / 2, size / 2, size * 0.72)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.65)')
  b.fillStyle = v
  b.fillRect(0, 0, size, size)
  return blurred
}
