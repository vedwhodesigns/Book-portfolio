import {
  BackSide, BoxGeometry, CanvasTexture, Color, DataTexture, DoubleSide, FrontSide, Group, HemisphereLight, Mesh, MeshBasicMaterial,
  MeshPhysicalMaterial, MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, Plane, PlaneGeometry, PMREMGenerator,
  Raycaster, RGBAFormat, Scene, SpotLight, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, type MeshDepthMaterial, type Texture,
} from 'three'
import {
  anchorPage, buildLeaves, chooseMode, isOverlay, maxTurned, stateForPage, visibleFaces,
  type Face, type Leaf, type LeafKind, type Mode,
} from './layout'
import {
  COVER, PAPER, SLEEVE_CONTENTS, filmMaterial, paperMaterial, setBackMap, sheetDepthMaterial, sheetUniforms, tracingMaterial,
  type SheetUniforms,
} from './materials'
import { PAGE_ASPECT, PAGE_H, PAGE_W, renderPage, renderPlain } from './pageArt'
import type { PaperSound } from './paperSound'
import { createSurfaces, type Surfaces } from './surfaces'
import type { BookSpec, Hotspot } from './types'

const W = 1
const H = 1 / PAGE_ASPECT
/** Leaf spacing in the stacks: ≈0.19 mm on a 210 mm page. */
const GAP = 0.0009
const PEEK = 0.05
const DRAG_START_PX = 6
/** How tightly a dragged page follows the pointer (seconds). */
const FOLLOW = 0.045

/**
 * Motion per sheet type. curl: bow while turning (radians). flip: seconds for
 * a full turn from a tap or key. fall: seconds to settle after a release.
 * bounce: edge lift (radians) when the sheet lands, then decays.
 */
const MOTION: Record<LeafKind, { curl: number; flip: number; fall: number; bounce: number }> = {
  paper: { curl: 1.15, flip: 0.6, fall: 0.48, bounce: 0.035 },
  cover: { curl: 0.3, flip: 0.78, fall: 0.6, bounce: 0 },
  vellum: { curl: 1.5, flip: 0.7, fall: 0.56, bounce: 0.09 },
  sleeve: { curl: 0.95, flip: 0.64, fall: 0.5, bounce: 0.12 },
}

export interface EngineState {
  mode: Mode
  turned: number
  max: number
  left: Face | null
  right: Face | null
  /** A loose sheet (vellum or sleeve) lying on top of the right page. */
  overlay: LeafKind | null
  section: string
}

export interface EngineOptions {
  book: BookSpec
  sound: PaperSound
  /** Pixels reserved for UI at the top and bottom of the screen. */
  chrome: { top: number; bottom: number }
  reducedMotion: boolean
  /** Page id to open at (e.g. where the reader left off). */
  startPage?: string
  onState: (s: EngineState) => void
}

interface Tween {
  from: number
  to: number
  start: number
  dur: number
  /** Initial slope for releases (Hermite); undefined uses the eased curve. */
  launch?: number
}

interface LeafObj {
  data: Leaf
  index: number
  group: Group
  u: SheetUniforms
  /** Paper, cover or sleeve contents. */
  sheet?: MeshStandardMaterial
  depth?: MeshDepthMaterial
  /** Tracing paper (front and back faces). */
  prints?: MeshPhysicalMaterial[]
  p: number
  tween?: Tween
  /** Pointer-driven target while dragging. */
  follow?: number
  /** Random per-turn timing so no two turns are identical. */
  wobble: number
  /** Gutter bow this leaf is easing toward (see updateBows). */
  restLift: number
  landedAt: number | null
  wantFront?: string
  wantBack?: string
  frontKey?: string
  backKey?: string
}

interface Pose { tx: number; ty: number; dist: number; polar: number; azim: number }

interface Drag {
  id: number
  sx: number
  sy: number
  wx: number
  wy: number
  leaf?: LeafObj
  forward: boolean
  p0: number
  radius: number
  samples: { t: number; p: number }[]
  moved: boolean
}

interface Job { priority: number; run: () => void }

/** Height of the gutter bow on the top page of each stack (fraction of page width). */
const REST_LIFT = 0.03

/**
 * What glossy surfaces reflect: a dim room with one large softbox, placed
 * along the key light so highlights and shadows agree.
 */
function studio(): Scene {
  const scene = new Scene()
  scene.add(new Mesh(new BoxGeometry(12, 12, 12), new MeshBasicMaterial({ color: 0x24221f, side: BackSide })))
  const panel = (w: number, h: number, at: [number, number, number], intensity: number, roll: number) => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(1, 1, 1).multiplyScalar(intensity), side: DoubleSide }))
    m.position.set(...at)
    m.lookAt(0, 0, 0)
    m.rotateZ(roll)
    scene.add(m)
  }
  panel(1.4, 4.4, [1.7, 2.3, 3.6], 3.6, 0.5)
  panel(0.8, 3.2, [-3.6, -1.4, 3.2], 1.1, 0)
  return scene
}

const ease = (r: number) => 0.5 * (1 - Math.cos((1 - Math.pow(1 - r, 0.8)) * Math.PI))
const hermite = (r: number, launch: number) => {
  const r2 = r * r, r3 = r2 * r
  return (r3 - 2 * r2 + r) * launch + (3 * r2 - 2 * r3)
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function solidTexture(rgba: [number, number, number, number]) {
  const t = new DataTexture(new Uint8Array(rgba), 1, 1, RGBAFormat)
  t.colorSpace = SRGBColorSpace
  t.needsUpdate = true
  return t
}

export class BookEngine {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(24, 1, 0.1, 60)
  private book = new Group()
  private geometry = new PlaneGeometry(1, 1, 48, 14)
  private surfaces: Surfaces
  private env: Texture
  private leaves: LeafObj[] = []
  private mode: Mode = 'spread'
  private turned = 0
  private pose: Pose = { tx: 0, ty: 0, dist: 6, polar: 0.1, azim: 0 }
  private goal: Pose = { ...this.pose }
  private textures = new Map<string, { tex: Texture; hot: Hotspot[] }>()
  private jobs = new Map<string, Job>()
  private idle = 0
  private plain: CanvasTexture
  private white = solidTexture([255, 255, 255, 255])
  private clear = solidTexture([0, 0, 0, 0])
  private texW = 1024
  private raf = 0
  private lastFrame = 0
  private drag?: Drag
  private peeked?: LeafObj
  private wheelAcc = 0
  private wheelLock = 0
  private width = 1
  private height = 1
  private ro: ResizeObserver
  private raycaster = new Raycaster()
  private disposed = false

  constructor(private container: HTMLElement, private opts: EngineOptions) {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFSoftShadowMap
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.transmissionResolutionScale = coarse ? 0.75 : 1
    this.renderer.setClearColor(new Color('#151412'))
    const canvas = this.renderer.domElement
    canvas.style.touchAction = 'none'
    canvas.style.display = 'block'
    canvas.style.setProperty('-webkit-touch-callout', 'none')
    canvas.style.userSelect = 'none'
    canvas.setAttribute('aria-hidden', 'true')
    container.appendChild(canvas)

    // Soft sky/ground fill plus one key light pooling over the book, as a
    // room with a window would give. Shadows stay soft and never go black.
    this.scene.add(new HemisphereLight(0xffffff, 0x8e9698, 1.45))
    const key = new SpotLight(0xffffff, 2.3, 0, 0.62, 0.95, 0)
    key.position.set(1.05, -1.75, 3.3)
    key.target.position.set(0, 0, 0)
    key.castShadow = true
    key.shadow.intensity = 0.5
    key.shadow.mapSize.set(coarse ? 1536 : 2048, coarse ? 1536 : 2048)
    key.shadow.camera.near = 1.5
    key.shadow.camera.far = 7
    key.shadow.bias = -0.0005
    key.shadow.normalBias = 0.004
    this.scene.add(key, key.target)

    this.surfaces = createSurfaces()
    const pmrem = new PMREMGenerator(this.renderer)
    this.env = pmrem.fromScene(studio(), 0.02).texture
    pmrem.dispose()
    this.plain = new CanvasTexture(renderPlain(256))
    this.plain.colorSpace = SRGBColorSpace

    const table = new Mesh(new PlaneGeometry(8, 8), new MeshStandardMaterial({ map: this.surfaces.table, roughness: 0.92 }))
    table.position.z = -0.004
    table.receiveShadow = true
    this.scene.add(table)
    this.scene.add(this.book)

    this.bindInput(canvas)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.resize(true)
  }

  // ---------------------------------------------------------------------------
  // Public API

  next() { this.turnTo(this.turned + 1) }
  prev() { this.turnTo(this.turned - 1) }
  first() { this.turnTo(0) }
  last() { this.turnTo(this.max()) }

  goToPage(pageId: string) {
    this.turnTo(stateForPage(this.leafData(), this.mode, pageId))
  }

  setChrome(chrome: { top: number; bottom: number }) {
    this.opts.chrome = chrome
    this.resize()
  }

  destroy() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.cancelIdle()
    this.ro.disconnect()
    window.removeEventListener('keydown', this.onKey)
    for (const t of this.textures.values()) t.tex.dispose()
    this.clearLeaves()
    this.geometry.dispose()
    for (const t of Object.values(this.surfaces)) (t as Texture).dispose()
    this.env.dispose()
    this.plain.dispose()
    this.white.dispose()
    this.clear.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  // ---------------------------------------------------------------------------
  // Leaves

  private leafData() { return this.leaves.map(l => l.data) }
  private max() { return maxTurned(this.leafData(), this.mode) }

  private clearLeaves() {
    for (const l of this.leaves) {
      l.group.traverse(o => {
        if (o instanceof Mesh) (o.material as MeshStandardMaterial).dispose()
      })
      l.depth?.dispose()
      this.book.remove(l.group)
    }
    this.leaves = []
  }

  private build(mode: Mode, turned: number) {
    this.clearLeaves()
    this.jobs.clear()
    this.mode = mode
    const data = buildLeaves(this.opts.book, mode)
    this.turned = Math.max(0, Math.min(turned, maxTurned(data, mode)))
    const s = this.surfaces
    this.leaves = data.map((leaf, index) => {
      const kind = leaf.kind
      const p = index < this.turned ? 1 : 0
      const u = sheetUniforms(W, H, MOTION[kind].curl * (this.opts.reducedMotion ? 0.5 : 1), p)
      const group = new Group()
      const obj: LeafObj = { data: leaf, index, group, u, p, wobble: 1, restLift: 0, landedAt: null }
      const mesh = (m: MeshStandardMaterial | MeshPhysicalMaterial) => {
        const x = new Mesh(this.geometry, m)
        x.frustumCulled = false
        x.receiveShadow = true
        group.add(x)
        return x
      }
      if (kind === 'vellum') {
        // One mesh per face: a double-sided transmissive sheet would be drawn
        // into the very buffer it samples, which shows up as stripes.
        obj.prints = [FrontSide, BackSide].map(side => tracingMaterial(u, this.white, this.env, side))
        obj.prints.forEach(m => mesh(m))
      } else {
        const opts = kind === 'cover' ? COVER : kind === 'sleeve' ? SLEEVE_CONTENTS : PAPER
        const blank = kind === 'sleeve' ? this.clear : this.plain
        obj.sheet = paperMaterial(u, { ...opts, grainNormal: s.fibreNormal, grainRoughness: s.grainRoughness }, blank, blank)
        obj.depth = sheetDepthMaterial(u, kind === 'sleeve' ? this.clear : undefined)
        const m = mesh(obj.sheet)
        m.castShadow = true
        m.customDepthMaterial = obj.depth
        if (kind === 'sleeve') {
          // The film sits on its own contents: it must not catch their shadows.
          for (const side of [FrontSide, BackSide]) {
            const film = mesh(filmMaterial(u, s.crinkle, this.env, side))
            film.receiveShadow = false
            film.renderOrder = 1
          }
        }
      }
      this.book.add(group)
      return obj
    })
    for (const l of this.leaves) this.applyLeaf(l, 0)
    this.assignTextures()
    this.emit()
  }

  private baseZ(l: LeafObj) {
    const n = this.leaves.length
    const p = clamp01(l.p)
    const right = (n - l.index) * GAP
    const left = (l.index + 1) * GAP
    return right + (left - right) * p + Math.sin(Math.PI * p) * GAP * 4
  }

  private applyLeaf(l: LeafObj, flex: number) {
    l.u.uProgress.value = clamp01(l.p)
    l.u.uFlex.value = flex
    l.group.position.z = this.baseZ(l)
  }

  private setVisibility() {
    const lo = this.turned - 3, hi = this.turned + 2
    for (const l of this.leaves) {
      l.group.visible = (l.index >= lo && l.index <= hi) || !!l.tween || l.follow !== undefined
    }
  }

  /**
   * Gutter bow for each sheet. The top sheet of a stack bows most and every
   * sheet below bows less, so nothing can rise through what lies on it. While
   * a sheet is lifting off (or landing on) a stack, that stack lies flat until
   * the sheet has cleared it. Returns true while anything is still easing.
   */
  private updateBows(dt: number, snap = false) {
    const moving = (l: LeafObj) => !!l.tween || l.follow !== undefined
    const movers = this.leaves.filter(moving)
    const rightBlocked = movers.some(l => l.p < 0.5)
    const leftBlocked = movers.some(l => l.p >= 0.5)
    const right = this.leaves.filter(l => !moving(l) && l.p < 0.5)
    const left = this.leaves.filter(l => !moving(l) && l.p >= 0.5).reverse()
    for (const l of movers) l.restLift = REST_LIFT
    right.forEach((l, d) => { l.restLift = rightBlocked ? 0 : REST_LIFT / (1 + d * 0.45) })
    left.forEach((l, d) => { l.restLift = leftBlocked ? 0 : REST_LIFT / (1 + d * 0.45) })
    let easing = false
    for (const l of this.leaves) {
      const v = l.u.uRestLift.value
      const diff = l.restLift - v
      if (snap || Math.abs(diff) < 1e-5) { l.u.uRestLift.value = l.restLift; continue }
      // Flatten quickly, rise gently.
      l.u.uRestLift.value = v + diff * (1 - Math.exp(-dt / (diff < 0 ? 0.04 : 0.15)))
      easing = true
    }
    for (const stack of [right, left]) {
      let ceiling = Infinity
      for (const l of stack) {
        l.u.uRestLift.value = Math.min(l.u.uRestLift.value, ceiling)
        ceiling = l.u.uRestLift.value
      }
    }
    return easing
  }

  /** Animate to a committed state, turning every leaf in between. */
  private turnTo(target: number) {
    target = Math.max(0, Math.min(this.max(), target))
    if (target === this.turned || this.drag?.leaf) return
    const forward = target > this.turned
    const order = forward ? this.leaves.slice(this.turned, target) : this.leaves.slice(target, this.turned).reverse()
    const jump = order.length > 1
    const now = performance.now() / 1000
    order.forEach((l, i) => {
      const to = forward ? 1 : 0
      l.wobble = 0.94 + Math.random() * 0.14
      l.u.uDir.value = forward ? 1 : -1
      l.u.uGrabY.value = 0.28 + Math.random() * 0.2
      l.follow = undefined
      l.tween = {
        from: l.p, to, start: now + (jump ? i * 0.055 : 0),
        dur: MOTION[l.data.kind].flip * l.wobble * Math.max(0.2, Math.abs(to - l.p)) * (jump ? 0.72 : 1),
      }
    })
    this.opts.sound.grab(order[0].data.kind)
    this.turned = target
    this.peeked = undefined
    this.afterStateChange()
  }

  private afterStateChange() {
    this.setVisibility()
    this.assignTextures()
    this.updateGoal()
    this.emit()
    this.wake()
  }

  // ---------------------------------------------------------------------------
  // Artwork. Pages near the open spread get real textures, drawn and uploaded
  // to the GPU in idle time so a turn never waits on them.

  private faceKey(face: Face) { return `${face.spec.id}|${face.side}` }

  private requestFace(key: string, face: Face, priority: number) {
    if (this.textures.has(key)) return
    const job = this.jobs.get(key)
    if (job) { job.priority = Math.min(job.priority, priority); return }
    this.jobs.set(key, {
      priority,
      run: () => {
        const r = renderPage(face.spec, face.side, face.folio, this.texW)
        const tex = new CanvasTexture(r.canvas)
        tex.colorSpace = SRGBColorSpace
        tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
        this.renderer.initTexture(tex)
        this.textures.set(key, { tex, hot: r.hotspots })
        for (const l of this.leaves) this.applyTextures(l)
        this.wake()
      },
    })
  }

  private applyTextures(l: LeafObj) {
    const front = l.wantFront ? this.textures.get(l.wantFront) : undefined
    if (front && l.frontKey !== l.wantFront) {
      if (l.sheet) l.sheet.map = front.tex
      if (l.prints) for (const m of l.prints) m.map = front.tex
      if (l.depth && l.data.kind === 'sleeve') l.depth.map = front.tex
      l.frontKey = l.wantFront
    }
    if (!l.sheet) return
    if (l.wantBack === 'plain') {
      if (l.backKey !== 'plain') { setBackMap(l.sheet, l.data.kind === 'sleeve' ? this.clear : this.plain); l.backKey = 'plain' }
      return
    }
    const back = l.wantBack ? this.textures.get(l.wantBack) : undefined
    if (back && l.backKey !== l.wantBack) {
      setBackMap(l.sheet, back.tex)
      l.backKey = l.wantBack
    }
  }

  private assignTextures() {
    const lo = this.turned - 3, hi = this.turned + 2
    const keep = new Set<string>()
    // Pages on show right now, including those seen through vellum or a sleeve.
    const onShow = new Set<number>()
    for (let k = this.turned; k < this.leaves.length; k++) {
      onShow.add(k)
      if (!isOverlay(this.leaves[k].data.kind)) break
    }
    for (let k = this.turned - 1; k >= 0; k--) {
      onShow.add(k)
      if (!isOverlay(this.leaves[k].data.kind)) break
    }
    for (const l of this.leaves) {
      const inWindow = l.index >= lo && l.index <= hi
      if (!inWindow) {
        // Pages flying past keep what they have; buried pages let it go.
        if ((l.tween || l.follow !== undefined) && l.frontKey) {
          keep.add(l.frontKey)
          if (l.backKey) keep.add(l.backKey)
          continue
        }
        if (l.frontKey) {
          const blank = l.data.kind === 'sleeve' ? this.clear : l.data.kind === 'vellum' ? this.white : this.plain
          if (l.sheet) { l.sheet.map = blank; setBackMap(l.sheet, blank) }
          if (l.prints) for (const m of l.prints) m.map = blank
          if (l.depth && l.data.kind === 'sleeve') l.depth.map = this.clear
        }
        l.wantFront = l.wantBack = l.frontKey = l.backKey = undefined
        continue
      }
      const priority = onShow.has(l.index) ? 0 : 1 + Math.abs(l.index - this.turned + 0.5)
      const { front, back } = l.data
      l.wantFront = this.faceKey(front)
      keep.add(l.wantFront)
      this.requestFace(l.wantFront, front, priority)
      if (back && l.data.kind !== 'vellum') {
        l.wantBack = this.faceKey(back)
        keep.add(l.wantBack)
        this.requestFace(l.wantBack, back, priority + 0.25)
      } else {
        l.wantBack = 'plain'
      }
      this.applyTextures(l)
    }
    for (const [key, t] of this.textures) {
      if (keep.has(key)) continue
      t.tex.dispose()
      this.textures.delete(key)
    }
    for (const key of this.jobs.keys()) if (!keep.has(key)) this.jobs.delete(key)
    this.scheduleIdle()
  }

  /** Draw the open spread's pages right away (first paint, after a resize). */
  private flushUrgent() {
    for (const [key, job] of [...this.jobs].sort((a, b) => a[1].priority - b[1].priority)) {
      if (job.priority > 0.5) break
      this.jobs.delete(key)
      job.run()
    }
  }

  private scheduleIdle() {
    if (this.idle || !this.jobs.size || this.disposed) return
    const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    this.idle = ric ? ric(this.pump, { timeout: 300 }) : window.setTimeout(this.pump, 40)
  }

  private cancelIdle() {
    if (!this.idle) return
    const cic = (window as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback
    if (cic) cic(this.idle); else clearTimeout(this.idle)
    this.idle = 0
  }

  private pump = () => {
    this.idle = 0
    if (this.disposed) return
    let best: [string, Job] | undefined
    for (const e of this.jobs) if (!best || e[1].priority < best[1].priority) best = e
    // Keep motion smooth: while a page moves, only draw what is already on show.
    if (best && (this.drag?.leaf || this.raf) && best[1].priority > 0.5) { this.idle = window.setTimeout(this.pump, 150); return }
    if (best) {
      this.jobs.delete(best[0])
      best[1].run()
    }
    this.scheduleIdle()
  }

  /** Compile every material variant now (behind the loader), not on first use mid-flip. */
  private precompile() {
    const hidden = this.leaves.filter(l => !l.group.visible)
    for (const l of hidden) l.group.visible = true
    this.renderer.compile(this.scene, this.camera)
    for (const l of hidden) l.group.visible = false
  }

  // ---------------------------------------------------------------------------
  // Layout & camera

  private resize(initial = false) {
    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight
    this.width = w
    this.height = h
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = `${w}px`
    this.renderer.domElement.style.height = `${h}px`
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    const mode = chooseMode(w, h, this.opts.chrome.top + this.opts.chrome.bottom)
    if (initial || mode !== this.mode) {
      const anchor = initial ? undefined : anchorPage(this.leafData(), this.mode, this.turned)
      const page = anchor ?? this.opts.startPage
      const turned = page ? stateForPage(buildLeaves(this.opts.book, mode), mode, page) : this.turned
      this.updateTexSize(w, h, mode)
      this.build(mode, turned)
      this.setVisibility()
      this.updateBows(0, true)
      this.flushUrgent()
      this.precompile()
    } else if (this.updateTexSize(w, h, mode)) {
      this.assignTextures()
      this.flushUrgent()
    }
    this.updateGoal()
    if (initial) this.pose = { ...this.goal }
    this.wake()
  }

  /** Texture resolution follows the on-screen page size. Returns true when it changed. */
  private updateTexSize(w: number, h: number, mode: Mode) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const pageCssH = Math.min(h * 0.85, mode === 'spread' ? (w * 0.46) / PAGE_ASPECT : (w * 0.9) / PAGE_ASPECT)
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const maxH = coarse ? 1792 : 2304
    const texH = Math.max(1024, Math.min(maxH, Math.ceil((pageCssH * dpr * 1.1) / 256) * 256))
    const texW = Math.round((texH * PAGE_ASPECT) / 8) * 8
    if (texW === this.texW || (texW < this.texW && texW > this.texW * 0.7)) return false
    this.texW = texW
    for (const t of this.textures.values()) t.tex.dispose()
    this.textures.clear()
    this.jobs.clear()
    for (const l of this.leaves) l.frontKey = l.backKey = undefined
    return true
  }

  private updateGoal() {
    const max = this.max()
    const spread = this.mode === 'spread'
    const cx = spread ? (this.turned === 0 ? W / 2 : this.turned === max ? -W / 2 : 0) : W / 2
    this.goal = this.fit(cx, spread ? 2 * W : W, spread ? 0.1 : 0.3, spread ? 0 : 0.42)
  }

  private placeCamera(cam: PerspectiveCamera, p: Pose) {
    const s = Math.sin(p.polar)
    cam.position.set(p.tx + p.dist * s * Math.sin(p.azim), p.ty - p.dist * s * Math.cos(p.azim), p.dist * Math.cos(p.polar))
    cam.up.set(0, 1, 0)
    cam.lookAt(p.tx, p.ty, 0)
    cam.updateMatrixWorld()
  }

  /** Finds the camera distance (and recentres) so the region fits between the UI bars. */
  private fit(cx: number, span: number, polar: number, azim: number): Pose {
    const cam = this.camera.clone()
    // Phones get the page as large as possible; the stack at the spine frames it.
    const pad = this.mode === 'single' ? 10 : Math.max(14, Math.min(this.width, this.height) * 0.035)
    const mx = (2 * pad) / this.width
    const mTop = (2 * (this.opts.chrome.top + pad)) / this.height
    const mBot = (2 * (this.opts.chrome.bottom + pad)) / this.height
    const corners: Vector3[] = []
    for (const x of [cx - span / 2, cx + span / 2]) for (const y of [-H / 2, H / 2]) for (const z of [0, 0.06]) corners.push(new Vector3(x, y, z))
    const pose: Pose = { tx: cx, ty: 0, dist: 4, polar, azim }
    const v = new Vector3()
    const bounds = () => {
      this.placeCamera(cam, pose)
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const c of corners) {
        v.copy(c).project(cam)
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y)
      }
      return { x0, x1, y0, y1 }
    }
    for (let pass = 0; pass < 3; pass++) {
      let lo = 0.5, hi = 40
      for (let i = 0; i < 26; i++) {
        pose.dist = (lo + hi) / 2
        const b = bounds()
        if (b.x0 >= -1 + mx && b.x1 <= 1 - mx && b.y0 >= -1 + mBot && b.y1 <= 1 - mTop) hi = pose.dist
        else lo = pose.dist
      }
      pose.dist = hi
      const b = bounds()
      const dx = (b.x0 + b.x1) / 2
      const dy = (b.y0 + b.y1) / 2 - (mBot - mTop) / 2
      const visH = 2 * pose.dist * Math.tan((cam.fov * Math.PI) / 360)
      const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0)
      const up = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1)
      pose.tx += (dx * visH * cam.aspect * right.x) / 2 + (dy * visH * up.x) / 2
      pose.ty += (dx * visH * cam.aspect * right.y) / 2 + (dy * visH * up.y) / 2
    }
    return pose
  }

  // ---------------------------------------------------------------------------
  // Input

  private bindInput(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointermove', this.onMove)
    canvas.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('pointercancel', this.onUp)
    canvas.addEventListener('pointerleave', this.onLeave)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('keydown', this.onKey)
  }

  /** Pointer position on the table plane, in book units (spine at x = 0). */
  private planePoint(e: PointerEvent | MouseEvent) {
    const r = this.renderer.domElement.getBoundingClientRect()
    const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = new Vector3()
    return this.raycaster.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), 0), hit) ? hit : undefined
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    this.opts.sound.unlock()
    const pt = this.planePoint(e)
    if (!pt || this.drag) return
    this.renderer.domElement.setPointerCapture(e.pointerId)
    this.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, wx: pt.x, wy: pt.y, forward: true, p0: 0, radius: W, samples: [], moved: false }
  }

  private onMove = (e: PointerEvent) => {
    const d = this.drag
    const pt = this.planePoint(e)
    if (!d) {
      if (e.pointerType === 'mouse' && pt) this.hover(e, pt)
      return
    }
    if (e.pointerId !== d.id || !pt) return
    const dxPx = e.clientX - d.sx, dyPx = e.clientY - d.sy
    if (!d.moved) {
      if (Math.hypot(dxPx, dyPx) < DRAG_START_PX) return
      d.moved = true
      this.startDrag(d, dxPx)
    }
    const l = d.leaf
    if (!l) return
    let p: number
    if (this.mode === 'spread') {
      const q = (x: number) => Math.acos(Math.max(-1, Math.min(1, x / d.radius))) / Math.PI
      p = d.p0 + q(pt.x) - q(d.wx)
    } else {
      p = d.p0 - (pt.x - d.wx) / (W * 1.05)
    }
    l.follow = clamp01(p)
    l.u.uGrabY.value = clamp01(pt.y / H + 0.5)
    const now = performance.now() / 1000
    d.samples.push({ t: now, p: l.follow })
    while (d.samples.length > 2 && now - d.samples[0].t > 0.1) d.samples.shift()
    this.renderer.domElement.style.cursor = 'grabbing'
    this.wake()
  }

  private startDrag(d: Drag, dxPx: number) {
    const max = this.max()
    let leaf: LeafObj | undefined
    let forward = true
    if (this.mode === 'spread') {
      if (Math.abs(d.wy) > H / 2 + 0.05) return
      if (d.wx > 0 && this.turned < max) leaf = this.leaves[this.turned]
      else if (d.wx < 0 && this.turned > 0) { leaf = this.leaves[this.turned - 1]; forward = false }
    } else {
      if (dxPx < 0 && this.turned < max) leaf = this.leaves[this.turned]
      else if (dxPx > 0 && this.turned > 0) { leaf = this.leaves[this.turned - 1]; forward = false }
    }
    if (!leaf) return
    this.peeked = undefined
    leaf.tween = undefined
    leaf.follow = leaf.p
    leaf.landedAt = null
    leaf.wobble = 0.94 + Math.random() * 0.14
    leaf.u.uDir.value = forward ? 1 : -1
    d.leaf = leaf
    d.forward = forward
    d.p0 = leaf.p
    d.radius = Math.max(0.45 * W, Math.min(W, Math.abs(d.wx)))
    this.opts.sound.grab(leaf.data.kind)
    this.setVisibility()
  }

  private onUp = (e: PointerEvent) => {
    const d = this.drag
    if (!d || e.pointerId !== d.id) return
    this.drag = undefined
    const l = d.leaf
    if (!l) {
      if (!d.moved && e.type === 'pointerup') this.tap(e, d)
      return
    }
    const s = d.samples
    const v = s.length > 1 ? (s[s.length - 1].p - s[0].p) / Math.max(0.016, s[s.length - 1].t - s[0].t) : 0
    const moved = d.forward ? l.p - d.p0 : d.p0 - l.p
    const toward = d.forward ? v : -v
    const commit = e.type === 'pointerup' && (toward > 1.1 || (moved > 0.15 && toward > -0.6))
    const to = d.forward === commit ? 1 : 0
    const dist = Math.max(0.02, Math.abs(to - l.p))
    const dur = MOTION[l.data.kind].fall * l.wobble * Math.sqrt(dist)
    const vel = to > l.p ? v : -v
    l.follow = undefined
    l.u.uDir.value = to > l.p ? 1 : -1
    l.tween = { from: l.p, to, start: performance.now() / 1000, dur, launch: Math.max(0, Math.min(2, (vel * dur) / dist)) }
    if (commit) this.turned = d.forward ? l.index + 1 : l.index
    this.renderer.domElement.style.cursor = ''
    this.afterStateChange()
  }

  private onLeave = () => {
    if (this.peeked && !this.drag) this.unpeek()
  }

  private tap(e: PointerEvent, d: Drag) {
    const href = this.hotspotAt(e)
    if (href) {
      if (href.startsWith('mailto:')) window.location.href = href
      else window.open(href, '_blank', 'noopener,noreferrer')
      return
    }
    if (this.mode === 'spread') {
      if (Math.abs(d.wy) > H / 2 + 0.05 || Math.abs(d.wx) > W + 0.05) return
      if (d.wx >= 0) this.next(); else this.prev()
    } else if (e.clientX > this.width * 0.3) this.next()
    else this.prev()
  }

  /** Links printed on the open pages. Loose sheets on top don't block them. */
  private hotspotAt(e: PointerEvent | MouseEvent): string | undefined {
    const pt = this.planePoint(e)
    if (!pt || Math.abs(pt.y) > H / 2) return undefined
    let key: string | undefined
    let u: number
    if (pt.x >= 0 && pt.x <= W) {
      let k = this.turned
      while (this.leaves[k] && isOverlay(this.leaves[k].data.kind)) k++
      key = this.leaves[k]?.frontKey
      u = pt.x / W
    } else if (pt.x < 0 && pt.x >= -W && this.mode === 'spread') {
      let k = this.turned - 1
      while (this.leaves[k] && isOverlay(this.leaves[k].data.kind)) k--
      key = this.leaves[k]?.backKey
      u = (pt.x + W) / W
    } else return undefined
    const hot = key ? this.textures.get(key)?.hot : undefined
    const x = u * PAGE_W, y = (0.5 - pt.y / H) * PAGE_H
    return hot?.find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h)?.href
  }

  /** Desktop: lift the corner a touch when the mouse nears a page edge. */
  private hover(e: PointerEvent, pt: Vector3) {
    const canvas = this.renderer.domElement
    const overLink = !!this.hotspotAt(e)
    const max = this.max()
    const onPage = Math.abs(pt.y) < H / 2 && Math.abs(pt.x) < W
    let leaf: LeafObj | undefined
    if (this.mode === 'spread' && onPage && !overLink) {
      if (pt.x > W * 0.74 && this.turned < max) leaf = this.leaves[this.turned]
      else if (pt.x < -W * 0.74 && this.turned > 0) leaf = this.leaves[this.turned - 1]
    }
    canvas.style.cursor = overLink ? 'pointer' : onPage ? 'grab' : ''
    if (leaf === this.peeked) return
    this.unpeek()
    if (!leaf || leaf.tween || leaf.follow !== undefined) return
    const fwd = leaf.index === this.turned
    leaf.u.uDir.value = fwd ? 1 : -1
    leaf.u.uGrabY.value = clamp01(pt.y / H + 0.5)
    leaf.tween = { from: leaf.p, to: fwd ? PEEK : 1 - PEEK, start: performance.now() / 1000, dur: 0.28 }
    this.peeked = leaf
    this.setVisibility()
    this.wake()
  }

  private unpeek() {
    const l = this.peeked
    this.peeked = undefined
    if (!l || l.follow !== undefined) return
    const to = l.index < this.turned ? 1 : 0
    if (l.p === to) return
    l.tween = { from: l.p, to, start: performance.now() / 1000, dur: 0.24 }
    this.wake()
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const now = performance.now()
    if (now < this.wheelLock) return
    this.wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    if (Math.abs(this.wheelAcc) > 70) {
      this.opts.sound.unlock()
      if (this.wheelAcc > 0) this.next(); else this.prev()
      this.wheelAcc = 0
      this.wheelLock = now + 380
    }
  }

  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
    const map: Record<string, () => void> = {
      ArrowRight: () => this.next(), PageDown: () => this.next(),
      ArrowLeft: () => this.prev(), PageUp: () => this.prev(),
      Home: () => this.first(), End: () => this.last(),
    }
    const fn = map[e.key]
    if (!fn) return
    e.preventDefault()
    this.opts.sound.unlock()
    fn()
  }

  // ---------------------------------------------------------------------------
  // Frame loop: runs only while something moves. Motion is time-based, so a
  // slow device drops frames rather than playing in slow motion.

  private wake() {
    if (this.raf || this.disposed) return
    this.lastFrame = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (nowMs: number) => {
    this.raf = 0
    const now = nowMs / 1000
    const dt = Math.min(0.1, Math.max(0.001, (nowMs - this.lastFrame) / 1000))
    this.lastFrame = nowMs
    let active = false
    let loudest = 0
    let loudKind: LeafKind = 'paper'
    let settled = false
    for (const l of this.leaves) {
      const before = l.p
      if (l.follow !== undefined) {
        l.p += (l.follow - l.p) * (1 - Math.exp(-dt / FOLLOW))
        if (Math.abs(l.follow - l.p) > 1e-4) active = true
      } else if (l.tween) {
        const tw = l.tween
        const r = (now - tw.start) / tw.dur
        if (r < 0) {
          active = true
        } else {
          const e = r >= 1 ? 1 : tw.launch === undefined ? ease(r) : hermite(r, tw.launch)
          l.p = tw.from + (tw.to - tw.from) * e
          active = true
          if (r >= 1) {
            l.p = tw.to
            l.tween = undefined
            settled = true
            if ((tw.to === 0 || tw.to === 1) && Math.abs(tw.to - tw.from) > 0.2) {
              this.opts.sound.land(l.data.kind, Math.min(1, Math.abs(tw.to - tw.from)))
              if (MOTION[l.data.kind].bounce > 0 && !this.opts.reducedMotion) l.landedAt = now
              if (l.data.kind === 'cover' || l.data.kind === 'sleeve') navigator.vibrate?.(8)
            }
          }
        }
      }
      let flex = 0
      if (l.landedAt !== null) {
        const s = now - l.landedAt
        if (s < 0.9) {
          flex = MOTION[l.data.kind].bounce * Math.exp(-s / 0.16) * Math.sin(2 * Math.PI * 3.4 * s)
          active = true
        } else l.landedAt = null
      }
      const speed = Math.abs(l.p - before) / dt
      if (speed > loudest) { loudest = speed; loudKind = l.data.kind }
      if (l.p !== before || flex !== l.u.uFlex.value) this.applyLeaf(l, flex)
    }
    if (settled) this.setVisibility()
    if (this.updateBows(dt)) active = true
    if (loudest > 0.05) this.opts.sound.move(loudest, loudKind)
    else this.opts.sound.quiet()

    const e = 1 - Math.exp(-dt * 6)
    let camMoving = false
    for (const key of ['tx', 'ty', 'dist', 'polar', 'azim'] as const) {
      const diff = this.goal[key] - this.pose[key]
      if (Math.abs(diff) > 1e-4) { this.pose[key] += diff * e; camMoving = true } else this.pose[key] = this.goal[key]
    }
    this.placeCamera(this.camera, this.pose)
    this.renderer.shadowMap.needsUpdate = true
    this.renderer.render(this.scene, this.camera)
    if (active || camMoving || this.drag?.leaf) this.raf = requestAnimationFrame(this.frame)
  }

  private emit() {
    const data = this.leafData()
    const { left, right } = visibleFaces(data, this.mode, this.turned)
    const top = data[this.turned]
    const overlay = top && isOverlay(top.kind) ? top : undefined
    this.opts.onState({
      mode: this.mode,
      turned: this.turned,
      max: this.max(),
      left,
      right,
      overlay: overlay?.kind ?? null,
      section: (overlay?.front ?? right ?? left)?.spec.section ?? '',
    })
  }
}
