/**
 * Assertions for the ignition state machine.
 * Run: npm run verify:config
 *
 * All authoritative state lives in JS — the GPU only renders the numbers this
 * hands it — which is what makes the effect verifiable without a browser.
 *
 * The invariant under test above all others: `done` fires EXACTLY ONCE on every
 * path. Separation arming and the floating-words entrance both hang off it, so
 * a path that fails to emit leaves the hero permanently inert, silently.
 */
import * as THREE from 'three'
import { DEFAULT_IGNITION, type IgnitionConfig, type IgnitionEvent } from './types'
import { makeIgnitionUniforms } from './ignitionMaterial'
import { IgnitionController } from './IgnitionController'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const make = (cfg: IgnitionConfig = DEFAULT_IGNITION, reach = 1) => {
  const u = makeIgnitionUniforms(cfg, 1, new THREE.Vector3())
  const events: IgnitionEvent[] = []
  const c = new IgnitionController(u, reach, cfg)
  c.onIgnition((e) => events.push(e))
  return { u, c, events }
}

// A controller that has not been started does nothing.
{
  const { c, events } = make()
  for (let i = 0; i < 10; i++) c.update(0.016)
  check('idle before start', events.length === 0 && c.getProgress() === 0)
}

// Full run: seed then cue then done, in order, each exactly once.
{
  const { c, events, u } = make()
  c.start()
  check('seed fires on start', events.join(',') === 'seed')
  for (let i = 0; i < 200; i++) c.update(0.016) // 3.2s > 2.0s duration
  check('event order is seed,cue,done', events.join(',') === 'seed,cue,done')
  check('progress ends at 1', c.getProgress() === 1)
  check('isFinished', c.isFinished())
  check('cage faded out', u.uGlobalFade.value === 0)
  check('wake handed back to the skin', u.uWakeActive.value === 0)
  check('core extinguished', u.uCoreLive.value === 0)
}

// done fires EXACTLY once even if update keeps being called.
{
  const { c, events } = make()
  c.start()
  for (let i = 0; i < 600; i++) c.update(0.016)
  check('done fires exactly once', events.filter((e) => e === 'done').length === 1)
  check('cue fires exactly once', events.filter((e) => e === 'cue').length === 1)
  check('seed fires exactly once', events.filter((e) => e === 'seed').length === 1)
}

// start() is idempotent — a second call must not replay or re-emit.
{
  const { c, events } = make()
  c.start()
  c.start()
  check('start is idempotent', events.filter((e) => e === 'seed').length === 1)
}

// finishNow() short-circuits but still emits the full sequence exactly once.
// This is the path taken when the mesh never loads or reduced motion is on.
{
  const { c, events } = make()
  c.start()
  c.finishNow()
  check('finishNow completes the sequence', events.join(',') === 'seed,cue,done')
  check('finishNow marks finished', c.isFinished())
  const before = events.length
  for (let i = 0; i < 50; i++) c.update(0.016)
  check('no further events after finishNow', events.length === before)
}

// finishNow() without start() still emits the whole sequence exactly once.
{
  const { c, events } = make()
  c.finishNow()
  check('finishNow without start emits seed,cue,done', events.join(',') === 'seed,cue,done')
  check('finishNow without start emits done once', events.filter((e) => e === 'done').length === 1)
}

// finishNow() twice must not double-emit.
{
  const { c, events } = make()
  c.start()
  c.finishNow()
  c.finishNow()
  check('finishNow is idempotent', events.filter((e) => e === 'done').length === 1)
}

// start() after finishNow() must not restart the sequence.
{
  const { c, events } = make()
  c.finishNow()
  c.start()
  for (let i = 0; i < 200; i++) c.update(0.016)
  check('start after finishNow does not replay', events.join(',') === 'seed,cue,done')
}

// The front actually crosses the whole reach by FRONT_END, and never goes backwards.
{
  const { c, u } = make(DEFAULT_IGNITION, 3)
  c.start()
  let prevFront = -1
  let monotonic = true
  const stopAt = DEFAULT_IGNITION.IGNITION_MS * DEFAULT_IGNITION.FRONT_END
  for (let t = 0; t < stopAt; t += 16) {
    c.update(0.016)
    if (u.uFront.value < prevFront) monotonic = false
    prevFront = u.uFront.value
  }
  check('front clears the geometry by FRONT_END', u.uFront.value >= 3)
  check('front never travels backwards', monotonic)
}

// Progress is monotonic across a full run.
{
  const { c } = make()
  c.start()
  let prev = -1
  let monotonic = true
  for (let i = 0; i < 200; i++) {
    c.update(0.016)
    if (c.getProgress() < prev) monotonic = false
    prev = c.getProgress()
  }
  check('progress is monotonic', monotonic)
}

// IGNITION_MS is respected, not hard-coded.
{
  const fast: IgnitionConfig = { ...DEFAULT_IGNITION, IGNITION_MS: 1000 }
  const { c, events } = make(fast)
  c.start()
  for (let i = 0; i < 40; i++) c.update(0.016) // 0.64s — not finished yet
  check('short config not done at 0.64s', !events.includes('done'))
  for (let i = 0; i < 40; i++) c.update(0.016) // 1.28s total — finished
  check('short config done by 1.28s', events.includes('done'))
}

// A cue fraction of 1 must still fire before (or with) done, never be skipped.
{
  const late: IgnitionConfig = { ...DEFAULT_IGNITION, CUE_FRAC: 1 }
  const { c, events } = make(late)
  c.start()
  for (let i = 0; i < 200; i++) c.update(0.016)
  check('cue at frac 1 still fires', events.filter((e) => e === 'cue').length === 1)
  check('cue at frac 1 precedes done', events.indexOf('cue') < events.indexOf('done'))
}

// Unsubscribing stops delivery.
{
  const { c } = make()
  const seen: IgnitionEvent[] = []
  const off = c.onIgnition((e) => seen.push(e))
  off()
  c.start()
  check('unsubscribe works', seen.length === 0)
}

// A listener that throws must not prevent the remaining listeners from running,
// nor wedge the state machine — done must still be observable.
{
  const { c } = make()
  const seen: IgnitionEvent[] = []
  c.onIgnition(() => {
    throw new Error('listener blew up')
  })
  c.onIgnition((e) => seen.push(e))
  let threw = false
  try {
    c.start()
    for (let i = 0; i < 200; i++) c.update(0.016)
  } catch {
    threw = true
  }
  check('a throwing listener does not break the sequence', !threw && seen.includes('done'))
}

// --- overlay phase: sphere -> bloom -> morph home (spec §2b) ---

/** advance the controller by `ms` in 16ms steps */
const advance = (c: IgnitionController, ms: number) => {
  for (let t = 0; t < ms; t += 16) c.update(0.016)
}

// Without startOverlay(), behaviour is exactly what it was before the overlay
// existed: cage already at the logo's true shape, no bloom.
{
  const { c, u, events } = make()
  c.start()
  advance(c, 300)
  check('no overlay -> morph stays home', u.uMorph.value === 1)
  check('no overlay -> no bloom', u.uBloom.value === 0)
  check('no overlay -> normal events', events[0] === 'seed')
}

// OVERLAY_ENABLED false must make startOverlay() a genuine no-op, not merely
// shorten its lead. SketchIntro signals near-end unconditionally (a skipped or
// failed video still has to let the cage come up), so the engine WILL receive
// this call with the feature switched off, and it must leave the cage at the
// logo's true shape rather than opening the bridge on a full-size sphere.
{
  const cfg = { ...DEFAULT_IGNITION, OVERLAY_ENABLED: false }
  const u = makeIgnitionUniforms(cfg, 1, new THREE.Vector3())
  const c = new IgnitionController(u, 1, cfg)
  c.startOverlay()
  check('OVERLAY_ENABLED false -> startOverlay is a no-op', !c.isOverlayActive())
  check('OVERLAY_ENABLED false -> cage stays hidden', u.uGlobalFade.value === 0)
  check('OVERLAY_ENABLED false -> morph stays home', u.uMorph.value === 1)
  check('OVERLAY_ENABLED false -> skin is not seized', u.uWakeActive.value === 0)
  // and the bridge proper still behaves exactly as it does without an overlay
  c.start()
  advance(c, 300)
  check('OVERLAY_ENABLED false -> bridge still runs', u.uMorph.value === 1 && u.uBloom.value === 0)
}

// The overlay itself emits nothing: seed/cue/done belong to the one-shot
// bridge, and armed / onLive hang off them.
{
  const { c, events } = make()
  c.startOverlay()
  advance(c, 900)
  check('overlay emits no events', events.length === 0)
  check('overlay does not report finished', !c.isFinished())
}

// Shape timeline across the overlay.
{
  const { c, u } = make()
  c.startOverlay()
  check('overlay starts as a sphere', u.uBloom.value === 0 && u.uMorph.value === 0)
  check('cage is visible during the overlay', u.uGlobalFade.value === 1)
  check('overlay reports itself active', c.isOverlayActive())
  // The skin must be HIDDEN, which needs the wake ACTIVE with the front at zero.
  // uWakeActive of 0 would make tt_ignWake() return 1 and paint the finished
  // logo over the video.
  check('skin is hidden during the overlay', u.uWakeActive.value === 1 && u.uFront.value === 0)

  advance(c, 100) // q ~= 0.10, before BLOOM_START 0.15
  check('no bloom before BLOOM_START', u.uBloom.value === 0)

  advance(c, 300) // q ~= 0.40, mid-bloom
  const midBloom = u.uBloom.value
  check('bloom in progress mid-way', midBloom > 0 && midBloom < 1)
  check('morph still home-less before MORPH_START', u.uMorph.value === 0)

  advance(c, 300) // q ~= 0.70, past BLOOM_END 0.60 and into the morph
  check('bloom complete by BLOOM_END', u.uBloom.value === 1)
  const midMorph = u.uMorph.value
  check('morph in progress after MORPH_START', midMorph > 0 && midMorph < 1)

  advance(c, 400) // q = 1
  check('morph completes by the end of the overlay', u.uMorph.value === 1)
}

// Bloom and morph never travel backwards.
{
  const { c, u } = make()
  c.startOverlay()
  let pb = -1, pm = -1, mono = true
  for (let t = 0; t < 1200; t += 16) {
    c.update(0.016)
    if (u.uBloom.value < pb - 1e-9 || u.uMorph.value < pm - 1e-9) mono = false
    pb = u.uBloom.value
    pm = u.uMorph.value
  }
  check('bloom and morph are monotonic', mono)
}

// The video ending early must still finish the morph — the overlay clock and
// the real video WILL drift, and a half-morphed cage under a finished video is
// the one thing this must never leave behind.
{
  const { c, u, events } = make()
  c.startOverlay()
  advance(c, 700) // interrupted mid-morph
  check('morph genuinely incomplete at interruption', u.uMorph.value > 0 && u.uMorph.value < 1)
  c.start()
  check('start does not pop the morph instantly', u.uMorph.value < 1)
  advance(c, DEFAULT_IGNITION.IGNITION_MS * DEFAULT_IGNITION.SEED_END + 40)
  check('morph completes across the seed phase', u.uMorph.value === 1)
  advance(c, 2200)
  check('interrupted overlay still ends with done', events.filter((e) => e === 'done').length === 1)
}

// Ordering guards.
{
  const { c, u } = make()
  c.startOverlay()
  c.startOverlay()
  advance(c, 500)
  const once = u.uBloom.value
  c.startOverlay()
  check('startOverlay is idempotent', u.uBloom.value === once)
}
{
  const { c, u } = make()
  c.start()
  advance(c, 100)
  c.startOverlay()
  check('startOverlay after start is ignored', u.uMorph.value === 1)
}
{
  const { c, u } = make()
  c.finishNow()
  check('finishNow leaves the cage morphed home', u.uMorph.value === 1)
}

// --- hold pulses (spec §2b.3) ---

/** run the bridge to completion so pulses become legal */
const finished = () => {
  const m = make()
  m.c.start()
  advance(m.c, DEFAULT_IGNITION.IGNITION_MS + 200)
  m.events.length = 0
  return m
}

// A pulse arriving mid-bridge would fight the charge front already running.
{
  const { c, u } = make()
  c.start()
  advance(c, 300)
  const before = u.uGlobalFade.value
  c.pulse()
  check('pulse mid-bridge is ignored', !c.isPulsing() && u.uGlobalFade.value === before)
}

{
  const { c, u, events } = finished()
  check('cage hidden after the bridge', u.uGlobalFade.value === 0)
  c.pulse()
  check('pulse brings the cage back', u.uGlobalFade.value === 1)
  check('pulse reports pulsing', c.isPulsing())
  check('pulse keeps the cage at the logo shape', u.uMorph.value === 1 && u.uBloom.value === 0)
  check('pulse emits nothing', events.length === 0)

  // The wake must stay off for the WHOLE pulse — the skin is being pulled apart
  // and materializing it would fight the separation.
  let wakeEverOn = false
  for (let t = 0; t < DEFAULT_IGNITION.PULSE_MS + 100; t += 16) {
    c.update(0.016)
    if (u.uWakeActive.value !== 0) wakeEverOn = true
  }
  check('wake never activates during a pulse', !wakeEverOn)
  check('pulse finishes and hides the cage', !c.isPulsing() && u.uGlobalFade.value === 0)
  check('pulse still emits nothing', events.length === 0)
}

// The front sweeps outward during a pulse and resets for the next one.
{
  const { c, u } = finished()
  c.pulse()
  advance(c, DEFAULT_IGNITION.PULSE_MS * 0.5)
  const mid = u.uFront.value
  check('pulse front travels', mid > 0)
  advance(c, DEFAULT_IGNITION.PULSE_MS)
  check('pulse front resets when done', u.uFront.value === 0)
  c.pulse()
  check('a second pulse restarts the front', u.uFront.value === 0 && c.isPulsing())
  advance(c, DEFAULT_IGNITION.PULSE_MS * 0.5)
  check('second pulse sweeps again', u.uFront.value > 0)
}

// Pulses must never resurrect the bridge's own state.
{
  const { c, events } = finished()
  c.pulse()
  advance(c, DEFAULT_IGNITION.PULSE_MS + 100)
  check('pulses never re-emit done', events.filter((e) => e === 'done').length === 0)
  check('controller stays finished', c.isFinished())
}

console.log(
  failures === 0 ? '\nAll ignition controller checks passed.' : `\n${failures} check(s) FAILED.`,
)
process.exit(failures === 0 ? 0 : 1)
