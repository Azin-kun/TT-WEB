/**
 * Assertions for the pure CMS <-> engine config mapping.
 * Run: npm run verify:config
 *
 * This repo has no test runner; this follows the existing `seed:verify` idiom
 * of a plain tsx script that throws on failure.
 */
import { DEFAULT_SEPARATION } from './types'
import { resolveSeparation, toHeroEffectsPayload } from './resolveSeparation'

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
  const r = resolveSeparation(input as never)
  check(`${label} -> defaults`, r.CHARGE_MS === DEFAULT_SEPARATION.CHARGE_MS)
  check(`${label} -> defaults (colour)`, r.SHINE_WARM === DEFAULT_SEPARATION.SHINE_WARM)
}

// partial CMS values override only what they set
const partial = resolveSeparation({ timing: { chargeMs: 1234 } })
check('partial override applies', partial.CHARGE_MS === 1234)
check('partial leaves others default', partial.REFORM_MS === DEFAULT_SEPARATION.REFORM_MS)

// nulls from an unsaved field fall back rather than becoming 0
const nulled = resolveSeparation({ timing: { chargeMs: null, reformMs: 700 } })
check('null falls back', nulled.CHARGE_MS === DEFAULT_SEPARATION.CHARGE_MS)
check('sibling still applies', nulled.REFORM_MS === 700)

// hex colours convert
const col = resolveSeparation({ material: { shineWarm: '#010203', shineBright: '#0A0B0C' } })
check('hex warm converts', col.SHINE_WARM === 0x010203)
check('hex bright converts', col.SHINE_BRIGHT === 0x0a0b0c)

// malformed hex falls back instead of rendering black
const bad = resolveSeparation({ material: { shineWarm: 'not-a-colour' } })
check('bad hex falls back', bad.SHINE_WARM === DEFAULT_SEPARATION.SHINE_WARM)

// inverted spin range is normalised (the approved bench values were inverted)
const spun = resolveSeparation({ motion: { spinMin: 0.21, spinMax: 0.18 } })
check('spin min normalised', spun.SPIN_MIN === 0.18)
check('spin max normalised', spun.SPIN_MAX === 0.21)

// enabled flag defaults true and round-trips false
check('enabled defaults true', resolveSeparation({}).ENABLED === true)
check('enabled false applies', resolveSeparation({ separationEnabled: false }).ENABLED === false)

// round trip: config -> CMS shape -> config is lossless
const round = resolveSeparation(toHeroEffectsPayload(DEFAULT_SEPARATION))
for (const key of Object.keys(DEFAULT_SEPARATION) as (keyof typeof DEFAULT_SEPARATION)[]) {
  check(`round trip ${key}`, round[key] === DEFAULT_SEPARATION[key])
}

// The round trip above is a near-tautology: DEFAULT_SEPARATION round-tripped
// against itself passes even for a field toHeroEffectsPayload never writes,
// or that resolveSeparation reads from the wrong CMS group — the value just
// falls back to the same default on both sides. Round-trip a config where
// EVERY CMS-mapped field is perturbed to a distinct, in-range, non-default
// value so a dropped or misrouted field actually shows up as a mismatch.
// SCROLL_DISARM_FRAC is deliberately excluded — it is not CMS-mapped and
// always comes from defaults (see resolveSeparation).
const PERTURBED: typeof DEFAULT_SEPARATION = {
  ...DEFAULT_SEPARATION,
  ENABLED: false,
  CHARGE_MS: 1800,
  REFORM_MS: 1200,
  SEPARATE_START: 0.4,
  STAGGER_MAX: 0.35,
  SPREAD_FRAC: 1.1,
  SPREAD_VAR: 0.45,
  LATERAL_DRIFT: 1.2,
  SPIN_MIN: 0.3, // spinMin < spinMax so normalisation does not swap them
  SPIN_MAX: 0.9,
  CAP_NORMAL_MIN: 0.6,
  NORMAL_FOLLOW: 0.2,
  HATCH_STRENGTH: 0.9,
  HATCH_SCALE: 2.5,
  SHINE_STRENGTH: 0.75,
  SHINE_WIDTH: 0.4,
  SHINE_SPEED: 2.1,
  SHINE_CHARGE_BOOST: 3,
  SHINE_WARM: 0x123456,
  SHINE_BRIGHT: 0xabcdef,
  SKIN_OPACITY: 0.85,
  BODY_OPACITY: 0.5,
  BODY_EDGE_OPACITY: 0.3,
  BODY_EDGE_ANGLE: 45,
  VIBRATE_FRAC: 0.02,
  VIBRATE_PHASE_STEP: 2.2,
  DRAG_THRESHOLD_PX: 12,
}

const round2 = resolveSeparation(toHeroEffectsPayload(PERTURBED))
for (const key of Object.keys(PERTURBED) as (keyof typeof PERTURBED)[]) {
  if (key === 'SCROLL_DISARM_FRAC') continue
  check(`round trip (perturbed, non-default) ${key}`, round2[key] === PERTURBED[key])
}
check(
  'round trip (perturbed) SCROLL_DISARM_FRAC stays default (not CMS-mapped)',
  round2.SCROLL_DISARM_FRAC === DEFAULT_SEPARATION.SCROLL_DISARM_FRAC,
)

// defaults are frozen
check(
  'defaults frozen',
  (() => {
    try {
      // @ts-expect-error deliberate runtime mutation attempt
      DEFAULT_SEPARATION.CHARGE_MS = 1
      return DEFAULT_SEPARATION.CHARGE_MS !== 1
    } catch {
      return true
    }
  })(),
)

console.log(failures === 0 ? '\nAll config checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
