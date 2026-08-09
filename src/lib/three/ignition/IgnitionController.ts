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
export class IgnitionController {
  private t = 0
  private started = false
  private finished = false
  private cued = false
  private listeners = new Set<(e: IgnitionEvent) => void>()

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

  start() {
    if (this.started || this.finished) return
    this.started = true
    this.u.uGlobalFade.value = 1
    this.u.uWakeActive.value = 1
    this.u.uCoreLive.value = 1
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
    this.u.uFront.value = this.reach * 2
    this.emit('done')
  }

  update(dt: number) {
    if (!this.started || this.finished) return
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

  private apply(p: number) {
    const { SEED_END, FRONT_END, GLOW_DECAY } = this.config

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
    } else {
      const s = (p - FRONT_END) / Math.max(1e-4, 1 - FRONT_END)
      this.u.uGlobalFade.value = Math.max(0, 1 - s)
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
