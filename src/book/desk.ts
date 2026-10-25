// What the book rests on: a cutting mat on a dark tabletop, the soft contact
// shadow where the book block meets the mat, and the page edges that give the
// block its height.
import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PlaneGeometry, Shape, SRGBColorSpace, TextureLoader, type Texture,
} from 'three'
import matUrl from '../assets/cutting-mat.webp'
import { makeCanvas } from './art'
import type { LeafKind } from './layout'

/** 1 unit is one page width; the book is A5, so 148 mm. */
const MM = 1 / 148
/** An 18 × 12 in rotary cutting mat, 3 mm thick. */
const MAT_W = 18 * 25.4 * MM
const MAT_H = 12 * 25.4 * MM
const MAT_T = 3 * MM

/**
 * Thickness of each kind of sheet. Board covers, 200 g/m² paper, tracing
 * paper, and a polypropylene sleeve with prints inside it.
 */
export const THICKNESS: Record<LeafKind, number> = {
  cover: 1.8 * MM,
  paper: 0.2 * MM,
  vellum: 0.09 * MM,
  sleeve: 0.6 * MM,
}

function roundedRect(w: number, h: number, r: number) {
  const s = new Shape()
  s.moveTo(-w / 2 + r, -h / 2)
  s.lineTo(w / 2 - r, -h / 2)
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
  s.lineTo(w / 2, h / 2 - r)
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
  s.lineTo(-w / 2 + r, h / 2)
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
  s.lineTo(-w / 2, -h / 2 + r)
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  return s
}

/** A soft dark rounded rectangle on transparent, used as an alpha map. */
function contactShadowTexture(w: number, h: number, margin: number) {
  const px = 160
  const cw = Math.round((w + 2 * margin) * px), ch = Math.round((h + 2 * margin) * px)
  const [canvas, ctx] = makeCanvas(cw, ch)
  // White on black: the alpha map reads the green channel.
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, cw, ch)
  // Draw the shape far off-canvas and keep only its blurred shadow.
  const off = cw * 4
  ctx.shadowColor = '#fff'
  ctx.shadowBlur = margin * px * 0.9
  ctx.shadowOffsetX = off
  ctx.fillStyle = '#fff'
  ctx.fillRect(margin * px * 0.75 - off, margin * px * 0.75, cw - margin * px * 1.5, ch - margin * px * 1.5)
  const tex = new CanvasTexture(canvas as HTMLCanvasElement)
  return tex
}

export interface Footprint { left: number; right: number }

export class Desk {
  readonly group = new Group()
  private shadows: Mesh<PlaneGeometry, MeshBasicMaterial>[] = []
  private mat: Mesh

  constructor(tableMap: Texture, env: Texture, anisotropy: number, onReady: () => void, pageW: number, pageH: number) {
    const table = new Mesh(new PlaneGeometry(8, 8), new MeshStandardMaterial({ map: tableMap, roughness: 0.92 }))
    table.position.z = -MAT_T - 0.006
    table.receiveShadow = true

    const geo = new ExtrudeGeometry(roundedRect(MAT_W, MAT_H, 0.035), {
      depth: MAT_T, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 6,
    })
    // Planar mapping from above; the edges pick up the border's colour.
    const pos = geo.attributes.position, uv = geo.attributes.uv
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / MAT_W + 0.5, pos.getY(i) / MAT_H + 0.5)
    geo.translate(0, 0, -MAT_T - 0.0019)
    // Self-healing PVC: matte with a faint sheen. Mat green until the photo arrives.
    const surface = new MeshStandardMaterial({ color: new Color('#2b6a5a'), roughness: 0.78, metalness: 0, envMap: env, envMapIntensity: 0.3 })
    const mat = new Mesh(geo, surface)
    mat.receiveShadow = true
    this.mat = mat
    this.layout(false)
    new TextureLoader().load(matUrl, tex => {
      tex.colorSpace = SRGBColorSpace
      tex.anisotropy = anisotropy
      surface.map = tex
      // The photo is a flat, bright scan; this sits it in the room's light.
      surface.color.set(0xcfcfcf)
      surface.needsUpdate = true
      onReady()
    })

    // Contact shadow: the block shuts out the sky right where it meets the mat.
    const margin = 0.14
    const alpha = contactShadowTexture(pageW, pageH, margin)
    for (const side of [-1, 1]) {
      const m = new Mesh(
        new PlaneGeometry(pageW + 2 * margin, pageH + 2 * margin),
        new MeshBasicMaterial({ color: 0x000000, alphaMap: alpha, transparent: true, depthWrite: false, opacity: 0 }),
      )
      m.position.set((side * pageW) / 2, 0, -0.0002)
      this.shadows.push(m)
      this.group.add(m)
    }
    this.group.add(table, mat)
  }

  /**
   * Open book: the mat lies landscape, set down a little askew. Folded back on
   * a phone: turned to portrait under the single page, and the magazine is
   * held up off it.
   */
  layout(single: boolean) {
    this.mat.rotation.z = single ? Math.PI / 2 - 0.03 : -0.03
    this.mat.position.set(single ? 0.5 : 0.02, single ? 0.05 : -0.03, 0)
    this.group.position.z = single ? -0.45 : 0
  }

  /**
   * How much of the book is on each half (0..1), and how high it is held above
   * the mat. Returns true while the contact shadow is still fading.
   */
  update(target: Footprint, dt: number, lifted: boolean): boolean {
    let easing = false
    const strength = lifted ? 0.35 : 0.72
    for (const [i, side] of [[0, target.left], [1, target.right]] as const) {
      const m = this.shadows[i].material
      const goal = side * strength
      const diff = goal - m.opacity
      if (Math.abs(diff) < 0.002) m.opacity = goal
      else { m.opacity += diff * (1 - Math.exp(-dt / 0.12)); easing = true }
      // Held up (folded magazine) the shadow is wider and softer.
      this.shadows[i].scale.setScalar(lifted ? 1.35 : 1)
    }
    return easing
  }
}

/**
 * Page edges along the three open sides of each stack. Sheets are drawn as
 * zero-thickness surfaces, so the block's height comes from these bands: one
 * per sheet, from its surface down to the next sheet's, following each
 * sheet's gutter bow, coloured by what the sheet is made of.
 */
const SEG = 12
const EDGE_COLOR: Record<LeafKind, Color> = {
  cover: new Color('#2a2826'),
  paper: new Color('#e4e0d8'),
  vellum: new Color('#eeeeea'),
  sleeve: new Color('#c9cdcc'),
}

export interface StackSheet {
  /** Height of the sheet's surface at the spine. */
  z: number
  /** Its gutter bow (uRestLift). */
  bow: number
  kind: LeafKind
}

/** Same profile as restLift() in the bend shader, for a bow of 1. */
function bowAt(u: number) {
  const t = 1 - Math.min(u / 0.4, 1)
  const rise = Math.sqrt(Math.max(0, 1 - t * t))
  const k = Math.min(1, Math.max(0, (u - 0.4) / 0.6))
  return rise * (1 - 0.55 * k * k * (3 - 2 * k))
}

export class BookEdges {
  readonly mesh: Mesh<BufferGeometry, MeshStandardMaterial>
  private pos: Float32Array
  private nor: Float32Array
  private col: Float32Array
  private quads: number

  constructor(maxSheets: number, private w: number, private h: number) {
    this.quads = 2 * maxSheets * (1 + 2 * SEG)
    const verts = this.quads * 4
    this.pos = new Float32Array(verts * 3)
    this.nor = new Float32Array(verts * 3)
    this.col = new Float32Array(verts * 3)
    const index = new Uint32Array(this.quads * 6)
    for (let q = 0; q < this.quads; q++) index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new BufferAttribute(this.nor, 3))
    g.setAttribute('color', new BufferAttribute(this.col, 3))
    g.setIndex(new BufferAttribute(index, 1))
    g.setDrawRange(0, 0)
    this.mesh = new Mesh(g, new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }))
    this.mesh.receiveShadow = true
    this.mesh.frustumCulled = false
  }

  /** `side` is +1 for the stack lying to the right of the spine, −1 for the left. Sheets top first. */
  update(stacks: { side: 1 | -1; sheets: StackSheet[] }[]) {
    const { pos, nor, col, w, h } = this
    let q = 0
    const quad = (
      a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number],
      n: [number, number, number], color: Color, shade: number,
    ) => {
      const o = q * 12
      pos.set([...a, ...b, ...c, ...d], o)
      for (let k = 0; k < 4; k++) {
        nor.set(n, o + k * 3)
        col.set([color.r * shade, color.g * shade, color.b * shade], o + k * 3)
      }
      q++
    }
    for (const { side, sheets } of stacks) {
      sheets.forEach((s, k) => {
        const below = sheets[k + 1]
        const top = (u: number) => s.z + s.bow * bowAt(u)
        const bottom = (u: number) => (below ? below.z + below.bow * bowAt(u) : 0)
        // Neighbouring sheets differ a touch, and the block darkens with depth.
        const shade = (0.94 + ((k * 7919) % 13) / 13 * 0.08) * (1 - Math.min(0.18, k * 0.006))
        const color = EDGE_COLOR[s.kind]
        const x = side * w
        quad([x, -h / 2, bottom(1)], [x, h / 2, bottom(1)], [x, h / 2, top(1)], [x, -h / 2, top(1)], [side, 0, 0], color, shade)
        for (const end of [-1, 1]) {
          const y = (end * h) / 2
          for (let i = 0; i < SEG; i++) {
            const u0 = i / SEG, u1 = (i + 1) / SEG
            quad([side * w * u0, y, bottom(u0)], [side * w * u1, y, bottom(u1)], [side * w * u1, y, top(u1)], [side * w * u0, y, top(u0)], [0, end, 0], color, shade)
          }
        }
      })
    }
    const g = this.mesh.geometry
    g.setDrawRange(0, q * 6)
    for (const name of ['position', 'normal', 'color']) {
      const a = g.getAttribute(name) as BufferAttribute
      a.clearUpdateRanges()
      a.addUpdateRange(0, q * 12)
      a.needsUpdate = true
    }
  }
}
