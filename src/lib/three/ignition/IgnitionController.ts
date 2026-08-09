import {
  DEFAULT_IGNITION,
  type IgnitionConfig,
  type IgnitionEvent,
  type IgnitionUniforms,
} from './types'

/**
 * Phase clock for the electrical wireframe ignition.
 * Spec: docs/superpowers/specs/2026-08-09-hero-ignition-design.md §3.1, §4.5
 *
 * All authoritative state lives here in JS — the GPU only renders the numbers
 * this hands it, which is what keeps the effect verifiable in Node.
 *
 * INVARIANT: `done` fires exactly once, on every path. Separation arming and
 * the floating-words entrance both hang off it, so a path that fails to emit it
 * leaves the hero permanently inert with no console error.
 */
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / Math.max(1e-6, b - a))
  return t * t * (3 - 2 * t)
}

export class IgnitionController {
  private t = 0
  private started = false
  private finished = false
  private cued = false
  private listeners = new Set<(e: IgnitionEvent) => void>()

  // overlay phase — the cage exists as a sphere over the still-playing video,
  // blooms to a polygon, then morphs home into the logo (spec §2b)
  private overlayStarted = false
  private overlayT = 0

  /**
   * @param reach max distance from the seed to any point of the logo, so the
   *   front is guaranteed to clear the geometry by FRONT_END.
   */
  constructor(
    private u: IgnitionUniforms,
    private reach: number,
    private config: IgnitionConfig = DEFAULT_IGNITION,
  ) {}

  onIgnition(cb: (e: IgnitionEvent) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  getProgress(): number {
    return Math.min(1, this.t / Math.max(1, this.config.IGNITION_MS))
  }

  isFinished(): boolean {
    return this.finished
  }

  /**
   * Bring the cage up as a sphere over the still-playing sketch video.
   *
   * Emits nothing: seed / cue / done belong to the one-shot bridge, and both
   * separation arming and the floating-words entrance hang off them. An overlay
   * that emitted would arm the logo while the video is still running.
   */
  startOverlay() {
    if (this.overlayStarted || this.started || this.finished) return
    this.overlayStarted = true
    this.overlayT = 0
    this.u.uGlobalFade.value = 1
    this.u.uWakeActive.value = 0
    this.u.uCoreLive.value = 0
    this.u.uFront.value = 0
    this.u.uBloom.value = 0
    this.u.uMorph.value = 0
    // Alive but not yet ignited: the cage still crackles faintly over the video.
    this.u.uSparkLevel.value = this.config.SPARK_IDLE
  }

  start() {
    if (this.started || this.finished) return
    this.started = true
    this.u.uGlobalFade.value = 1
    this.u.uWakeActive.value = 1
    this.u.uCoreLive.value = 1
    this.u.uSparkLevel.value = 1
    this.emit('seed')
    this.apply(0)
  }

  /**
   * Force completion — mesh never loaded, reduced motion, or teardown.
   * Emits whatever part of the sequence has not fired yet, so consumers always
   * see seed -> cue -> done regardless of which path got them here.
   */
  finishNow() {
    if (this.finished) return
    if (!this.started) {
      this.started = true
      this.emit('seed')
    }
    if (!this.cued) {
      this.cued = true
      this.emit('cue')
    }
    this.t = this.config.IGNITION_MS
    this.finished = true
    this.u.uGlobalFade.value = 0
    this.u.uWakeActive.value = 0
    this.u.uCoreLive.value = 0
    this.u.uSparkLevel.value = 0
    this.u.uFront.value = this.reach * 2
    // However we got here, the cage ends at the logo's true shape — a forced
    // finish must never leave it stranded as a sphere.
    this.u.uMorph.value = 1
    this.emit('done')
  }

  update(dt: number) {
    if (this.finished) return

    // Overlay runs on its own clock until the video actually ends and start()
    // takes over.
    if (!this.started) {
      if (!this.overlayStarted) return
      this.overlayT += dt * 1000
      this.applyOverlay(clamp01(this.overlayT / Math.max(1, this.config.OVERLAY_LEAD_MS)))
      return
    }

    this.t += dt * 1000
    const p = this.getProgress()

    if (!this.cued && p >= this.config.CUE_FRAC) {
      this.cued = true
      this.emit('cue')
    }

    if (p >= 1) {
      this.finishNow()
      return
    }
    this.apply(p)
  }

  /** @param q 0..1 through OVERLAY_LEAD_MS */
  private applyOverlay(q: number) {
    const { BLOOM_START, BLOOM_END, MORPH_START } = this.config
    this.u.uGlobalFade.value = 1
    this.u.uBloom.value = smoothstep(BLOOM_START, BLOOM_END, q)
    this.u.uMorph.value = smoothstep(MORPH_START, 1, q)
  }

  private apply(p: number) {
    const { SEED_END, FRONT_END, GLOW_DECAY } = this.config

    // If the video ended before the overlay finished morphing — the two clocks
    // drift, and the video's duration is not frame-exact — complete the morph
    // across the seed phase instead of popping it. Monotonic, so an overlay
    // that already finished is never dragged backwards.
    const catchUp = SEED_END > 0 ? Math.min(1, p / SEED_END) : 1
    this.u.uMorph.value = Math.max(this.u.uMorph.value, catchUp)

    // Front travel spans SEED_END..FRONT_END. Overshoot past `reach` so the
    // crest fully leaves the far side rather than parking on it.
    const span = Math.max(1e-4, FRONT_END - SEED_END)
    const fp = Math.min(1, Math.max(0, (p - SEED_END) / span))
    this.u.uFront.value = fp * this.reach * 1.15

    // Core burns at full strength through the seed bloom, then decays away as
    // the travelling front takes over as the light source.
    this.u.uCoreLive.value = p <= SEED_END ? 1 : Math.exp(-GLOW_DECAY * (p - SEED_END))

    // Cage holds full opacity until the front is done, then fades through settle.
    if (p <= FRONT_END) {
      this.u.uGlobalFade.value = 1
      this.u.uSparkLevel.value = 1
    } else {
      const s = (p - FRONT_END) / Math.max(1e-4, 1 - FRONT_END)
      this.u.uGlobalFade.value = Math.max(0, 1 - s)
      // Sparks die off with the cage rather than crackling on a ghost.
      this.u.uSparkLevel.value = Math.max(0, 1 - s)
    }
  }

  dispose() {
    this.listeners.clear()
  }

  /**
   * Each listener is isolated. `done` drives separation arming AND the floating
   * words; one subscriber throwing must not deny the event to the others, and
   * must not propagate out of the rAF tick and kill the render loop.
   */
  private emit(e: IgnitionEvent) {
    this.listeners.forEach((cb) => {
      try {
        cb(e)
      } catch (err) {
        console.error(`IgnitionController: listener threw on "${e}"`, err)
      }
    })
  }
}
