const PW = 700
const PH = 933

function makePage(drawFn: (ctx: CanvasRenderingContext2D) => void): string {
  const c = document.createElement('canvas')
  c.width = PW; c.height = PH
  const ctx = c.getContext('2d')!
  drawFn(ctx)
  return c.toDataURL('image/jpeg', 0.91)
}

function drawRuled(ctx: CanvasRenderingContext2D, pageNum: number): void {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, PW, PH)

  ctx.strokeStyle = 'rgba(0,0,0,0.12)'
  ctx.lineWidth = 0.75
  for (let y = 72; y < PH - 24; y += 28) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(PW, y); ctx.stroke()
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.15)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, PH); ctx.stroke()

  ctx.font = '10px Arial,sans-serif'
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillText(String(pageNum), PW - 24, PH - 14)
}

export function generatePages(totalSpreads: number): string[] {
  const pages: string[] = []

  pages.push(makePage(ctx => {
    const g = ctx.createLinearGradient(0, 0, PW, PH)
    g.addColorStop(0, '#1e0f08'); g.addColorStop(1, '#3a1e10')
    ctx.fillStyle = g; ctx.fillRect(0, 0, PW, PH)

    ctx.strokeStyle = 'rgba(212,168,83,0.55)'; ctx.lineWidth = 2
    ctx.strokeRect(22, 22, PW - 44, PH - 44)
    ctx.strokeStyle = 'rgba(212,168,83,0.18)'; ctx.lineWidth = 1
    ctx.strokeRect(30, 30, PW - 60, PH - 60)

    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.font = '13px Georgia,serif'
    ctx.fillStyle = 'rgba(212,168,83,0.5)'
    ctx.fillText('A PERSONAL', PW / 2, PH / 2 - 130)

    ctx.font = 'bold 68px Georgia,serif'
    ctx.fillStyle = '#f0c97a'
    ctx.fillText('BOOK', PW / 2, PH / 2 - 100)
    ctx.fillText('PORTFOLIO', PW / 2, PH / 2 - 22)

    ctx.strokeStyle = '#d4a853'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(PW/2 - 80, PH/2 + 62); ctx.lineTo(PW/2 + 80, PH/2 + 62); ctx.stroke()

    ctx.font = 'italic 20px Georgia,serif'
    ctx.fillStyle = 'rgba(212,168,83,0.6)'
    ctx.fillText('2026', PW / 2, PH / 2 + 76)
  }))

  for (let i = 0; i < totalSpreads; i++) {
    const leftNum  = i * 2 + 2
    const rightNum = i * 2 + 3
    pages.push(makePage(ctx => { drawRuled(ctx, leftNum) }))
    pages.push(makePage(ctx => { drawRuled(ctx, rightNum) }))
  }

  pages.push(makePage(ctx => {
    const g = ctx.createLinearGradient(PW, PH, 0, 0)
    g.addColorStop(0, '#1e0f08'); g.addColorStop(1, '#3a1e10')
    ctx.fillStyle = g; ctx.fillRect(0, 0, PW, PH)
    ctx.strokeStyle = 'rgba(212,168,83,0.4)'; ctx.lineWidth = 2
    ctx.strokeRect(22, 22, PW - 44, PH - 44)
  }))

  return pages
}
