import * as THREE from 'three'
import { CALIB, visibleHeight } from './calibration'
import { loadLogo } from './loadLogo'
import { makePencilMaterials, type LogoMaterials } from './materials'
import { partitionForShatter } from './shatter/partition'
import { makeShatterUniforms, patchForShatter } from './shatter/shatterMaterial'
import { ShatterController } from './shatter/ShatterController'
import { DEFAULT_SEPARATION, type SeparationConfig, type ShatterEvent, type ShatterUniforms } from './shatter/types'

const DEG = Math.PI / 180
const IDLE_W = (Math.PI * 2) / 14 // one revolution ≈ 14 s, +Y = CCW from above (spec §7)

/**
 * Framework-agnostic three.js engine for the hero logo. Ported from the
 * owner-approved preview: idle counter-clockwise spin, cursor deflection with
 * spring return, 360° drag with inertia, keyboard rotation, pencil-matcap
 * materials. React just mounts/disposes it.
 */
export class LogoEngine {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private group: THREE.Group | null = null
  private materials: LogoMaterials | null = null

  private hemi: THREE.HemisphereLight
  private dir: THREE.DirectionalLight

  private raf = 0
  private prev = performance.now()
  private disposed = false

  // interaction state
  private spinY = 0
  private vel = 0
  private dragging = false
  private lastX = 0
  private idleTimer = 0
  private tilt = { x: 0, z: 0, tx: 0, tz: 0 }
  private interactive = true

  // hold-to-shatter
  private shatter: ShatterController | null = null
  private shatterUniforms: ShatterUniforms | null = null
  private bodyMaterials: THREE.Material[] = []
  private pointerActive = false
  private baseY = 0

  constructor(
    private canvas: HTMLCanvasElement,
    private config: SeparationConfig = DEFAULT_SEPARATION,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.camera = new THREE.PerspectiveCamera(CALIB.CAMERA_FOV, 1, 0.1, 50)
    this.camera.position.set(0, 0, CALIB.CAMERA_Z)

    this.hemi = new THREE.HemisphereLight(0xfff8ec, 0xcfc5b2, 1.1)
    this.dir = new THREE.DirectionalLight(0xffffff, 1.6)
    this.dir.position.set(1.5, 2, 2.5)
    this.scene.add(this.hemi, this.dir)
  }

  async load() {
    const group = await loadLogo()
    if (this.disposed) return

    this.materials = makePencilMaterials()
    this.group = group

    // calibrate: scale so rendered height = HEIGHT_FRAC of viewport, offset for CENTER_Y
    // (narrow/portrait viewports use a smaller MOBILE_HEIGHT_FRAC — see calibration.ts)
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
    const heightFrac = isMobile ? CALIB.MOBILE_HEIGHT_FRAC : CALIB.HEIGHT_FRAC
    const visH = visibleHeight()
    const box = new THREE.Box3().setFromObject(group)
    const size = box.getSize(new THREE.Vector3())
    if (size.y > 0) group.scale.setScalar((heightFrac * visH) / size.y)
    group.position.y = (0.5 - CALIB.CENTER_Y) * visH

    const set = this.materials
    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh
        mesh.material = set[mesh.name as keyof LogoMaterials] || set['logo-black']
      }
    })

    this.baseY = group.position.y

    // Hold-to-shatter. Skipped entirely under reduced motion, which also avoids
    // generating the ~1.9 MB of per-vertex attributes.
    if (this.interactive) {
      // The intact translucent body that stays once the skin has fully shed.
      // Built from CLONED geometry BEFORE partitioning, because partition
      // replaces the originals and disposes them.
      const body = this.buildInnerBody(group)

      // Partition only when the interaction is on: it costs ~2.8 MB of vertex
      // attributes. uCenter/uSpread are read solely by the vertex patch, which
      // is skipped in the same case, so the zero fallbacks are never sampled.
      const part = this.config.ENABLED ? partitionForShatter(group, this.config) : null
      const u = makeShatterUniforms(
        part?.center ?? new THREE.Vector3(),
        part ? part.height * this.config.SPREAD_FRAC : 0,
        this.config,
      )

      Object.values(set).forEach((m) => {
        // The skin is glass: sheer, and both sides visible as panels turn.
        m.side = THREE.DoubleSide
        m.transparent = true
        m.opacity = this.config.SKIN_OPACITY
        m.depthWrite = false
        patchForShatter(m, u, this.config)
      })

      // skin draws over the body; body surfaces under their own edges
      group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.renderOrder = 2
      })
      // parented to the group, so it inherits the idle spin, tilt and shake
      group.add(body)
      this.shatterUniforms = u

      // No controller when disabled — nothing can charge, so nothing can move.
      if (part) {
        this.shatter = new ShatterController(u, heightFrac * visH, this.config)
      }
    }

    this.scene.add(group)
    this.resize()
    this.attach()
    this.prev = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  getMesh() {
    return this.group
  }

  /**
   * The complete translucent logo that sits inside the skin and never moves.
   * Once every face has separated this is all that remains — a ghost of the
   * mark, its surfaces faint and its silhouette drawn in.
   */
  private buildInnerBody(group: THREE.Group): THREE.Group {
    const bodyMats = makePencilMaterials()
    Object.values(bodyMats).forEach((m) => {
      m.transparent = true
      m.opacity = this.config.BODY_OPACITY
      m.depthWrite = false
      m.side = THREE.DoubleSide
    })
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x2b2a27,
      transparent: true,
      opacity: this.config.BODY_EDGE_OPACITY,
      depthWrite: false,
    })
    this.bodyMaterials = [...Object.values(bodyMats), edgeMat]

    const body = new THREE.Group()
    group.traverse((o) => {
      const src = o as THREE.Mesh
      if (!src.isMesh) return
      const geo = src.geometry.clone()

      // At BODY_OPACITY 0 the surfaces are fully invisible, so skip them
      // entirely rather than paying to draw nothing — what's left is a pure
      // wireframe of the mark.
      if (this.config.BODY_OPACITY > 0) {
        const surf = new THREE.Mesh(
          geo,
          bodyMats[src.name as keyof LogoMaterials] || bodyMats['logo-black'],
        )
        surf.position.copy(src.position)
        surf.quaternion.copy(src.quaternion)
        surf.scale.copy(src.scale)
        surf.renderOrder = 0
        body.add(surf)
      }

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, this.config.BODY_EDGE_ANGLE),
        edgeMat,
      )
      edges.position.copy(src.position)
      edges.quaternion.copy(src.quaternion)
      edges.scale.copy(src.scale)
      edges.renderOrder = 1
      body.add(edges)

      // EdgesGeometry has copied what it needs, so the clone is dead weight
      // once nothing else references it.
      if (this.config.BODY_OPACITY <= 0) geo.dispose()
    })
    return body
  }

  /** Disable pointer/drag reactivity (reduced-motion): idle spin only. */
  setInteractive(v: boolean) {
    this.interactive = v
  }

  /**
   * Arm hold-to-shatter. Called once the mesh is actually on screen so a press
   * during the sketch-draw video can't trigger it.
   */
  setShatterArmed(v: boolean) {
    this.shatter?.setArmed(v)
  }

  /** Discrete shatter transitions. Nothing subscribes yet — see spec §7.4. */
  onShatter(cb: (e: ShatterEvent) => void): () => void {
    return this.shatter?.onShatter(cb) ?? (() => {})
  }

  /** Continuous 0..1 charge, pulled rather than pushed to avoid per-frame allocation. */
  getCharge(): number {
    return this.shatter?.getCharge() ?? 0
  }

  private attach() {
    // deflect follows the cursor anywhere; drag only starts on the canvas so it
    // never hijacks clicks on the header / nav / switch elsewhere on the page
    window.addEventListener('pointermove', this.onMove)
    this.canvas.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointerup', this.onUp)
    window.addEventListener('pointercancel', this.onCancel)
    window.addEventListener('blur', this.onCancel)
    this.canvas.addEventListener('keydown', this.onKey)
    this.canvas.tabIndex = 0
  }

  private onMove = (e: PointerEvent) => {
    if (!this.interactive) return
    const nx = (e.clientX / window.innerWidth) * 2 - 1
    const ny = (e.clientY / window.innerHeight) * 2 - 1
    this.tilt.tx = ny * (12 * DEG) // deflect up to ±12°
    this.tilt.tz = -nx * (12 * DEG) * 0.5

    // A press starts as a potential charge and only becomes a drag once the
    // pointer travels past the threshold (spec §7.1). With no controller
    // (reduced motion) any movement drags immediately, as it did before.
    if (this.pointerActive && !this.dragging) {
      const becameDrag = this.shatter ? this.shatter.pointerMove(e.clientX, e.clientY) : true
      if (becameDrag) {
        this.dragging = true
        this.lastX = e.clientX
      }
    }

    if (this.dragging) {
      const dx = e.clientX - this.lastX
      this.lastX = e.clientX
      this.spinY += dx * 0.01
      this.vel = dx * 0.01
      this.idleTimer = 0
    }
  }

  private onDown = (e: PointerEvent) => {
    if (!this.interactive) return
    this.pointerActive = true
    this.dragging = false
    this.lastX = e.clientX
    this.shatter?.pointerDown(e.clientX, e.clientY)
  }

  private onUp = () => {
    this.dragging = false
    this.pointerActive = false
    this.shatter?.pointerUp()
  }

  /** pointercancel / window blur — never leave a blast stuck open. */
  private onCancel = () => {
    this.dragging = false
    this.pointerActive = false
    this.shatter?.cancel()
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') this.spinY -= 15 * DEG
    else if (e.key === 'ArrowRight') this.spinY += 15 * DEG
    else return
    this.idleTimer = 0
    e.preventDefault()
  }

  private tick = (t: number) => {
    const dt = Math.min(0.05, (t - this.prev) / 1000)
    this.prev = t

    if (!this.dragging) {
      if (Math.abs(this.vel) > 0.0004) {
        this.spinY += this.vel
        this.vel *= 0.94 // inertia
        this.idleTimer = 0
      } else {
        this.idleTimer += dt
        if (this.idleTimer > 1.2) this.spinY += IDLE_W * dt // resume CCW idle
      }
    }
    this.tilt.x += (this.tilt.tx - this.tilt.x) * 0.06 // spring
    this.tilt.z += (this.tilt.tz - this.tilt.z) * 0.06
    if (this.group) this.group.rotation.set(this.tilt.x, this.spinY, this.tilt.z)

    // the light wash sweeps continuously, blast or no blast
    if (this.shatterUniforms) this.shatterUniforms.uTime.value += dt

    if (this.shatter) {
      this.shatter.update(dt)
      if (this.group) {
        const v = this.shatter.getVibrateOffset()
        this.group.position.x = v.x
        this.group.position.y = this.baseY + v.y
      }
    }

    this.renderer.render(this.scene, this.camera)
    this.raf = requestAnimationFrame(this.tick)
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener('pointermove', this.onMove)
    this.canvas.removeEventListener('pointerdown', this.onDown)
    window.removeEventListener('pointerup', this.onUp)
    window.removeEventListener('pointercancel', this.onCancel)
    window.removeEventListener('blur', this.onCancel)
    this.canvas.removeEventListener('keydown', this.onKey)
    this.shatter?.dispose()
    this.shatter = null
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.geometry?.dispose()
    })
    if (this.materials) Object.values(this.materials).forEach((m) => m.dispose())
    this.bodyMaterials.forEach((m) => m.dispose())
    this.bodyMaterials = []
    this.renderer.dispose()
  }
}
