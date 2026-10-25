// Paper bend model.
//
// A leaf is hinged at the spine (x = 0) and turns about the y axis from
// angle 0 (lying on the right) to π (lying on the left). While turning, the
// sheet curls as a circular arc: the spine end sits at angle θs and the free
// edge at θe, with the edge leading in the direction of travel. Because the
// arc is integrated along its length the paper never stretches, which is what
// makes the curl read as paper rather than a hinged card.
//
// Each row along y gets a slightly different progress so the corner that was
// grabbed leads and the opposite corner lags: a soft diagonal peel.
//
// `flex` adds a lift that does not depend on progress, so a resting sheet can
// still spring up at its free edge and settle; negative values clamp flat,
// which reads as the sheet bouncing off the stack.

import { BufferAttribute, BufferGeometry } from 'three'

export interface BendParams {
  /** Turn progress, 0 = lying right, 1 = lying left. */
  p: number
  /** +1 turning forward (toward the left), -1 turning back. */
  dir: 1 | -1
  /** Height of the grab point, 0 = bottom edge, 1 = top edge. */
  grabY: number
  /** Peak curl in radians. Floppy vellum curls more than a stiff cover. */
  curl: number
  /**
   * Extra edge lift in radians, independent of progress: the springy
   * after-bounce of a sheet that has just landed (strongest for plastic).
   */
  flex?: number
}

const SKEW = 0.22

export function createLeafGeometry(w: number, h: number, segX: number, segY: number): BufferGeometry {
  const cols = segX + 1, rows = segY + 1
  const pos = new Float32Array(cols * rows * 3)
  const nrm = new Float32Array(cols * rows * 3)
  const uv = new Float32Array(cols * rows * 2)
  const idx: number[] = []
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const v = j * cols + i
      uv[v * 2] = i / segX
      uv[v * 2 + 1] = j / segY
      if (i < segX && j < segY) {
        const a = v, b = v + 1, c = v + cols, d = v + cols + 1
        idx.push(a, b, d, a, d, c)
      }
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('normal', new BufferAttribute(nrm, 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.userData = { w, h, segX, segY }
  bendLeaf(g, { p: 0, dir: 1, grabY: 0.5, curl: 0, flex: 0 })
  return g
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

export function bendLeaf(g: BufferGeometry, b: BendParams) {
  const { w, h, segX, segY } = g.userData as { w: number; h: number; segX: number; segY: number }
  const pos = g.getAttribute('position') as BufferAttribute
  const nrm = g.getAttribute('normal') as BufferAttribute
  const P = pos.array as Float32Array, N = nrm.array as Float32Array
  const lift = Math.sin(Math.PI * b.p)
  const cols = segX + 1
  for (let j = 0; j <= segY; j++) {
    const yn = j / segY
    const y = (yn - 0.5) * h
    const pr = clamp(b.p - b.dir * SKEW * (yn - b.grabY) * lift, 0, 1)
    const flex = (b.flex ?? 0) * (pr < 0.5 ? 1 : -1)
    const bend = b.dir * b.curl * Math.sin(Math.PI * pr) + flex
    const ts = clamp(Math.PI * pr - bend / 2, 0, Math.PI)
    const te = clamp(Math.PI * pr + bend / 2, 0, Math.PI)
    const k = (te - ts) / w
    const sinS = Math.sin(ts), cosS = Math.cos(ts)
    for (let i = 0; i <= segX; i++) {
      const u = (i / segX) * w
      let x: number, z: number, phi: number
      if (Math.abs(k) < 1e-5) {
        phi = ts
        x = u * cosS
        z = u * sinS
      } else {
        phi = ts + k * u
        x = (Math.sin(phi) - sinS) / k
        z = (cosS - Math.cos(phi)) / k
      }
      const o = (j * cols + i) * 3
      P[o] = x
      P[o + 1] = y
      P[o + 2] = z
      N[o] = -Math.sin(phi)
      N[o + 1] = 0
      N[o + 2] = Math.cos(phi)
    }
  }
  pos.needsUpdate = true
  nrm.needsUpdate = true
  g.computeBoundingSphere()
}
