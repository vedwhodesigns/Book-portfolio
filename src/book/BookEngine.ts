import {
  AdditiveBlending, AmbientLight, BackSide, CanvasTexture, Color, DirectionalLight, DoubleSide, FrontSide, Group, Mesh,
  MeshDepthMaterial, MeshPhysicalMaterial, MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, Plane, PlaneGeometry,
  PMREMGenerator, Raycaster, RGBADepthPacking, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
  type BufferGeometry, type Texture,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { bendLeaf, createLeafGeometry } from './bend'
import { renderBackground } from './background'
import {
  anchorPage, buildLeaves, chooseMode, isOverlay, maxTurned, stateForPage, visibleFaces,
  type Face, type Leaf, type LeafKind, type Mode,
} from './layout'
import { PAGE_ASPECT, PAGE_H, PAGE_W, renderPage, renderPlain, renderShowThrough } from './pageArt'
import type { PaperSound } from './paperSound'
import { renderCrinkleNormals } from './plastic'
import type { BookSpec, Hotspot } from './types'

const W = 1
const H = 1 / PAGE_ASPECT
const EPS = 0.0022
const PEEK = 0.05
const DRAG_START_PX = 6

/**
 * Material physics per sheet type.
 * curl: how far the sheet bows while turning (radians).
 * zeta: damping ratio of the turn spring (<1 overshoots a little).
 * flexHz/flexZeta/kick: the springy edge bounce when the sheet lands.
 */
const PHYSICS: Record<LeafKind, { curl: number; zeta: number; flexHz: number; flexZeta: number; kick: number }> = {
  paper: { curl: 1.15, zeta: 0.92, flexHz: 3.2, flexZeta: 0.55, kick: 0.35 },
  cover: { curl: 0.32, zeta: 1, flexHz: 4, flexZeta: 1, kick: 0 },
  vellum: { curl: 1.5, zeta: 0.85, flexHz: 2.6, flexZeta: 0.4, kick: 0.6 },
  sleeve: { curl: 0.78, zeta: 0.72, flexHz: 5.5, flexZeta: 0.16, kick: 1.1 },
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

interface LeafObj {
  data: Leaf
  index: number
  group: Group
  geom: BufferGeometry
  front: Mesh<BufferGeometry, MeshStandardMaterial>
  back?: Mesh<BufferGeometry, MeshStandardMaterial>
  /** Clear film layer of a plastic sleeve (reflections only). */
  gloss?: Mesh<BufferGeometry, MeshPhysicalMaterial>
  p: number
  v: number
  target: number
  dir: 1 | -1
  grabY: number
  curl: number
  /** Edge bounce (radians) and its velocity. */
  flex: number
  flexV: number
  dragging: boolean
  /** Seconds to wait before animating (staggered chapter jumps). */
  delay: number
  landed: boolean
  dirty: boolean
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
  p0: number
  radius: number
  samples: { t: number; p: number }[]
  moved: boolean
}

export class BookEngine {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(24, 1, 0.1, 60)
  private book = new Group()
  private light: DirectionalLight
  private leaves: LeafObj[] = []
  private mode: Mode = 'spread'
  private turned = 0
  private pose: Pose = { tx: 0, ty: 0, dist: 6, polar: 0.12, azim: 0 }
  private goal: Pose = { ...this.pose }
  private textures = new Map<string, { tex: CanvasTexture; hot: Hotspot[]; canvas: HTMLCanvasElement }>()
  private plain?: CanvasTexture
  private env: Texture
  private crinkle: CanvasTexture
  private queue: (() => void)[] = []
  private texW = 1024
  private raf = 0
  private lastFrame = 0
  private drag?: Drag
  private hoverPeek?: LeafObj
  private wheelAcc = 0
  private wheelLock = 0
  private width = 1
  private height = 1
  private ro: ResizeObserver
  private raycaster = new Raycaster()
  private disposed = false

  constructor(private container: HTMLElement, private opts: EngineOptions) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFSoftShadowMap
    this.renderer.setClearColor(new Color('#121110'))
    const canvas = this.renderer.domElement
    canvas.style.touchAction = 'none'
    canvas.style.display = 'block'
    canvas.setAttribute('aria-hidden', 'true')
    container.appendChild(canvas)

    this.scene.add(new AmbientLight(0xffffff, 1.25))
    this.light = new DirectionalLight(0xfff6ea, 2.35)
    this.light.position.set(-2.4, 2.8, 6.5)
    this.light.castShadow = true
    const coarse = window.matchMedia('(pointer: coarse)').matches
    this.light.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048)
    const sc = this.light.shadow.camera
    sc.left = -2.6; sc.right = 2.6; sc.top = 2.2; sc.bottom = -2.2; sc.near = 1; sc.far = 16
    this.light.shadow.bias = -0.0004
    this.light.shadow.normalBias = 0.012
    this.scene.add(this.light)

    // Studio reflections, used only by the plastic film so paper stays matte.
    const pmrem = new PMREMGenerator(this.renderer)
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    this.crinkle = new CanvasTexture(renderCrinkleNormals(1024))

    const bgTex = new CanvasTexture(renderBackground(2048))
    bgTex.colorSpace = SRGBColorSpace
    const bg = new Mesh(new PlaneGeometry(7, 7), new MeshStandardMaterial({ map: bgTex, roughness: 0.95, color: 0x8c8a86 }))
    bg.position.z = -0.03
    bg.receiveShadow = true
    this.scene.add(bg)
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
  last() { this.turnTo(maxTurned(this.leaves.map(l => l.data), this.mode)) }

  goToPage(pageId: string) {
    this.turnTo(stateForPage(this.leaves.map(l => l.data), this.mode, pageId))
  }

  setChrome(chrome: { top: number; bottom: number }) {
    this.opts.chrome = chrome
    this.resize()
  }

  destroy() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    window.removeEventListener('keydown', this.onKey)
    for (const t of this.textures.values()) t.tex.dispose()
    this.plain?.dispose()
    this.env.dispose()
    this.crinkle.dispose()
    this.clearLeaves()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  // ---------------------------------------------------------------------------
  // Leaves

  private clearLeaves() {
    for (const l of this.leaves) {
      l.geom.dispose()
      l.front.material.dispose()
      l.front.customDepthMaterial?.dispose()
      l.back?.material.dispose()
      l.gloss?.material.dispose()
      this.book.remove(l.group)
    }
    this.leaves = []
  }

  private build(mode: Mode, turned: number) {
    this.clearLeaves()
    // Pending artwork jobs belong to the old leaves.
    this.queue = []
    this.mode = mode
    const data = buildLeaves(this.opts.book, mode)
    this.turned = Math.max(0, Math.min(turned, maxTurned(data, mode)))
    this.leaves = data.map((leaf, index) => {
      const kind = leaf.kind
      const vellum = kind === 'vellum'
      const sleeve = kind === 'sleeve'
      const geom = createLeafGeometry(W, H, kind === 'cover' ? 24 : 44, sleeve ? 14 : 10)
      const roughness = kind === 'cover' ? 0.55 : sleeve ? 0.6 : 0.88
      const front = new Mesh(
        geom,
        new MeshStandardMaterial({
          roughness,
          metalness: 0,
          side: vellum ? DoubleSide : FrontSide,
          transparent: vellum || sleeve,
          depthWrite: !vellum,
        }),
      )
      front.material.shadowSide = DoubleSide
      front.castShadow = !vellum
      front.receiveShadow = true
      front.renderOrder = 1
      if (sleeve) {
        // Shadows follow the items inside the pocket, not the clear film.
        front.customDepthMaterial = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, alphaTest: 0.5, side: DoubleSide })
      }
      const group = new Group()
      group.add(front)
      let back: Mesh<BufferGeometry, MeshStandardMaterial> | undefined
      if (!vellum) {
        back = new Mesh(geom, new MeshStandardMaterial({ roughness, metalness: 0, side: BackSide, transparent: sleeve }))
        back.receiveShadow = true
        back.renderOrder = 1
        group.add(back)
      }
      let gloss: LeafObj['gloss']
      if (sleeve) {
        // The film adds light (reflections, crinkle highlights) and never darkens.
        gloss = new Mesh(
          geom,
          new MeshPhysicalMaterial({
            color: 0x000000,
            roughness: 0.1,
            metalness: 0,
            normalMap: this.crinkle,
            envMap: this.env,
            envMapIntensity: 0.85,
            side: DoubleSide,
            transparent: true,
            blending: AdditiveBlending,
            depthWrite: false,
          }),
        )
        gloss.material.normalScale.set(0.3, 0.3)
        gloss.renderOrder = 2
        group.add(gloss)
      }
      this.book.add(group)
      const p = index < this.turned ? 1 : 0
      const obj: LeafObj = {
        data: leaf, index, group, geom, front, back, gloss,
        p, v: 0, target: p, dir: 1, grabY: 0.5, curl: PHYSICS[kind].curl * (this.opts.reducedMotion ? 0.5 : 1),
        flex: 0, flexV: 0, dragging: false, delay: 0, landed: true, dirty: true,
      }
      return obj
    })
    for (const l of this.leaves) this.applyBend(l)
    this.assignTextures()
    this.emit()
  }

  private baseZ(l: LeafObj) {
    const n = this.leaves.length
    const zRight = (n - l.index) * EPS
    const zLeft = (l.index + 1) * EPS
    return zRight + (zLeft - zRight) * Math.min(1, Math.max(0, l.p)) + Math.sin(Math.PI * Math.min(1, Math.max(0, l.p))) * EPS * 6
  }

  private applyBend(l: LeafObj) {
    bendLeaf(l.geom, { p: Math.min(1, Math.max(0, l.p)), dir: l.dir, grabY: l.grabY, curl: l.curl, flex: l.flex })
    l.group.position.z = this.baseZ(l)
    l.dirty = false
  }

  /** Start animating toward a committed state, flipping every leaf in between. */
  private turnTo(target: number) {
    const max = maxTurned(this.leaves.map(l => l.data), this.mode)
    target = Math.max(0, Math.min(max, target))
    if (target === this.turned || this.drag?.leaf) return
    const forward = target > this.turned
    const span = Math.abs(target - this.turned)
    const order = forward
      ? this.leaves.slice(this.turned, target)
      : this.leaves.slice(target, this.turned).reverse()
    order.forEach((l, i) => {
      l.target = forward ? 1 : 0
      l.dir = forward ? 1 : -1
      l.grabY = 0.3 + Math.random() * 0.15
      l.delay = span > 1 ? i * 0.07 : 0
      l.landed = false
    })
    this.opts.sound.grab(order[0].data.kind)
    this.turned = target
    this.hoverPeek = undefined
    this.assignTextures()
    this.updateGoal()
    this.emit()
    this.wake()
  }

  // ---------------------------------------------------------------------------
  // Textures: only leaves near the open spread get real artwork.

  private faceKey(face: Face, flipped: boolean) {
    return `${face.spec.id}|${face.side}|${flipped ? 'b' : 'f'}`
  }

  private makeTexture(key: string, canvas: HTMLCanvasElement, hot: Hotspot[], flipped: boolean) {
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
    if (flipped) {
      tex.repeat.set(-1, 1)
      tex.offset.set(1, 0)
    }
    const entry = { tex, hot, canvas }
    this.textures.set(key, entry)
    return entry
  }

  private faceTexture(face: Face, flipped: boolean) {
    const key = this.faceKey(face, flipped)
    const hit = this.textures.get(key)
    if (hit) return hit
    const r = renderPage(face.spec, face.side, face.folio, this.texW)
    return this.makeTexture(key, r.canvas, r.hotspots, flipped)
  }

  private showThroughTexture(front: Face) {
    const key = `${front.spec.id}|show`
    const hit = this.textures.get(key)
    if (hit) return hit
    const src = this.faceTexture(front, false)
    return this.makeTexture(key, renderShowThrough(src.canvas, this.texW), [], true)
  }

  private plainTexture() {
    if (!this.plain) {
      this.plain = new CanvasTexture(renderPlain(512))
      this.plain.colorSpace = SRGBColorSpace
    }
    return this.plain
  }

  private assignTextures() {
    const needed = new Set<string>()
    const lo = this.turned - 3, hi = this.turned + 2
    const urgent = (l: LeafObj) => l.index >= this.turned - 1 && l.index <= this.turned
    for (const l of this.leaves) {
      const inWindow = l.index >= lo && l.index <= hi
      const { front, back } = l.data
      // See-through sheets can't stand in with plain stock; hide them instead.
      const clear = isOverlay(l.data.kind)
      // Pages flying past during a chapter jump keep their artwork if they have it.
      if (!inWindow && l.target !== l.p && l.frontKey) {
        if (l.frontKey) needed.add(l.frontKey)
        if (l.backKey) needed.add(l.backKey)
        continue
      }
      if (!inWindow) {
        l.front.material.map = this.plainTexture()
        l.front.material.needsUpdate = true
        if (l.back) { l.back.material.map = this.plainTexture(); l.back.material.needsUpdate = true }
        l.frontKey = l.backKey = undefined
        l.group.visible = !clear
        continue
      }
      l.group.visible = true
      const fk = this.faceKey(front, false)
      const bk = back ? this.faceKey(back, true) : `${front.spec.id}|show`
      needed.add(fk)
      if (l.back) needed.add(bk)
      const setFront = () => {
        if (this.disposed || l.frontKey === fk) return
        const tex = this.faceTexture(front, false).tex
        l.front.material.map = tex
        l.front.material.needsUpdate = true
        const depth = l.front.customDepthMaterial as MeshDepthMaterial | undefined
        if (depth) { depth.map = tex; depth.needsUpdate = true }
        l.frontKey = fk
        this.wake()
      }
      const setBack = () => {
        if (this.disposed || !l.back || l.backKey === bk) return
        l.back.material.map = (back ? this.faceTexture(back, true) : this.showThroughTexture(front)).tex
        l.back.material.needsUpdate = true
        l.backKey = bk
        this.wake()
      }
      if (urgent(l) || clear || this.textures.has(fk)) setFront()
      else this.queue.push(setFront)
      if (urgent(l) || clear || this.textures.has(bk)) setBack()
      else this.queue.push(setBack)
      if (!l.frontKey) { l.front.material.map = this.plainTexture(); l.front.material.needsUpdate = true }
      if (l.back && !l.backKey) { l.back.material.map = this.plainTexture(); l.back.material.needsUpdate = true }
    }
    for (const [key, t] of this.textures) {
      if (needed.has(key)) continue
      // Show-through pages are derived from fronts; keep those fronts alive.
      if ([...needed].some(n => n.endsWith('|show') && key.startsWith(n.split('|')[0] + '|'))) continue
      t.tex.dispose()
      this.textures.delete(key)
    }
    this.wake()
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
    const chromeY = this.opts.chrome.top + this.opts.chrome.bottom
    const mode = chooseMode(w, h, chromeY)
    if (initial || mode !== this.mode) {
      const anchor = initial ? undefined : anchorPage(this.leaves.map(l => l.data), this.mode, this.turned)
      const nextLeaves = buildLeaves(this.opts.book, mode)
      const page = anchor ?? this.opts.startPage
      const turned = page ? stateForPage(nextLeaves, mode, page) : this.turned
      this.updateTexSize(w, h, mode)
      this.build(mode, turned)
    } else if (this.updateTexSize(w, h, mode)) {
      this.assignTextures()
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
    for (const l of this.leaves) l.frontKey = l.backKey = undefined
    return true
  }

  private updateGoal() {
    const max = maxTurned(this.leaves.map(l => l.data), this.mode)
    const spread = this.mode === 'spread'
    const cx = spread ? (this.turned === 0 ? W / 2 : this.turned === max ? -W / 2 : 0) : W / 2
    const span = spread ? 2 * W : W
    const polar = spread ? 0.1 : 0.3
    const azim = spread ? 0 : 0.42
    this.goal = this.fit(cx, span, polar, azim)
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
    const bounds = () => {
      this.placeCamera(cam, pose)
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const c of corners) {
        const v = c.clone().project(cam)
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y)
      }
      return { x0, x1, y0, y1 }
    }
    for (let pass = 0; pass < 3; pass++) {
      let lo = 0.5, hi = 40
      for (let i = 0; i < 28; i++) {
        pose.dist = (lo + hi) / 2
        const b = bounds()
        const fits = b.x0 >= -1 + mx && b.x1 <= 1 - mx && b.y0 >= -1 + mBot && b.y1 <= 1 - mTop
        if (fits) hi = pose.dist; else lo = pose.dist
      }
      pose.dist = hi
      // Recentre the projected box inside the available area.
      const b = bounds()
      const wantX = 0, wantY = (mBot - mTop) / 2
      const dx = (b.x0 + b.x1) / 2 - wantX
      const dy = (b.y0 + b.y1) / 2 - wantY
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

  private ndc(e: PointerEvent | MouseEvent) {
    const r = this.renderer.domElement.getBoundingClientRect()
    return new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  }

  /** Pointer position on the table plane, in book units (spine at x = 0). */
  private planePoint(e: PointerEvent | MouseEvent) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera)
    const hit = new Vector3()
    return this.raycaster.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), 0), hit) ? hit : undefined
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    this.opts.sound.unlock()
    const pt = this.planePoint(e)
    if (!pt || this.drag) return
    this.renderer.domElement.setPointerCapture(e.pointerId)
    this.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, wx: pt.x, wy: pt.y, p0: 0, radius: W, samples: [], moved: false }
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
      p = d.p0 - (pt.x - d.wx) / (W * 1.1)
    }
    l.p = Math.max(0, Math.min(1, p))
    l.dirty = true
    const now = performance.now() / 1000
    d.samples.push({ t: now, p: l.p })
    while (d.samples.length > 2 && now - d.samples[0].t > 0.1) d.samples.shift()
    this.renderer.domElement.style.cursor = 'grabbing'
    this.wake()
  }

  private startDrag(d: Drag, dxPx: number) {
    const max = maxTurned(this.leaves.map(l => l.data), this.mode)
    let leaf: LeafObj | undefined
    let dir: 1 | -1 = 1
    if (this.mode === 'spread') {
      if (Math.abs(d.wy) > H / 2 + 0.05) return
      if (d.wx > 0 && this.turned < max) leaf = this.leaves[this.turned]
      else if (d.wx < 0 && this.turned > 0) { leaf = this.leaves[this.turned - 1]; dir = -1 }
    } else {
      if (dxPx < 0 && this.turned < max) leaf = this.leaves[this.turned]
      else if (dxPx > 0 && this.turned > 0) { leaf = this.leaves[this.turned - 1]; dir = -1 }
    }
    if (!leaf) return
    this.hoverPeek = undefined
    leaf.dragging = true
    leaf.dir = dir
    leaf.grabY = Math.max(0, Math.min(1, d.wy / H + 0.5))
    leaf.delay = 0
    leaf.landed = false
    d.leaf = leaf
    d.p0 = leaf.p
    d.radius = Math.max(0.45 * W, Math.min(W, Math.abs(d.wx)))
    this.opts.sound.grab(leaf.data.kind)
    // Make sure the page underneath has its artwork before it is revealed.
    this.assignTextures()
  }

  private onUp = (e: PointerEvent) => {
    const d = this.drag
    if (!d || e.pointerId !== d.id) return
    this.drag = undefined
    const l = d.leaf
    if (l) {
      l.dragging = false
      const s = d.samples
      const v = s.length > 1 ? (s[s.length - 1].p - s[0].p) / Math.max(0.016, s[s.length - 1].t - s[0].t) : 0
      l.v = v
      const done = v > 1.3 ? true : v < -1.3 ? false : l.p > 0.5
      l.target = done ? 1 : 0
      l.dir = l.target > l.p ? 1 : -1
      const max = maxTurned(this.leaves.map(x => x.data), this.mode)
      this.turned = Math.max(0, Math.min(max, done ? l.index + 1 : l.index))
      this.renderer.domElement.style.cursor = ''
      this.assignTextures()
      this.updateGoal()
      this.emit()
      this.wake()
      return
    }
    if (!d.moved && e.type === 'pointerup') this.tap(e, d)
  }

  private onLeave = () => {
    if (this.hoverPeek && !this.drag) this.unpeek()
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
    } else {
      if (e.clientX > this.width * 0.3) this.next(); else this.prev()
    }
  }

  private hotspotAt(e: PointerEvent | MouseEvent): string | undefined {
    this.raycaster.setFromCamera(this.ndc(e), this.camera)
    const meshes: Mesh[] = []
    for (const l of this.leaves) {
      if (Math.abs(l.index - this.turned) > 3) continue
      meshes.push(l.front)
      if (l.back) meshes.push(l.back)
    }
    for (const hit of this.raycaster.intersectObjects(meshes, false)) {
      const l = this.leaves.find(x => x.front === hit.object || x.back === hit.object)
      if (!l || isOverlay(l.data.kind) || !hit.uv) continue
      const isBack = hit.object === l.back
      const key = isBack ? l.backKey : l.frontKey
      const hot = key ? this.textures.get(key)?.hot : undefined
      const x = (isBack ? 1 - hit.uv.x : hit.uv.x) * PAGE_W
      const y = (1 - hit.uv.y) * PAGE_H
      return hot?.find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h)?.href
    }
    return undefined
  }

  /** Desktop: lift the corner a touch when the mouse nears a page edge. */
  private hover(e: PointerEvent, pt: Vector3) {
    const canvas = this.renderer.domElement
    const overHot = !!this.hotspotAt(e)
    const max = maxTurned(this.leaves.map(l => l.data), this.mode)
    const onPage = Math.abs(pt.y) < H / 2 && Math.abs(pt.x) < W
    let leaf: LeafObj | undefined
    if (this.mode === 'spread' && onPage && !overHot) {
      if (pt.x > W * 0.72 && this.turned < max) leaf = this.leaves[this.turned]
      else if (pt.x < -W * 0.72 && this.turned > 0) leaf = this.leaves[this.turned - 1]
    }
    canvas.style.cursor = overHot ? 'pointer' : onPage ? 'grab' : ''
    if (leaf !== this.hoverPeek) {
      this.unpeek()
      if (leaf && leaf.p === leaf.target) {
        const fwd = leaf.index === this.turned
        leaf.target = fwd ? PEEK : 1 - PEEK
        leaf.dir = fwd ? 1 : -1
        leaf.grabY = Math.max(0, Math.min(1, pt.y / H + 0.5))
        this.hoverPeek = leaf
        this.assignTextures()
        this.wake()
      }
    }
  }

  private unpeek() {
    const l = this.hoverPeek
    this.hoverPeek = undefined
    if (!l || l.dragging) return
    if (l.target === PEEK) l.target = 0
    else if (l.target === 1 - PEEK) l.target = 1
    l.landed = true
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
      this.wheelLock = now + 420
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
  // Frame loop (runs only while something moves)

  private wake() {
    if (this.raf || this.disposed) return
    this.lastFrame = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (now: number) => {
    this.raf = 0
    const dt = Math.min(0.05, Math.max(0, now - this.lastFrame) / 1000)
    this.lastFrame = now
    let active = false
    let loudest = 0
    let loudKind: Leaf['kind'] = 'paper'
    const k = this.opts.reducedMotion ? 260 : 75
    for (const l of this.leaves) {
      const phys = PHYSICS[l.data.kind]
      // Secondary motion: the free edge springs and settles after landing.
      if (l.flex !== 0 || l.flexV !== 0) {
        const kf = (2 * Math.PI * phys.flexHz) ** 2
        l.flexV += (-kf * l.flex - 2 * phys.flexZeta * Math.sqrt(kf) * l.flexV) * dt
        l.flex += l.flexV * dt
        if (Math.abs(l.flex) < 1e-4 && Math.abs(l.flexV) < 1e-3) { l.flex = 0; l.flexV = 0 }
        l.dirty = true
        active = true
      }
      if (l.dragging) {
        if (l.dirty) this.applyBend(l)
        active = true
        const s = this.drag?.samples ?? []
        const speed = s.length > 1 ? (s[s.length - 1].p - s[0].p) / Math.max(0.016, s[s.length - 1].t - s[0].t) : 0
        if (Math.abs(speed) > loudest) { loudest = Math.abs(speed); loudKind = l.data.kind }
        continue
      }
      if (l.delay > 0) { l.delay -= dt; active = true; continue }
      if (l.p === l.target && l.v === 0) {
        if (l.dirty) this.applyBend(l)
        continue
      }
      const stiff = l.data.kind === 'cover' ? k * 0.7 : k
      const a = stiff * (l.target - l.p) - 2 * phys.zeta * Math.sqrt(stiff) * l.v
      l.v += a * dt
      l.p += l.v * dt
      if (Math.abs(l.target - l.p) < 0.0008 && Math.abs(l.v) < 0.02) { l.p = l.target; l.v = 0 }
      if (!l.landed && (l.target === 0 || l.target === 1) && Math.abs(l.target - l.p) < 0.035) {
        l.landed = true
        this.opts.sound.land(l.data.kind, Math.abs(l.v) / 4)
        // The edge keeps travelling when the spine stops: kick the bounce.
        l.flexV += phys.kick * Math.min(1.6, Math.abs(l.v)) * (this.opts.reducedMotion ? 0 : 1)
        if (l.data.kind === 'cover' || l.data.kind === 'sleeve') navigator.vibrate?.(8)
      }
      if (Math.abs(l.v) > loudest) { loudest = Math.abs(l.v); loudKind = l.data.kind }
      this.applyBend(l)
      active = true
    }
    if (loudest > 0.05) this.opts.sound.move(loudest, loudKind)
    else this.opts.sound.quiet()

    // Ease the camera toward its goal pose.
    const e = 1 - Math.exp(-dt * 5)
    let camMoving = false
    for (const key of ['tx', 'ty', 'dist', 'polar', 'azim'] as const) {
      const diff = this.goal[key] - this.pose[key]
      if (Math.abs(diff) > 1e-4) { this.pose[key] += diff * e; camMoving = true } else this.pose[key] = this.goal[key]
    }
    this.placeCamera(this.camera, this.pose)

    if (this.queue.length) {
      this.queue.shift()!()
      active = true
    }
    this.renderer.render(this.scene, this.camera)
    if (active || camMoving || this.drag?.leaf) this.raf = requestAnimationFrame(this.frame)
    else this.opts.sound.quiet()
  }

  private emit() {
    const data = this.leaves.map(l => l.data)
    const { left, right } = visibleFaces(data, this.mode, this.turned)
    const top = data[this.turned]
    const overlay = top && isOverlay(top.kind) ? top : undefined
    this.opts.onState({
      mode: this.mode,
      turned: this.turned,
      max: maxTurned(data, this.mode),
      left,
      right,
      overlay: overlay?.kind ?? null,
      section: (overlay?.front ?? right ?? left)?.spec.section ?? '',
    })
  }
}
