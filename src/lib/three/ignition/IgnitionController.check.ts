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

console.log(
  failures === 0 ? '\nAll ignition controller checks passed.' : `\n${failures} check(s) FAILED.`,
)
process.exit(failures === 0 ? 0 : 1)
