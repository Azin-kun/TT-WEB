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
