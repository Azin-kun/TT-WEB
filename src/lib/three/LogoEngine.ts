import * as THREE from 'three'
import { CALIB, visibleHeight } from './calibration'
import { loadLogo } from './loadLogo'
import { makePencilMaterials, type LogoMaterials } from './materials'
import { partitionForShatter } from './shatter/partition'
import { makeShatterUniforms, patchForShatter } from './shatter/shatterMaterial'
import { ShatterController } from './shatter/ShatterController'
import { DEFAULT_SEPARATION, type SeparationConfig, type ShatterEvent, type ShatterUniforms } from './shatter/types'
import { buildIgnitionCage } from './ignition/cage'
import { IgnitionController } from './ignition/IgnitionController'
import {
  makeCageMaterial,
  makeIgnitionUniforms,
  patchSkinForIgnition,
} from './ignition/ignitionMaterial'
import {
  DEFAULT_IGNITION,
  type IgnitionConfig,
  type IgnitionEvent,
  type IgnitionUniforms,
} from './ignition/types'

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
  private wantArmed = false
  private downX = 0
  private downY = 0

  // electrical wireframe ignition
  private ignition: IgnitionController | null = null
  private ignitionUniforms: IgnitionUniforms | null = null
  private cage: THREE.LineSegments | null = null
  private cageMaterial: THREE.ShaderMaterial | null = null
  private bodySurfaceMats: THREE.Material[] = []
  private wantIgnition = false
  /** true once the seed/cue/done sequence has completed by ANY path */
  private ignitionResolved = false
  private pendingIgnitionListeners = new Set<(e: IgnitionEvent) => void>()

  constructor(
    private canvas: HTMLCanvasElement,
    private config: SeparationConfig = DEFAULT_SEPARATION,
    private ignitionConfig: IgnitionConfig = DEFAULT_IGNITION,
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
    // generating the ~2.8 MB of per-vertex attributes.
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
      // Ignition. Built HERE — before the inner body is parented — so the cage
      // traverses only the skin. Doing it after `group.add(body)` would also
      // wireframe the body's cloned geometry and double the segment count.
      // Skipped if the sequence has already been forced through (load raced a
      // reduced-motion or failure path) — building a controller now would
      // replay seed/cue/done a second time.
      if (this.ignitionConfig.ENABLED && !this.ignitionResolved) {
        group.updateMatrixWorld(true)
        const inv = new THREE.Matrix4().copy(group.matrixWorld).invert()
        const localBox = new THREE.Box3()
        group.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (!mesh.isMesh || !mesh.geometry) return
          mesh.geometry.computeBoundingBox()
          const bb = mesh.geometry.boundingBox
          if (!bb) return
          localBox.union(
            bb.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)),
          )
        })
        const centre = localBox.getCenter(new THREE.Vector3())
        const logoHeight = heightFrac * visH

        const corners: THREE.Vector3[] = []
        for (let i = 0; i < 8; i++) {
          corners.push(
            new THREE.Vector3(
              i & 1 ? localBox.max.x : localBox.min.x,
              i & 2 ? localBox.max.y : localBox.min.y,
              i & 4 ? localBox.max.z : localBox.min.z,
            ),
          )
        }
        // The sphere is sized off the logo's own radius, so SPHERE_SCALE reads
        // as "this much bigger than the mark" regardless of viewport.
        const logoRadius =
          Math.max(...corners.map((c) => c.distanceTo(centre))) || logoHeight * 0.5

        const iu = makeIgnitionUniforms(this.ignitionConfig, logoHeight, centre, logoRadius)
        this.ignitionUniforms = iu

        // AFTER patchForShatter, and composing rather than assigning — three
        // exposes one onBeforeCompile per material, so the order matters and
        // the composition is what keeps the hatch, wash and displacement alive.
        Object.values(set).forEach((m) => patchSkinForIgnition(m, iu))

        const density = isMobile
          ? this.ignitionConfig.CAGE_DENSITY_MOBILE
          : this.ignitionConfig.CAGE_DENSITY
        this.cageMaterial = makeCageMaterial(iu)
        this.cage = buildIgnitionCage(group, this.ignitionConfig, density, this.cageMaterial)
        if (this.cage) group.add(this.cage)

        // Reach: furthest point the charge must travel to clear the cage. During
        // the overlay the cage is a bloomed polygon far larger than the logo, so
        // the bloomed extent — not the logo's — is what the front has to cross.
        const seed = iu.uSeed.value
        let reach = Math.max(...corners.map((c) => c.distanceTo(seed)))
        if (this.ignitionConfig.OVERLAY_ENABLED) {
          reach = Math.max(reach, iu.uSphereR.value * this.ignitionConfig.BLOOM_SCALE)
        }
        if (!(reach > 0)) reach = logoHeight

        this.ignition = new IgnitionController(iu, reach, this.ignitionConfig)
        this.pendingIgnitionListeners.forEach((cb) => this.ignition?.onIgnition(cb))
        this.pendingIgnitionListeners.clear()
        this.ignition.onIgnition((e) => {
          if (e === 'done') this.teardownIgnition()
        })
        // A start() that arrived before load() resolved is honoured here rather
        // than dropped — see startIgnition().
        if (this.wantIgnition) this.ignition.start()
      }

      // parented to the group, so it inherits the idle spin, tilt and shake
      group.add(body)
      this.shatterUniforms = u

      // No controller when disabled (separationEnabled: false) or under reduced
      // motion — nothing can charge, so nothing can move.
      if (part) {
        this.shatter = new ShatterController(u, heightFrac * visH, this.config)
        this.shatter.setArmed(this.wantArmed)
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
      // These are unpatched matcaps with otherwise identical parameters to the
      // patched skin, so without a distinct key three can hand them the skin's
      // compiled program — hatch, light wash, displacement and all.
      m.customProgramCacheKey = () => 'tt-body-1'
    })
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x2b2a27,
      transparent: true,
      opacity: this.config.BODY_EDGE_OPACITY,
      depthWrite: false,
    })
    this.bodyMaterials = [...Object.values(bodyMats), edgeMat]
    // Kept separately: ignition animates ONLY the surfaces (the dark mass),
    // never the drawn edges.
    this.bodySurfaceMats = Object.values(bodyMats)

    const body = new THREE.Group()
    group.traverse((o) => {
      const src = o as THREE.Mesh
      if (!src.isMesh) return
      const geo = src.geometry.clone()

      // At BODY_OPACITY 0 the surfaces are fully invisible, so they would
      // normally be skipped rather than paying to draw nothing — what's left is
      // a pure wireframe of the mark.
      //
      // Ignition needs them anyway: it raises them to DARK_MASS_OPACITY for the
      // duration of the transition, because red on light paper reads as a red
      // line, not as glow, unless it has something dark to burn against
      // (spec §3.3). They are returned to BODY_OPACITY at `done`.
      const needSurfaces = this.config.BODY_OPACITY > 0 || this.ignitionConfig.ENABLED
      if (needSurfaces) {
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
      if (!needSurfaces) geo.dispose()
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
   *
   * Records the intent even if the mesh has not finished loading — `load()`
   * applies it when the controller is created. Without that, a slow load
   * (cold cache, Draco wasm) that finishes after the caller arms would
   * silently leave the interaction dead.
   */
  setShatterArmed(v: boolean) {
    this.wantArmed = v
    this.shatter?.setArmed(v)
  }

  /**
   * Begin the electrical wireframe transition.
   *
   * Records the intent even if the mesh has not finished loading — `load()`
   * starts the controller when it creates one. Without that, a slow load (cold
   * cache, Draco wasm) finishing after the caller starts would leave the bridge
   * dead and, because `armed` and `onLive` both hang off its `done` event, the
   * hero permanently inert with no console error. This is the same shape as the
   * setShatterArmed bug the 2026-08-09 review found.
   */
  startIgnition() {
    this.wantIgnition = true
    this.resetPose()
    if (this.ignition) {
      this.ignition.start()
      return
    }
    // Turned off outright: consumers still need the full sequence.
    if (!this.ignitionConfig.ENABLED) this.finishIgnitionNow()
  }

  /**
   * Return the mark to frontal at the moment the bridge begins.
   *
   * The engine renders from load(), which is several seconds before the sketch
   * video ends, and the idle spin starts 1.2s after that — so by the handoff the
   * mesh has quietly turned ~150° behind an invisible canvas. The old 0.6s
   * crossfade hid it; the ignition does not, and an oblique cage appearing under
   * a frontal video frame is exactly the cut the bridge exists to avoid.
   *
   * Zeroing idleTimer also holds the mark still while the charge crosses it, so
   * the idle rotation resumes during settle rather than fighting the effect.
   */
  private resetPose() {
    this.spinY = 0
    this.vel = 0
    this.idleTimer = 0
  }

  /**
   * Force the sequence to completion. The caller uses this when no controller
   * will ever exist — reduced motion, or `load()` rejecting — so that `done`
   * still fires and the hero does not sit inert behind a transition that never
   * finishes.
   */
  finishIgnitionNow() {
    if (this.ignition) {
      this.ignition.finishNow()
      return
    }
    if (this.ignitionResolved) return
    this.ignitionResolved = true
    const cbs = [...this.pendingIgnitionListeners]
    this.pendingIgnitionListeners.clear()
    for (const e of ['seed', 'cue', 'done'] as const) cbs.forEach((cb) => this.safeCall(cb, e))
  }

  /** Subscribe before or after load(); early subscriptions are replayed onto the controller. */
  onIgnition(cb: (e: IgnitionEvent) => void): () => void {
    if (this.ignition) return this.ignition.onIgnition(cb)
    // Already completed via the immediate path — replay, so a late subscriber
    // is not left waiting on an event that has been and gone.
    if (this.ignitionResolved) {
      for (const e of ['seed', 'cue', 'done'] as const) this.safeCall(cb, e)
      return () => {}
    }
    this.pendingIgnitionListeners.add(cb)
    return () => {
      this.pendingIgnitionListeners.delete(cb)
    }
  }

  private safeCall(cb: (e: IgnitionEvent) => void, e: IgnitionEvent) {
    try {
      cb(e)
    } catch (err) {
      console.error(`LogoEngine: ignition listener threw on "${e}"`, err)
    }
  }

  /** Cage has served its purpose — free the line geometry and hand the skin back. */
  private teardownIgnition() {
    this.ignitionResolved = true
    if (this.cage) {
      this.cage.parent?.remove(this.cage)
      this.cage.geometry.dispose()
      this.cage = null
    }
    this.cageMaterial?.dispose()
    this.cageMaterial = null
    if (this.ignitionUniforms) {
      this.ignitionUniforms.uWakeActive.value = 0
      this.ignitionUniforms.uGlobalFade.value = 0
    }
    // Dark mass off; the ghost body returns to whatever the CMS asked for.
    this.bodySurfaceMats.forEach((m) => {
      m.opacity = this.config.BODY_OPACITY
      m.visible = this.config.BODY_OPACITY > 0
    })
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
    // (reduced motion, or separationEnabled: false) the same threshold is
    // applied here instead, so drag-to-spin keeps its usual feel.
    if (this.pointerActive && !this.dragging) {
      const becameDrag = this.shatter
        ? this.shatter.pointerMove(e.clientX, e.clientY)
        : this.pastDragThreshold(e.clientX, e.clientY)
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

  /** Same squared-distance test as ShatterController.pointerMove, used when there is no controller to ask. */
  private pastDragThreshold(x: number, y: number): boolean {
    const dx = x - this.downX
    const dy = y - this.downY
    return dx * dx + dy * dy > this.config.DRAG_THRESHOLD_PX * this.config.DRAG_THRESHOLD_PX
  }

  private onDown = (e: PointerEvent) => {
    if (!this.interactive) return
    this.pointerActive = true
    this.dragging = false
    this.lastX = e.clientX
    this.downX = e.clientX
    this.downY = e.clientY
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

    if (this.ignition && !this.ignition.isFinished()) {
      this.ignition.update(dt)
      // Dark mass rides the cage's own fade, so the red always has something to
      // burn against for exactly as long as the cage is on screen (spec §3.3).
      const fade = this.ignitionUniforms?.uGlobalFade.value ?? 0
      const target = this.ignitionConfig.DARK_MASS_OPACITY * fade
      this.bodySurfaceMats.forEach((m) => {
        m.opacity = Math.max(this.config.BODY_OPACITY, target)
        m.visible = m.opacity > 0
      })
    }

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
    this.ignition?.dispose()
    this.ignition = null
    this.pendingIgnitionListeners.clear()
    this.cageMaterial?.dispose()
    this.cageMaterial = null
    this.cage?.geometry.dispose()
    this.cage = null
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.geometry?.dispose()
    })
    if (this.materials) Object.values(this.materials).forEach((m) => m.dispose())
    this.bodyMaterials.forEach((m) => m.dispose())
    this.bodyMaterials = []
    // Same instances as bodyMaterials — disposed above, just drop the refs.
    this.bodySurfaceMats = []
    this.renderer.dispose()
  }
}
