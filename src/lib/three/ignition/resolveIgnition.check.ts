/**
 * Assertions for the pure CMS <-> engine config mapping for ignition.
 * Run: npm run verify:config
 *
 * Mirrors resolveSeparation.check.ts. This repo has no test runner; this
 * follows the existing `seed:verify` idiom of a plain tsx script that throws.
 */
import { DEFAULT_IGNITION } from './types'
import { resolveIgnition, toIgnitionPayload } from './resolveIgnition'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

// null / undefined / empty -> pure defaults
for (const [label, input] of [
  ['null', null],
  ['undefined', undefined],
  ['empty object', {}],
] as const) {
  const r = resolveIgnition(input as never)
  check(`${label} -> defaults`, r.IGNITION_MS === DEFAULT_IGNITION.IGNITION_MS)
  check(`${label} -> defaults (colour)`, r.WARM_COLOR === DEFAULT_IGNITION.WARM_COLOR)
}

// partial CMS values override only what they set
const partial = resolveIgnition({ ignitionTiming: { ignitionMs: 3200 } })
check('partial override applies', partial.IGNITION_MS === 3200)
check('partial leaves others default', partial.SEED_END === DEFAULT_IGNITION.SEED_END)

// nulls from an unsaved field fall back rather than becoming 0
const nulled = resolveIgnition({ ignitionTiming: { ignitionMs: null, seedEnd: 0.2 } })
check('null falls back', nulled.IGNITION_MS === DEFAULT_IGNITION.IGNITION_MS)
check('sibling still applies', nulled.SEED_END === 0.2)

// hex colours convert
const col = resolveIgnition({ ignitionColor: { warmColor: '#010203', crestColor: '#0A0B0C' } })
check('hex warm converts', col.WARM_COLOR === 0x010203)
check('hex crest converts', col.CREST_COLOR === 0x0a0b0c)

// malformed hex falls back instead of rendering black
const bad = resolveIgnition({ ignitionColor: { warmColor: 'not-a-colour' } })
check('bad hex falls back', bad.WARM_COLOR === DEFAULT_IGNITION.WARM_COLOR)

// enabled flag defaults true and round-trips false
check('enabled defaults true', resolveIgnition({}).ENABLED === true)
check('enabled false applies', resolveIgnition({ ignitionEnabled: false }).ENABLED === false)

// Phase boundaries must stay ordered. The spec chose fractions precisely so an
// inconsistent timeline is unrepresentable; the resolver enforces that even if
// an editor saves nonsense straight to the REST API.
const inverted = resolveIgnition({ ignitionTiming: { seedEnd: 0.9, frontEnd: 0.2 } })
check('seedEnd never exceeds frontEnd', inverted.SEED_END <= inverted.FRONT_END)
const lateCue = resolveIgnition({ ignitionTiming: { cueFrac: 2 } })
check('cueFrac clamped to <= 1', lateCue.CUE_FRAC <= 1)

// --- morph cage / overlay (spec §2b) ---
const badBloom = resolveIgnition({ ignitionOverlay: { bloomStart: 0.8, bloomEnd: 0.2 } })
check('bloomStart never exceeds bloomEnd', badBloom.BLOOM_START <= badBloom.BLOOM_END)
const lateMorph = resolveIgnition({ ignitionOverlay: { morphStart: 5 } })
check('morphStart clamped to <= 1', lateMorph.MORPH_START <= 1)
// A polygon needs at least 3 sides; below that the radius function degenerates
// and the cage would collapse to a line.
const fewSides = resolveIgnition({ ignitionOverlay: { polySides: 1 } })
check('polySides clamped to >= 3', fewSides.POLY_SIDES >= 3)
check('overlay defaults enabled', resolveIgnition({}).OVERLAY_ENABLED === true)
check('pulse defaults enabled', resolveIgnition({}).PULSE_ENABLED === true)
check(
  'overlay disable applies',
  resolveIgnition({ ignitionOverlay: { overlayEnabled: false } }).OVERLAY_ENABLED === false,
)
check(
  'pulse disable applies',
  resolveIgnition({ ignitionPulse: { pulseEnabled: false } }).PULSE_ENABLED === false,
)

// round trip: config -> CMS shape -> config is lossless.
// Perturb EVERY CMS-mapped field to a distinct non-default value first — the
// separation equivalent originally round-tripped defaults against themselves,
// which passes even when a field is dropped or read from the wrong group.
const PERTURBED: typeof DEFAULT_IGNITION = {
  ...DEFAULT_IGNITION,
  ENABLED: false,
  IGNITION_MS: 2600,
  SEED_END: 0.2,
  FRONT_END: 0.7,
  CUE_FRAC: 0.75,
  SEED_OFFSET_X: 0.1,
  SEED_OFFSET_Y: -0.2,
  SEED_OFFSET_Z: 0.3,
  FRONT_SOFTNESS: 0.3,
  WAKE_LAG: 0.2,
  CAGE_DENSITY: 0.8,
  CAGE_DENSITY_MOBILE: 0.15,
  CAGE_OPACITY: 0.7,
  CAGE_SEED: 4242,
  COLD_COLOR: 0x112233,
  WARM_COLOR: 0x445566,
  HOT_COLOR: 0x778899,
  CREST_COLOR: 0xaabbcc,
  CORE_STRENGTH: 0.5,
  CORE_RADIUS: 0.4,
  DARK_MASS_OPACITY: 0.3,
  GLOW_DECAY: 1.5,
  OVERLAY_ENABLED: false,
  OVERLAY_LEAD_MS: 1400,
  SPHERE_SCALE: 1.35,
  BLOOM_SCALE: 2.1,
  POLY_SIDES: 6,
  BLOOM_START: 0.25,
  BLOOM_END: 0.7,
  MORPH_START: 0.75,
  PULSE_ENABLED: false,
  PULSE_MS: 1200,
  WIRE_JITTER: 0.07,
  WIRE_SPEED: 1.9,
  SPARK_STAGGER: 0.13,
  SPARK_RATE: 3.2,
  SPARK_DENSITY: 0.21,
  SPARK_IDLE: 0.44,
  EMBER_ENABLED: false,
  EMBER_DENSITY: 0.51,
  EMBER_SIZE: 6.5,
  EMBER_TWINKLE: 4.4,
  EMBER_OPACITY: 0.66,
}

const round = resolveIgnition(toIgnitionPayload(PERTURBED))
for (const key of Object.keys(PERTURBED) as (keyof typeof PERTURBED)[]) {
  check(`round trip (perturbed, non-default) ${key}`, round[key] === PERTURBED[key])
}

// defaults are frozen
check(
  'defaults frozen',
  (() => {
    try {
      // @ts-expect-error deliberate runtime mutation attempt
      DEFAULT_IGNITION.IGNITION_MS = 1
      return DEFAULT_IGNITION.IGNITION_MS !== 1
    } catch {
      return true
    }
  })(),
)

console.log(
  failures === 0 ? '\nAll ignition config checks passed.' : `\n${failures} check(s) FAILED.`,
)
process.exit(failures === 0 ? 0 : 1)
