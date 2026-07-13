import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { CALIB, visibleHeight } from './calibration'
import { loadLogo, loadEnvMap } from './loadLogo'
import { makePencilMaterials, makeGlassMaterials, type LogoMaterials } from './materials'

export type MaterialMode = 'atelier' | 'obsidian'

const DEG = Math.PI / 180
const IDLE_W = (Math.PI * 2) / 14 // one revolution ≈ 14 s, +Y = CCW from above (spec §7)
const LIGHT_WHITE = new THREE.Color(0xf4f4f6)
const LIGHT_GOLD = new THREE.Color(0xffd34d)

/**
 * Framework-agnostic three.js engine for the hero logo. Ported from the
 * owner-approved preview: idle counter-clockwise spin, cursor deflection with
 * spring return, 360° drag with inertia, keyboard rotation, and an
 * Atelier(pencil)/Obsidian(glass) material swap. React just mounts/disposes it.
 */
export class LogoEngine {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private group: THREE.Group | null = null
  private atelier: LogoMaterials | null = null
  private obsidian: LogoMaterials | null = null
  private mode: MaterialMode = 'atelier'

  private hemi: THREE.HemisphereLight
  private dir: THREE.DirectionalLight
  private redLight: THREE.PointLight
  private whiteLight: THREE.PointLight

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

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.camera = new THREE.PerspectiveCamera(CALIB.CAMERA_FOV, 1, 0.1, 50)
    this.camera.position.set(0, 0, CALIB.CAMERA_Z)

    this.hemi = new THREE.HemisphereLight(0xfff8ec, 0xcfc5b2, 1.1)
    this.dir = new THREE.DirectionalLight(0xffffff, 1.6)
    this.dir.position.set(1.5, 2, 2.5)
    this.redLight = new THREE.PointLight(0xe8232b, 30, 12)
    this.redLight.position.set(-2.2, 1.2, 1.8)
    this.whiteLight = new THREE.PointLight(0xffffff, 22, 12)
    this.whiteLight.position.set(2.4, -0.8, 2.0)
    this.scene.add(this.hemi, this.dir, this.redLight, this.whiteLight)
  }

  async load(initialMode: MaterialMode) {
    const [group, env] = await Promise.all([loadLogo(), loadEnvMap(this.renderer)])
    if (this.disposed) return
    const envMap = env ?? new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture

    this.atelier = makePencilMaterials()
    this.obsidian = makeGlassMaterials(envMap)
    this.group = group

    // calibrate: scale so rendered height = HEIGHT_FRAC of viewport, offset for CENTER_Y
    const visH = visibleHeight()
    const box = new THREE.Box3().setFromObject(group)
    const size = box.getSize(new THREE.Vector3())
    if (size.y > 0) group.scale.setScalar((CALIB.HEIGHT_FRAC * visH) / size.y)
    group.position.y = (0.5 - CALIB.CENTER_Y) * visH

    this.scene.add(group)
    this.setMaterialMode(initialMode)
    this.resize()
    this.attach()
    this.prev = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  setMaterialMode(mode: MaterialMode) {
    this.mode = mode
    const set = mode === 'atelier' ? this.atelier : this.obsidian
    if (this.group && set) {
      this.group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const mesh = o as THREE.Mesh
          mesh.material = set[mesh.name as keyof LogoMaterials] || set['logo-black']
        }
      })
    }
    const atel = mode === 'atelier'
    this.hemi.intensity = atel ? 1.1 : 0.05
    this.dir.intensity = atel ? 1.6 : 0.25
    this.redLight.intensity = atel ? 0 : 30
    this.whiteLight.intensity = atel ? 0 : 22
  }

  getMode() {
    return this.mode
  }

  getMesh() {
    return this.group
  }

  /** Disable pointer/drag reactivity (reduced-motion): idle spin only. */
  setInteractive(v: boolean) {
    this.interactive = v
  }

  private attach() {
    // deflect follows the cursor anywhere; drag only starts on the canvas so it
    // never hijacks clicks on the header / nav / switch elsewhere on the page
    window.addEventListener('pointermove', this.onMove)
    this.canvas.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointerup', this.onUp)
    this.canvas.addEventListener('keydown', this.onKey)
    this.canvas.tabIndex = 0
  }

  private onMove = (e: PointerEvent) => {
    if (!this.interactive) return
    const nx = (e.clientX / window.innerWidth) * 2 - 1
    const ny = (e.clientY / window.innerHeight) * 2 - 1
    this.tilt.tx = ny * (12 * DEG) // deflect up to ±12°
    this.tilt.tz = -nx * (12 * DEG) * 0.5
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
    this.dragging = true
    this.lastX = e.clientX
  }

  private onUp = () => {
    this.dragging = false
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

    // Obsidian key light alternates white ↔ gold on a ~6 s cycle (owner request, spec §7)
    if (this.mode === 'obsidian') {
      const lp = (Math.sin((t * 0.001 * Math.PI) / 3) + 1) / 2
      this.whiteLight.color.copy(LIGHT_WHITE).lerp(LIGHT_GOLD, lp)
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
    this.canvas.removeEventListener('keydown', this.onKey)
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.geometry?.dispose()
    })
    ;[this.atelier, this.obsidian].forEach((set) => {
      if (set) Object.values(set).forEach((m) => m.dispose())
    })
    this.renderer.dispose()
  }
}
