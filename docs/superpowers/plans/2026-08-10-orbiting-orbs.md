# Hero Orbiting Orbs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `ConstellationField` with small glowing rings orbiting the 3D logo — one orb per CMS word, its word revealed on hover — with the orbit paths drawn as faint trace lines.

**Architecture:** A new `src/lib/three/orbs/` module, a **parallel** sibling of `shatter/` and `ignition/` (not an extension of either), driven by `LogoEngine`. Orbits are real 3D circles rotated out of the XZ plane, so screen-space ellipses and occlusion come from actual perspective. Occlusion needs a depth-only pass, because every logo material sets `depthWrite: false`.

**Tech Stack:** Next.js 15 App Router · TypeScript · three.js (lazy, `dynamic(ssr:false)`) · Payload CMS 3 · `tsx` check scripts (no test runner in this repo) · `puppeteer-core` for browser verification.

**Spec:** [2026-08-10-orbiting-orbs-design.md](../specs/2026-08-10-orbiting-orbs-design.md)
**Observations:** [2026-08-10-orbiting-orbs-reference-observations.md](../specs/2026-08-10-orbiting-orbs-reference-observations.md)

## Global Constraints

- **Branch:** create `feat/hero-orbs` off `main`. Do not commit to `main`.
- **Working directory:** `D:\TAMPA TARUNO\WEBSITE\_WEB_PRODUCT`. The `C:\Users\user\OneDrive\...` copy is stale — never touch it.
- **three.js stays lazy.** Nothing under `src/lib/three/` may be imported from a server component or from outside the `dynamic(ssr:false)` boundary.
- **No mobile cap.** Every orb renders on every viewport (owner decision, 2026-08-10). Smallness, not culling, keeps the hero uncluttered.
- **Orb count follows the CMS word list.** One orb per word, always.
- **Exactly 3 orbit-plane tilt angles.** Heights vary freely.
- **Config is not localized.** Numbers and hex strings, identical EN/ID.
- **This repo has no test runner.** Tests are plain `tsx` scripts that `process.exit(1)` on failure, following the `resolveIgnition.check.ts` idiom, wired into `npm run verify:config`.
- **`gl_PointSize` must never use the `300.0 / -mv.z` idiom.** In this scene (`CAMERA_Z = 2.4`) it produced ~437px points and 5.9 fps. Attenuate against the camera's real distance with a hard pixel clamp.
- **Every `.replace()` on a shader string must be asserted to have applied.** A missed anchor silently no-ops; this codebase has shipped one bug of exactly that shape.
- **Commit after every task.**

---

### Task 1: Orb config types, CMS resolver, and checks

**Files:**
- Create: `src/lib/three/orbs/types.ts`
- Create: `src/lib/three/orbs/resolveOrbs.ts`
- Create: `src/lib/three/orbs/resolveOrbs.check.ts`
- Modify: `package.json` (the `verify:config` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `OrbsConfig` — the config object
  - `DEFAULT_ORBS: Readonly<OrbsConfig>` — frozen
  - `OrbUniforms` — `{ uTime, uSize, uColor, uGlow, uOpacity, uPointRef, uCharge }`
  - `resolveOrbs(cms: HeroEffectsOrbsInput | null | undefined): OrbsConfig`
  - `toOrbsPayload(c: OrbsConfig): HeroEffectsOrbsInput`

- [ ] **Step 1: Write the failing check script**

Create `src/lib/three/orbs/resolveOrbs.check.ts`:

```ts
/**
 * Assertions for the pure CMS <-> engine config mapping for the orbs.
 * Run: npm run verify:config
 *
 * Mirrors resolveIgnition.check.ts. This repo has no test runner; this follows
 * the existing idiom of a plain tsx script that exits non-zero.
 */
import { DEFAULT_ORBS } from './types'
import { resolveOrbs, toOrbsPayload } from './resolveOrbs'

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
  const r = resolveOrbs(input as never)
  check(`${label} -> defaults`, r.ORB_SIZE === DEFAULT_ORBS.ORB_SIZE)
  check(`${label} -> defaults (colour)`, r.ORB_COLOR === DEFAULT_ORBS.ORB_COLOR)
}

// partial CMS values override only what they set
const partial = resolveOrbs({ orbsField: { orbSize: 9 } })
check('partial override applies', partial.ORB_SIZE === 9)
check('partial leaves others default', partial.ORB_SEED === DEFAULT_ORBS.ORB_SEED)

// nulls from a never-saved field fall back rather than becoming 0
const nulled = resolveOrbs({ orbsField: { orbSize: null, orbSeed: 99 } })
check('null falls back', nulled.ORB_SIZE === DEFAULT_ORBS.ORB_SIZE)
check('sibling still applies', nulled.ORB_SEED === 99)

// hex colours convert
const col = resolveOrbs({ orbsColor: { orbColor: '#010203', trailColor: '#0A0B0C' } })
check('hex orb converts', col.ORB_COLOR === 0x010203)
check('hex trail converts', col.TRAIL_COLOR === 0x0a0b0c)

// malformed hex falls back instead of rendering black
const bad = resolveOrbs({ orbsColor: { orbColor: 'not-a-colour' } })
check('bad hex falls back', bad.ORB_COLOR === DEFAULT_ORBS.ORB_COLOR)

// enabled flag defaults true and round-trips false
check('enabled defaults true', resolveOrbs({}).ENABLED === true)
check('enabled false applies', resolveOrbs({ orbsEnabled: false }).ENABLED === false)

// Radius band must stay ordered, and the separation threshold must stay usable.
// Payload's min/max guards the admin UI, but the REST API can be written directly.
const inverted = resolveOrbs({ orbsField: { radiusMin: 2.0, radiusMax: 0.5 } })
check('radiusMin never exceeds radiusMax', inverted.RADIUS_MIN <= inverted.RADIUS_MAX)
const wideSep = resolveOrbs({ orbsField: { minSeparation: 99 } })
check('minSeparation clamped below 1', wideSep.MIN_SEPARATION < 1)

// There are always EXACTLY three tilt angles — the owner's constraint.
check('exactly three tilts', resolveOrbs({}).TILTS.length === 3)
const tilts = resolveOrbs({ orbsField: { tiltA: 10, tiltB: 20, tiltC: 30 } })
check('tilts map in order', tilts.TILTS[0] === 10 && tilts.TILTS[1] === 20 && tilts.TILTS[2] === 30)

// round trip: config -> CMS shape -> config is lossless.
// EVERY value here must differ from its default, or its assertion below is a
// tautology that passes even when the field is dropped from toOrbsPayload. The
// guard loop after this object enforces that structurally.
const PERTURBED: typeof DEFAULT_ORBS = {
  ...DEFAULT_ORBS,
  ENABLED: false,
  ORB_SIZE: 11,
  ORB_COLOR: 0x112233,
  TRAIL_COLOR: 0x445566,
  GLOW: 0.42,
  TRAIL_OPACITY: 0.37,
  RADIUS_MIN: 0.71,
  RADIUS_MAX: 1.63,
  HEIGHT_SPREAD: 0.83,
  MIN_SEPARATION: 0.19,
  BASE_SPEED: 0.47,
  SPEED_VAR: 0.29,
  CHARGE_RESPONSE: 0.61,
  ENTRANCE_MS: 1450,
  ORB_SEED: 777,
  TILTS: [12, 34, 56],
}

// Guard the guard: a default moving later must not silently neuter an assertion.
for (const key of Object.keys(PERTURBED) as (keyof typeof PERTURBED)[]) {
  const a = JSON.stringify(PERTURBED[key])
  const b = JSON.stringify(DEFAULT_ORBS[key])
  check(`perturbed value differs from default: ${key}`, a !== b)
}

const round = resolveOrbs(toOrbsPayload(PERTURBED))
for (const key of Object.keys(PERTURBED) as (keyof typeof PERTURBED)[]) {
  check(
    `round trip (perturbed, non-default) ${key}`,
    JSON.stringify(round[key]) === JSON.stringify(PERTURBED[key]),
  )
}

// defaults are frozen
check(
  'defaults frozen',
  (() => {
    try {
      // @ts-expect-error deliberate runtime mutation attempt
      DEFAULT_ORBS.ORB_SIZE = 1
      return DEFAULT_ORBS.ORB_SIZE !== 1
    } catch {
      return true
    }
  })(),
)

console.log(failures === 0 ? '\nAll orb config checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/three/orbs/resolveOrbs.check.ts
```

Expected: FAIL — `Cannot find module './types'`.

- [ ] **Step 3: Create the types**

Create `src/lib/three/orbs/types.ts`:

```ts
import type * as THREE from 'three'

/**
 * Default tuning for the hero's orbiting orbs.
 * Spec: docs/superpowers/specs/2026-08-10-orbiting-orbs-design.md §3, §5
 *
 * Frozen. Live values come from the `hero-effects` Payload global and are
 * merged over these by resolveOrbs().
 *
 * Lengths (RADIUS_*, HEIGHT_SPREAD, MIN_SEPARATION) are FRACTIONS OF THE LOGO'S
 * HEIGHT, never world units — so the whole field rescales with the mark, which
 * itself rescales with the viewport (see videoCoverScale in calibration.ts).
 */
export type OrbsConfig = {
  ENABLED: boolean
  /** orb diameter in PIXELS at the logo's own depth. Kept small by owner instruction. */
  ORB_SIZE: number
  ORB_COLOR: number
  TRAIL_COLOR: number
  /** 0..1 bloom-ish brightness of the ring's rim */
  GLOW: number
  /** 0 disables the orbit trace lines without removing the orbs */
  TRAIL_OPACITY: number
  RADIUS_MIN: number
  RADIUS_MAX: number
  /** orbit-centre heights span +/- this about the logo's centre */
  HEIGHT_SPREAD: number
  /** two orbs may not be within this of each other in BOTH height and radius */
  MIN_SEPARATION: number
  /** radians per second */
  BASE_SPEED: number
  /** 0..1 fraction by which per-orb speed may vary from BASE_SPEED */
  SPEED_VAR: number
  /** how strongly the separation's charge agitates the orbs */
  CHARGE_RESPONSE: number
  ENTRANCE_MS: number
  /** mulberry32 seed, so the arrangement is identical on every load */
  ORB_SEED: number
  /**
   * EXACTLY three orbit-plane inclinations, in degrees (owner constraint,
   * 2026-08-10). Shallow angles read as foreshortened ellipses; a 0-degree
   * plane would render as a flat halo and destroy the sense of depth.
   */
  TILTS: [number, number, number]
}

export const DEFAULT_ORBS: Readonly<OrbsConfig> = Object.freeze({
  ENABLED: true,
  ORB_SIZE: 7,
  /** red-pencil token, matching the ignition's warm ramp */
  ORB_COLOR: 0x8e1114,
  /** the ghost wireframe's graphite, so trails read as drawn lines not light */
  TRAIL_COLOR: 0x2b2a27,
  GLOW: 0.8,
  TRAIL_OPACITY: 0.18,
  RADIUS_MIN: 0.75,
  RADIUS_MAX: 1.5,
  HEIGHT_SPREAD: 0.55,
  MIN_SEPARATION: 0.12,
  BASE_SPEED: 0.28,
  SPEED_VAR: 0.35,
  CHARGE_RESPONSE: 0.5,
  ENTRANCE_MS: 1200,
  ORB_SEED: 20260810,
  TILTS: [14, 32, 58] as [number, number, number],
})

export type OrbUniforms = {
  uTime: { value: number }
  uSize: { value: number }
  uColor: { value: THREE.Color }
  uGlow: { value: number }
  /** whole-field fade: entrance, scroll dissolve */
  uOpacity: { value: number }
  /** camera distance the orb size is calibrated at — see the gl_PointSize trap */
  uPointRef: { value: number }
  /** 0..1 separation charge, drives agitation */
  uCharge: { value: number }
}
```

- [ ] **Step 4: Create the resolver**

Create `src/lib/three/orbs/resolveOrbs.ts`:

```ts
import { DEFAULT_ORBS, type OrbsConfig } from './types'

/**
 * The orbs' slice of the `hero-effects` global. Written by hand rather than
 * imported from payload-types so this module compiles before the fields exist
 * and does not break if generated types are stale. Every field is optional and
 * nullable because Payload returns nulls for never-saved fields.
 */
export type HeroEffectsOrbsInput = {
  orbsEnabled?: boolean | null
  orbsField?: {
    orbSize?: number | null
    glow?: number | null
    radiusMin?: number | null
    radiusMax?: number | null
    heightSpread?: number | null
    minSeparation?: number | null
    baseSpeed?: number | null
    speedVar?: number | null
    chargeResponse?: number | null
    entranceMs?: number | null
    orbSeed?: number | null
    tiltA?: number | null
    tiltB?: number | null
    tiltC?: number | null
  } | null
  orbsColor?: {
    orbColor?: string | null
    trailColor?: string | null
    trailOpacity?: number | null
  } | null
}

const HEX = /^#[0-9a-fA-F]{6}$/

const num = (v: number | null | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const hexToInt = (v: string | null | undefined, fallback: number): number =>
  typeof v === 'string' && HEX.test(v) ? parseInt(v.slice(1), 16) : fallback

const intToHex = (v: number): string => `#${v.toString(16).padStart(6, '0').toUpperCase()}`

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * Merges CMS values over the frozen defaults. Anything null/undefined — a
 * never-saved global, or a field added in a later release — falls back.
 */
export function resolveOrbs(cms: HeroEffectsOrbsInput | null | undefined): OrbsConfig {
  const d = DEFAULT_ORBS
  const f = cms?.orbsField ?? {}
  const c = cms?.orbsColor ?? {}

  // The radius band must stay ordered, or orbField's rejection sampling has an
  // empty interval to draw from and can never place an orb.
  const radiusMin = Math.max(0.05, num(f.radiusMin, d.RADIUS_MIN))
  const radiusMax = Math.max(radiusMin, num(f.radiusMax, d.RADIUS_MAX))

  return {
    ENABLED: typeof cms?.orbsEnabled === 'boolean' ? cms.orbsEnabled : d.ENABLED,
    ORB_SIZE: num(f.orbSize, d.ORB_SIZE),
    ORB_COLOR: hexToInt(c.orbColor, d.ORB_COLOR),
    TRAIL_COLOR: hexToInt(c.trailColor, d.TRAIL_COLOR),
    GLOW: num(f.glow, d.GLOW),
    TRAIL_OPACITY: num(c.trailOpacity, d.TRAIL_OPACITY),
    RADIUS_MIN: radiusMin,
    RADIUS_MAX: radiusMax,
    HEIGHT_SPREAD: num(f.heightSpread, d.HEIGHT_SPREAD),
    // Must stay below 1: it is a fraction of logo height, and a threshold at or
    // above the whole radius band would make every placement conflict.
    MIN_SEPARATION: clamp(num(f.minSeparation, d.MIN_SEPARATION), 0, 0.9),
    BASE_SPEED: num(f.baseSpeed, d.BASE_SPEED),
    SPEED_VAR: clamp(num(f.speedVar, d.SPEED_VAR), 0, 1),
    CHARGE_RESPONSE: num(f.chargeResponse, d.CHARGE_RESPONSE),
    ENTRANCE_MS: num(f.entranceMs, d.ENTRANCE_MS),
    ORB_SEED: num(f.orbSeed, d.ORB_SEED),
    TILTS: [
      num(f.tiltA, d.TILTS[0]),
      num(f.tiltB, d.TILTS[1]),
      num(f.tiltC, d.TILTS[2]),
    ],
  }
}

/** Inverse mapping, used by the dev bench's Save to CMS button. */
export function toOrbsPayload(c: OrbsConfig): HeroEffectsOrbsInput {
  return {
    orbsEnabled: c.ENABLED,
    orbsField: {
      orbSize: c.ORB_SIZE,
      glow: c.GLOW,
      radiusMin: c.RADIUS_MIN,
      radiusMax: c.RADIUS_MAX,
      heightSpread: c.HEIGHT_SPREAD,
      minSeparation: c.MIN_SEPARATION,
      baseSpeed: c.BASE_SPEED,
      speedVar: c.SPEED_VAR,
      chargeResponse: c.CHARGE_RESPONSE,
      entranceMs: c.ENTRANCE_MS,
      orbSeed: c.ORB_SEED,
      tiltA: c.TILTS[0],
      tiltB: c.TILTS[1],
      tiltC: c.TILTS[2],
    },
    orbsColor: {
      orbColor: intToHex(c.ORB_COLOR),
      trailColor: intToHex(c.TRAIL_COLOR),
      trailOpacity: c.TRAIL_OPACITY,
    },
  }
}
```

- [ ] **Step 5: Run the check to verify it passes**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/three/orbs/resolveOrbs.check.ts
```

Expected: every line `ok`, then `All orb config checks passed.`, exit 0.

- [ ] **Step 6: Wire it into `verify:config`**

In `package.json`, append to the `verify:config` script (it currently chains 5 suites; this makes 6):

```json
"verify:config": "node --import tsx src/lib/three/shatter/resolveSeparation.check.ts && node --import tsx src/lib/three/ignition/resolveIgnition.check.ts && node --import tsx src/lib/three/ignition/cage.check.ts && node --import tsx src/lib/three/ignition/ignitionMaterial.check.ts && node --import tsx src/lib/three/ignition/IgnitionController.check.ts && node --import tsx src/lib/three/orbs/resolveOrbs.check.ts"
```

Run: `npm run verify:config` — expected: all 6 suites pass, exit 0.

- [ ] **Step 7: Typecheck and commit**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit
git add src/lib/three/orbs package.json
git commit -m "feat(orbs): config types, CMS resolver and checks"
```

---

### Task 2: The orbit field — deterministic placement and the separation rule

**Files:**
- Create: `src/lib/three/orbs/orbField.ts`
- Create: `src/lib/three/orbs/orbField.check.ts`
- Modify: `package.json` (`verify:config`)

**Interfaces:**
- Consumes: `OrbsConfig` (Task 1); `mulberry32` from `../shatter/types`.
- Produces:
  - `type Orb = { y: number; radius: number; tiltIndex: 0 | 1 | 2; phase: number; speed: number }`
  - `buildOrbField(count: number, config: OrbsConfig): Orb[]`
  - `orbPosition(orb: Orb, config: OrbsConfig, t: number, out: THREE.Vector3): THREE.Vector3`

This task is pure maths with no WebGL, so it is fully unit-testable. **The separation rule is the module's most important property** — it is what stops two orbs tracing the same ellipse and reading as one path with two beads on it.

- [ ] **Step 1: Write the failing check**

Create `src/lib/three/orbs/orbField.check.ts`:

```ts
/**
 * Assertions for deterministic orbit placement.
 * Run: npm run verify:config
 *
 * The headline property: no two orbs may sit close in BOTH height and radius.
 * Two that do trace effectively the same ellipse. Heights vary freely (owner,
 * 2026-08-10), so exact collisions would be rare — the rule is enforced as a
 * minimum separation instead, which is the version that actually holds.
 */
import * as THREE from 'three'
import { DEFAULT_ORBS } from './types'
import { buildOrbField, orbPosition } from './orbField'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const conflicts = (orbs: ReturnType<typeof buildOrbField>, sep: number) => {
  let n = 0
  for (let i = 0; i < orbs.length; i++) {
    for (let j = i + 1; j < orbs.length; j++) {
      const dy = Math.abs(orbs[i].y - orbs[j].y)
      const dr = Math.abs(orbs[i].radius - orbs[j].radius)
      if (dy < sep && dr < sep) n++
    }
  }
  return n
}

// The rule holds, across many seeds and counts.
for (const seed of [1, 7, 42, 1337, 20260810]) {
  for (const count of [1, 2, 8, 12, 24]) {
    const cfg = { ...DEFAULT_ORBS, ORB_SEED: seed }
    const orbs = buildOrbField(count, cfg)
    check(`seed ${seed} count ${count}: produces exactly ${count} orbs`, orbs.length === count)
    check(
      `seed ${seed} count ${count}: no two orbs close in BOTH height and radius`,
      conflicts(orbs, cfg.MIN_SEPARATION) === 0,
    )
  }
}

// Only ever three distinct tilts — the owner's constraint.
{
  const orbs = buildOrbField(24, DEFAULT_ORBS)
  const used = new Set(orbs.map((o) => o.tiltIndex))
  check('only three tilt slots are ever used', [...used].every((i) => i === 0 || i === 1 || i === 2))
  check('tilt slots stay within range', used.size <= 3)
}

// Radii stay inside the configured band.
{
  const orbs = buildOrbField(16, DEFAULT_ORBS)
  check(
    'radii respect the configured band',
    orbs.every((o) => o.radius >= DEFAULT_ORBS.RADIUS_MIN - 1e-6 && o.radius <= DEFAULT_ORBS.RADIUS_MAX + 1e-6),
  )
  check(
    'heights respect the configured spread',
    orbs.every((o) => Math.abs(o.y) <= DEFAULT_ORBS.HEIGHT_SPREAD + 1e-6),
  )
}

// Determinism: same seed -> identical field.
{
  const a = buildOrbField(8, DEFAULT_ORBS)
  const b = buildOrbField(8, DEFAULT_ORBS)
  check('same seed is deterministic', JSON.stringify(a) === JSON.stringify(b))
  const c = buildOrbField(8, { ...DEFAULT_ORBS, ORB_SEED: 999 })
  check('different seed gives a different field', JSON.stringify(a) !== JSON.stringify(c))
}

// Termination under a pathologically tight config: a separation threshold far
// too large for the band must still return the requested count rather than
// hanging or looping forever.
{
  const cruel = { ...DEFAULT_ORBS, RADIUS_MIN: 1, RADIUS_MAX: 1.02, HEIGHT_SPREAD: 0.01, MIN_SEPARATION: 0.9 }
  const orbs = buildOrbField(12, cruel)
  check('terminates and still returns the full count under a cruel config', orbs.length === 12)
}

// Zero and negative counts are safe.
check('count 0 yields an empty field', buildOrbField(0, DEFAULT_ORBS).length === 0)
check('negative count yields an empty field', buildOrbField(-3, DEFAULT_ORBS).length === 0)

// orbPosition: the orb travels a circle of its own radius about its own centre.
{
  const orb = { y: 0.2, radius: 1.1, tiltIndex: 0 as const, phase: 0, speed: 1 }
  const cfg = { ...DEFAULT_ORBS, TILTS: [0, 0, 0] as [number, number, number] }
  const out = new THREE.Vector3()
  const centre = new THREE.Vector3(0, orb.y, 0)
  for (const t of [0, 0.3, 1.1, 2.7]) {
    orbPosition(orb, cfg, t, out)
    check(
      `orbPosition t=${t}: stays on its own radius`,
      Math.abs(out.distanceTo(centre) - orb.radius) < 1e-6,
    )
  }
  // With zero tilt the orbit lies flat, so y never leaves the orbit's centre.
  orbPosition(orb, cfg, 0.9, out)
  check('zero tilt keeps the orbit flat', Math.abs(out.y - orb.y) < 1e-6)
}

// A non-zero tilt lifts the orbit out of the flat plane — this is what makes it
// read as a foreshortened ellipse rather than a flat halo.
{
  const orb = { y: 0, radius: 1, tiltIndex: 0 as const, phase: Math.PI / 2, speed: 1 }
  const cfg = { ...DEFAULT_ORBS, TILTS: [45, 0, 0] as [number, number, number] }
  const out = new THREE.Vector3()
  orbPosition(orb, cfg, 0, out)
  check('non-zero tilt lifts the orbit out of plane', Math.abs(out.y) > 0.1)
}

console.log(failures === 0 ? '\nAll orb field checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/three/orbs/orbField.check.ts
```

Expected: FAIL — `Cannot find module './orbField'`.

- [ ] **Step 3: Implement the field**

Create `src/lib/three/orbs/orbField.ts`:

```ts
import * as THREE from 'three'
import { mulberry32 } from '../shatter/types'
import type { OrbsConfig } from './types'

/**
 * Deterministic placement of the orbiting orbs.
 * Spec: docs/superpowers/specs/2026-08-10-orbiting-orbs-design.md §3.1, §3.2
 *
 * All lengths are FRACTIONS OF LOGO HEIGHT, so the field rescales with the mark.
 */

export type Orb = {
  /** height of this orbit's centre, relative to the logo's centre */
  y: number
  radius: number
  /** which of the config's three tilt angles this orbit's plane uses */
  tiltIndex: 0 | 1 | 2
  /** starting angle, radians */
  phase: number
  /** radians per second */
  speed: number
}

const DEG = Math.PI / 180

/**
 * Places `count` orbs so that no two sit close in BOTH height and radius.
 *
 * Two orbs alike in both trace effectively the same ellipse and read as one
 * path with two beads on it. Heights vary freely (owner, 2026-08-10), so exact
 * collisions are rare and testing for them would prove nothing — the rule is
 * enforced as a minimum separation, which is the version that actually holds.
 *
 * Rejection sampling with a BOUNDED retry count: past the budget the candidate
 * is pushed radially away from the band it collided with, so a config whose
 * separation threshold is too large for its radius band still terminates and
 * still returns the requested count. It will simply place orbs closer together
 * than asked, which is strictly better than hanging or returning short.
 */
export function buildOrbField(count: number, config: OrbsConfig): Orb[] {
  const n = Math.max(0, Math.floor(count))
  if (n === 0) return []

  const rand = mulberry32(config.ORB_SEED)
  const orbs: Orb[] = []
  const sep = config.MIN_SEPARATION
  const rSpan = config.RADIUS_MAX - config.RADIUS_MIN

  const conflicts = (y: number, radius: number) =>
    orbs.some((o) => Math.abs(o.y - y) < sep && Math.abs(o.radius - radius) < sep)

  for (let i = 0; i < n; i++) {
    let y = 0
    let radius = 0
    let placed = false

    for (let attempt = 0; attempt < 60; attempt++) {
      y = (rand() * 2 - 1) * config.HEIGHT_SPREAD
      radius = config.RADIUS_MIN + rand() * rSpan
      if (!conflicts(y, radius)) {
        placed = true
        break
      }
    }

    if (!placed) {
      // Budget exhausted: walk the radius outward in fixed steps until it clears,
      // wrapping within the band. Guaranteed to terminate.
      const step = Math.max(1e-3, rSpan / (n + 1))
      for (let k = 0; k < n + 1 && conflicts(y, radius); k++) {
        radius += step
        if (radius > config.RADIUS_MAX) radius = config.RADIUS_MIN + (radius - config.RADIUS_MAX)
      }
    }

    orbs.push({
      y,
      radius,
      // Round-robin rather than random, so all three tilts are always in play
      // even at low orb counts. Exactly three, by owner constraint.
      tiltIndex: (i % 3) as 0 | 1 | 2,
      phase: rand() * Math.PI * 2,
      speed: config.BASE_SPEED * (1 + (rand() * 2 - 1) * config.SPEED_VAR),
    })
  }

  return orbs
}

/**
 * Position of `orb` at time `t` seconds, in the logo's local space.
 *
 * The circle is built in the XZ plane then rotated about X by the orbit's tilt.
 * That rotation is what produces a FORESHORTENED ELLIPSE on screen — a zero
 * tilt renders as a flat halo and destroys the sense of depth (spec §3.1).
 *
 * Writes into `out` and returns it, so the render loop allocates nothing.
 */
export function orbPosition(
  orb: Orb,
  config: OrbsConfig,
  t: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const theta = orb.phase + orb.speed * t
  const x = Math.cos(theta) * orb.radius
  const z = Math.sin(theta) * orb.radius
  const tilt = (config.TILTS[orb.tiltIndex] ?? 0) * DEG
  const c = Math.cos(tilt)
  const s = Math.sin(tilt)
  // rotate (x, 0, z) about the X axis, then lift to the orbit's centre height
  out.set(x, z * s + orb.y, z * c)
  return out
}
```

- [ ] **Step 4: Run the check to verify it passes**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/three/orbs/orbField.check.ts
```

Expected: all `ok`, exit 0.

- [ ] **Step 5: Wire the check in, typecheck and commit**

`package.json` — append to `verify:config` (making 7 suites):

```
 && node --import tsx src/lib/three/orbs/orbField.check.ts
```

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npm run verify:config && npx tsc --noEmit
git add src/lib/three/orbs/orbField.ts src/lib/three/orbs/orbField.check.ts package.json
git commit -m "feat(orbs): deterministic orbit field with the separation rule"
```

---

### Task 3: Orb and trail materials

**Files:**
- Create: `src/lib/three/orbs/orbMaterial.ts`

**Interfaces:**
- Consumes: `OrbsConfig`, `OrbUniforms` (Task 1); `Orb`, `orbPosition` (Task 2).
- Produces:
  - `makeOrbUniforms(config: OrbsConfig, logoHeight: number, cameraDist: number): OrbUniforms`
  - `makeOrbMaterial(u: OrbUniforms): THREE.ShaderMaterial`
  - `buildOrbPoints(count: number, material: THREE.ShaderMaterial): THREE.Points`
  - `buildTrails(orbs: Orb[], config: OrbsConfig, logoHeight: number): THREE.LineSegments | null`

- [ ] **Step 1: Implement the material module**

Create `src/lib/three/orbs/orbMaterial.ts`:

```ts
import * as THREE from 'three'
import { orbPosition, type Orb } from './orbField'
import type { OrbsConfig, OrbUniforms } from './types'

/**
 * The orbs' own shader, and the static geometry for their orbit trace lines.
 * Spec: docs/superpowers/specs/2026-08-10-orbiting-orbs-design.md §3.4, §3.5
 */

export function makeOrbUniforms(
  config: OrbsConfig,
  logoHeight: number,
  cameraDist: number,
): OrbUniforms {
  return {
    uTime: { value: 0 },
    uSize: { value: config.ORB_SIZE },
    uColor: { value: new THREE.Color(config.ORB_COLOR) },
    uGlow: { value: config.GLOW },
    uOpacity: { value: 0 },
    uPointRef: { value: Math.max(1e-3, cameraDist) },
    uCharge: { value: 0 },
  }
}

const ORB_VERT = /* glsl */ `
uniform float uSize;
uniform float uPointRef;
uniform float uCharge;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;

  // ⚠️ NOT the common 300.0 / -mv.z idiom. That assumes a far larger world
  // scale than this scene (CAMERA_Z = 2.4) and produced ~437px points at 5.9fps
  // in the ignition's first ember pass. Attenuating against the camera's real
  // distance to the logo makes uSize genuinely "pixels at that depth", and the
  // clamp caps the worst case outright.
  float atten = uPointRef / max(0.0001, -mv.z);
  gl_PointSize = clamp(uSize * atten * (1.0 + uCharge * 0.6), 1.0, 24.0);
}
`

/**
 * A bright-rimmed RING, not a filled disc — the one appearance detail the
 * reference clip did establish (observations §"What IS established", item 4).
 */
const ORB_FRAG = /* glsl */ `
uniform vec3  uColor;
uniform float uGlow;
uniform float uOpacity;
uniform float uCharge;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  // ring: peak brightness at ~0.65 of the radius, falling off both ways
  float ring = 1.0 - smoothstep(0.0, 0.42, abs(r - 0.65));
  // a soft interior wash so the ring reads as a glowing bead, not a wire circle
  float core = (1.0 - smoothstep(0.0, 1.0, r)) * 0.35;

  float a = (ring + core) * uOpacity;
  if (a <= 0.004) discard;

  vec3 c = uColor * (1.0 + uGlow * ring + uCharge * 0.5);
  gl_FragColor = vec4(c, a);
}
`

export function makeOrbMaterial(u: OrbUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: u.uTime,
      uSize: u.uSize,
      uColor: u.uColor,
      uGlow: u.uGlow,
      uOpacity: u.uOpacity,
      uPointRef: u.uPointRef,
      uCharge: u.uCharge,
    },
    vertexShader: ORB_VERT,
    fragmentShader: ORB_FRAG,
    transparent: true,
    depthWrite: false,
    // depth TEST stays on: the depth-only pass in LogoEngine is what lets orbs
    // disappear behind the mark (spec §3.3).
    depthTest: true,
    blending: THREE.NormalBlending,
  })
}

/** One Points object whose positions the controller rewrites each frame. */
export function buildOrbPoints(count: number, material: THREE.ShaderMaterial): THREE.Points {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  const pts = new THREE.Points(geo, material)
  pts.renderOrder = 4 // above the skin (2) and the ignition cage (3)
  pts.frustumCulled = false
  return pts
}

/**
 * The orbit trace lines the owner asked for on 2026-08-08.
 *
 * Static: only the orb moves along a path, so every path is built once here and
 * never updated. Returns null when trails are switched off or there is nothing
 * to draw.
 */
export function buildTrails(
  orbs: Orb[],
  config: OrbsConfig,
  logoHeight: number,
): THREE.LineSegments | null {
  if (orbs.length === 0 || config.TRAIL_OPACITY <= 0) return null

  const SEGMENTS = 96
  const verts: number[] = []
  const v = new THREE.Vector3()
  const prev = new THREE.Vector3()

  for (const orb of orbs) {
    // Walk a full revolution in orbit-angle space. Using speed=1 and stepping t
    // over 2*PI traces the path regardless of the orb's real speed.
    const unit: Orb = { ...orb, phase: 0, speed: 1 }
    for (let s = 0; s <= SEGMENTS; s++) {
      const t = (s / SEGMENTS) * Math.PI * 2
      orbPosition(unit, config, t, v)
      v.multiplyScalar(logoHeight)
      if (s > 0) {
        verts.push(prev.x, prev.y, prev.z, v.x, v.y, v.z)
      }
      prev.copy(v)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3))

  const mat = new THREE.LineBasicMaterial({
    color: config.TRAIL_COLOR,
    transparent: true,
    opacity: config.TRAIL_OPACITY,
    depthWrite: false,
  })

  const lines = new THREE.LineSegments(geo, mat)
  lines.renderOrder = 3
  lines.frustumCulled = false
  return lines
}
```

- [ ] **Step 2: Typecheck**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/three/orbs/orbMaterial.ts
git commit -m "feat(orbs): ring shader and static orbit trail geometry"
```

---

### Task 4: OrbsController

**Files:**
- Create: `src/lib/three/orbs/OrbsController.ts`
- Create: `src/lib/three/orbs/OrbsController.check.ts`
- Modify: `package.json` (`verify:config`)

**Interfaces:**
- Consumes: `OrbsConfig`, `OrbUniforms` (Task 1); `Orb`, `orbPosition` (Task 2).
- Produces: `class OrbsController` with
  - `constructor(orbs: Orb[], uniforms: OrbUniforms, config: OrbsConfig, logoHeight: number, positions: THREE.BufferAttribute)`
  - `enter(): void` — begin the entrance fade; idempotent
  - `update(dt: number, charge: number): void`
  - `setStatic(): void` — reduced motion: place orbs once, never animate
  - `setScrollFade(v: number): void` — 1 fully visible, 0 dissolved
  - `getScreenPositions(): THREE.Vector3[]` — world positions, for label projection
  - `dispose(): void`

- [ ] **Step 1: Write the failing check**

Create `src/lib/three/orbs/OrbsController.check.ts`:

```ts
/**
 * Assertions for the orb animation state machine.
 * Run: npm run verify:config
 *
 * All authoritative state lives in JS — the GPU only renders the numbers this
 * hands it — which is what makes the orbs verifiable without a browser.
 */
import * as THREE from 'three'
import { DEFAULT_ORBS } from './types'
import { makeOrbUniforms } from './orbMaterial'
import { buildOrbField } from './orbField'
import { OrbsController } from './OrbsController'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

const make = (count = 8, cfg = DEFAULT_ORBS) => {
  const orbs = buildOrbField(count, cfg)
  const u = makeOrbUniforms(cfg, 1, 2.4)
  const attr = new THREE.BufferAttribute(new Float32Array(count * 3), 3)
  const c = new OrbsController(orbs, u, cfg, 1, attr)
  return { orbs, u, attr, c }
}

// Before enter(), the field is invisible.
{
  const { c, u } = make()
  for (let i = 0; i < 10; i++) c.update(0.016, 0)
  check('hidden before enter', u.uOpacity.value === 0)
}

// enter() fades the field in over ENTRANCE_MS and stops at 1.
{
  const { c, u } = make()
  c.enter()
  for (let i = 0; i < 10; i++) c.update(0.016, 0)
  check('opacity rises during the entrance', u.uOpacity.value > 0 && u.uOpacity.value < 1)
  for (let i = 0; i < 200; i++) c.update(0.016, 0)
  check('entrance completes at full opacity', u.uOpacity.value === 1)
}

// enter() is idempotent — a second call must not restart the fade.
{
  const { c, u } = make()
  c.enter()
  for (let i = 0; i < 200; i++) c.update(0.016, 0)
  c.enter()
  c.update(0.016, 0)
  check('enter is idempotent', u.uOpacity.value === 1)
}

// Positions actually move once running, and stay put before enter().
{
  const { c, attr } = make()
  const before = Array.from(attr.array as Float32Array)
  for (let i = 0; i < 30; i++) c.update(0.016, 0)
  const idle = Array.from(attr.array as Float32Array)
  check('no motion before enter', before.every((v, i) => v === idle[i]))

  c.enter()
  for (let i = 0; i < 30; i++) c.update(0.016, 0)
  const moved = Array.from(attr.array as Float32Array)
  check('positions update once running', moved.some((v, i) => v !== idle[i]))
}

// Charge is forwarded to the shader and clamped.
{
  const { c, u } = make()
  c.enter()
  c.update(0.016, 0.5)
  check('charge forwarded', Math.abs(u.uCharge.value - 0.5) < 1e-6)
  c.update(0.016, 5)
  check('charge clamped to 1', u.uCharge.value === 1)
  c.update(0.016, -3)
  check('charge clamped to 0', u.uCharge.value === 0)
}

// Charge speeds the orbs up: the same elapsed time must travel further.
{
  const cfg = DEFAULT_ORBS
  const a = make(8, cfg)
  const b = make(8, cfg)
  a.c.enter()
  b.c.enter()
  for (let i = 0; i < 60; i++) a.c.update(0.016, 0)
  for (let i = 0; i < 60; i++) b.c.update(0.016, 1)
  const pa = Array.from(a.attr.array as Float32Array)
  const pb = Array.from(b.attr.array as Float32Array)
  check('charge changes where the orbs are', pa.some((v, i) => Math.abs(v - pb[i]) > 1e-4))
}

// setStatic(): positions are written once, then never change.
{
  const { c, attr, u } = make()
  c.setStatic()
  const placed = Array.from(attr.array as Float32Array)
  check('static mode places the orbs', placed.some((v) => v !== 0))
  check('static mode is immediately visible', u.uOpacity.value === 1)
  for (let i = 0; i < 60; i++) c.update(0.016, 1)
  const after = Array.from(attr.array as Float32Array)
  check('static mode never animates', placed.every((v, i) => v === after[i]))
}

// Scroll fade multiplies the entrance opacity rather than fighting it.
{
  const { c, u } = make()
  c.enter()
  for (let i = 0; i < 200; i++) c.update(0.016, 0)
  c.setScrollFade(0.25)
  c.update(0.016, 0)
  check('scroll fade applies', Math.abs(u.uOpacity.value - 0.25) < 1e-6)
  c.setScrollFade(0)
  c.update(0.016, 0)
  check('scroll fade can fully dissolve', u.uOpacity.value === 0)
}

// An empty field is safe.
{
  const { c } = make(0)
  c.enter()
  c.update(0.016, 0)
  c.setStatic()
  c.dispose()
  check('empty field is safe', true)
}

// dispose() stops further mutation.
{
  const { c, attr } = make()
  c.enter()
  for (let i = 0; i < 20; i++) c.update(0.016, 0)
  c.dispose()
  const frozen = Array.from(attr.array as Float32Array)
  for (let i = 0; i < 20; i++) c.update(0.016, 1)
  check('no updates after dispose', frozen.every((v, i) => v === (attr.array as Float32Array)[i]))
}

console.log(failures === 0 ? '\nAll orb controller checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/three/orbs/OrbsController.check.ts
```

Expected: FAIL — `Cannot find module './OrbsController'`.

- [ ] **Step 3: Implement the controller**

Create `src/lib/three/orbs/OrbsController.ts`:

```ts
import * as THREE from 'three'
import { orbPosition, type Orb } from './orbField'
import type { OrbsConfig, OrbUniforms } from './types'

/**
 * Drives the orbs: entrance, orbital motion, charge response, scroll fade.
 * Spec: docs/superpowers/specs/2026-08-10-orbiting-orbs-design.md §3.7, §3.8, §3.9
 *
 * All authoritative state lives here in JS; the GPU only renders the positions
 * and uniforms this writes. That is what makes the behaviour unit-testable with
 * no WebGL context.
 */
export class OrbsController {
  private t = 0
  private entered = false
  private entranceT = 0
  private staticMode = false
  private disposed = false
  private scrollFade = 1
  private scratch = new THREE.Vector3()
  private world: THREE.Vector3[]

  constructor(
    private orbs: Orb[],
    private u: OrbUniforms,
    private config: OrbsConfig,
    private logoHeight: number,
    private positions: THREE.BufferAttribute,
  ) {
    this.world = orbs.map(() => new THREE.Vector3())
  }

  /** Begin the entrance fade. Idempotent — a second call must not replay it. */
  enter() {
    if (this.entered || this.staticMode) return
    this.entered = true
    this.entranceT = 0
  }

  /**
   * Reduced motion: place every orb once at its phase-0 position and never
   * animate. Trails and labels still render, so no content is lost (spec §3.9).
   */
  setStatic() {
    if (this.disposed) return
    this.staticMode = true
    this.entered = true
    this.u.uOpacity.value = this.scrollFade
    this.u.uCharge.value = 0
    this.writePositions(0)
  }

  /** 1 fully visible, 0 fully dissolved. Multiplies into the entrance opacity. */
  setScrollFade(v: number) {
    this.scrollFade = Math.min(1, Math.max(0, v))
  }

  update(dt: number, charge: number) {
    if (this.disposed || this.staticMode || !this.entered) return

    const c = Math.min(1, Math.max(0, charge))
    this.u.uCharge.value = c

    // Charge agitates the field: the orbs speed up as the logo charges. Kept
    // deliberately subordinate to the ignition, which is already re-pulsing the
    // cage every 2.5s during a hold (spec §3.7).
    this.t += dt * (1 + c * this.config.CHARGE_RESPONSE * 2)

    this.entranceT = Math.min(this.entranceT + dt * 1000, this.config.ENTRANCE_MS)
    const entrance =
      this.config.ENTRANCE_MS <= 0 ? 1 : this.entranceT / this.config.ENTRANCE_MS
    this.u.uOpacity.value = entrance * this.scrollFade
    this.u.uTime.value = this.t

    this.writePositions(this.t, c)
  }

  /**
   * Writes orb positions into the shared buffer. Allocates nothing: the render
   * loop runs this every frame, and getCharge() is pull-based for the same
   * reason.
   */
  private writePositions(t: number, charge = 0) {
    const arr = this.positions.array as Float32Array
    // Charge draws the orbs slightly inward, so the field tightens as it winds up.
    const pull = 1 - charge * this.config.CHARGE_RESPONSE * 0.25
    for (let i = 0; i < this.orbs.length; i++) {
      orbPosition(this.orbs[i], this.config, t, this.scratch)
      this.scratch.multiplyScalar(this.logoHeight * pull)
      arr[i * 3] = this.scratch.x
      arr[i * 3 + 1] = this.scratch.y
      arr[i * 3 + 2] = this.scratch.z
      this.world[i].copy(this.scratch)
    }
    this.positions.needsUpdate = true
  }

  /** Current world-space positions, for projecting the DOM word labels. */
  getScreenPositions(): THREE.Vector3[] {
    return this.world
  }

  dispose() {
    this.disposed = true
  }
}
```

- [ ] **Step 4: Run the check to verify it passes**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/three/orbs/OrbsController.check.ts
```

Expected: all `ok`, exit 0.

- [ ] **Step 5: Wire the check in, typecheck and commit**

`package.json` — append to `verify:config` (making 8 suites):

```
 && node --import tsx src/lib/three/orbs/OrbsController.check.ts
```

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npm run verify:config && npx tsc --noEmit
git add src/lib/three/orbs/OrbsController.ts src/lib/three/orbs/OrbsController.check.ts package.json
git commit -m "feat(orbs): controller with entrance, charge response and static mode"
```

---

### Task 5: Payload global fields and seed

**Files:**
- Modify: `src/globals/HeroEffects.ts` (append after the last ignition group)
- Modify: `src/seed/index.ts` (the `hero-effects` `updateGlobal` call, and the hero block's `floatingWords`)

**Interfaces:**
- Consumes: the field names in `HeroEffectsOrbsInput` (Task 1) — the Payload field names must match exactly (`orbsEnabled`, `orbsField`, `orbsColor`).
- Produces: a `hero-effects` global that `resolveOrbs()` can read.

- [ ] **Step 1: Add the fields**

In `src/globals/HeroEffects.ts`, append to the `fields` array, after the last ignition group. `hexColour` is already defined at the top of the file — reuse it, do not redefine.

```ts
    {
      name: 'orbsEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Shows the glowing orbs orbiting the hero logo. One orb appears per word in the Orbiting words list on the home page hero.',
      },
    },
    {
      name: 'orbsField',
      type: 'group',
      label: 'Orbs — field',
      admin: {
        description:
          'Size, spacing and speed of the orbiting orbs. Distances are fractions of the logo height, so they scale with the logo.',
      },
      fields: [
        {
          name: 'orbSize',
          type: 'number',
          defaultValue: 7,
          min: 2,
          max: 24,
          admin: { description: 'Orb diameter in pixels. Kept small so the hero does not read as busy.' },
        },
        { name: 'glow', type: 'number', defaultValue: 0.8, min: 0, max: 3 },
        { name: 'radiusMin', type: 'number', defaultValue: 0.75, min: 0.1, max: 3 },
        {
          name: 'radiusMax',
          type: 'number',
          defaultValue: 1.5,
          min: 0.1,
          max: 4,
          admin: { description: 'Must be at least radiusMin; smaller values are raised automatically.' },
        },
        {
          name: 'heightSpread',
          type: 'number',
          defaultValue: 0.55,
          min: 0,
          max: 2,
          admin: { description: 'How far above and below the logo the orbits sit' },
        },
        {
          name: 'minSeparation',
          type: 'number',
          defaultValue: 0.12,
          min: 0,
          max: 0.9,
          admin: {
            description:
              'Two orbs may not be this close in BOTH height and radius, so no two ever trace the same ring.',
          },
        },
        { name: 'baseSpeed', type: 'number', defaultValue: 0.28, min: 0, max: 3 },
        {
          name: 'speedVar',
          type: 'number',
          defaultValue: 0.35,
          min: 0,
          max: 1,
          admin: { description: 'How much orb speeds differ from one another' },
        },
        {
          name: 'chargeResponse',
          type: 'number',
          defaultValue: 0.5,
          min: 0,
          max: 2,
          admin: { description: 'How strongly the orbs react while the logo is held' },
        },
        { name: 'entranceMs', type: 'number', defaultValue: 1200, min: 0, max: 5000 },
        {
          name: 'orbSeed',
          type: 'number',
          defaultValue: 20260810,
          min: 0,
          max: 99999999,
          admin: { description: 'Changes the arrangement. Same number = same layout every load.' },
        },
        {
          name: 'tiltA',
          type: 'number',
          defaultValue: 14,
          min: 0,
          max: 90,
          admin: { description: 'First orbit tilt, degrees. There are exactly three.' },
        },
        { name: 'tiltB', type: 'number', defaultValue: 32, min: 0, max: 90 },
        { name: 'tiltC', type: 'number', defaultValue: 58, min: 0, max: 90 },
      ],
    },
    {
      name: 'orbsColor',
      type: 'group',
      label: 'Orbs — colour',
      admin: { description: 'Orb colour, and the faint lines tracing each orbit' },
      fields: [
        { name: 'orbColor', type: 'text', defaultValue: '#8E1114', validate: hexColour },
        {
          name: 'trailColor',
          type: 'text',
          defaultValue: '#2B2A27',
          validate: hexColour,
          admin: { description: 'The orbit trace lines — graphite, so they read as drawn' },
        },
        {
          name: 'trailOpacity',
          type: 'number',
          defaultValue: 0.18,
          min: 0,
          max: 1,
          admin: { description: 'Set to 0 to hide the orbit lines and keep only the orbs' },
        },
      ],
    },
```

- [ ] **Step 2: Extend the seed's hero-effects values**

In `src/seed/index.ts`, inside the `hero-effects` `updateGlobal` `data` object, after the last `ignition*` group, add:

```ts
      orbsEnabled: true,
      orbsField: {
        orbSize: 7,
        glow: 0.8,
        radiusMin: 0.75,
        radiusMax: 1.5,
        heightSpread: 0.55,
        minSeparation: 0.12,
        baseSpeed: 0.28,
        speedVar: 0.35,
        chargeResponse: 0.5,
        entranceMs: 1200,
        orbSeed: 20260810,
        tiltA: 14,
        tiltB: 32,
        tiltC: 58,
      },
      orbsColor: { orbColor: '#8E1114', trailColor: '#2B2A27', trailOpacity: 0.18 },
```

- [ ] **Step 3: Trim the word lists to 8 per locale**

Owner decision 2026-08-10: start with 8 orbs, adjust in the CMS afterwards. Orb count follows the word list, so the list is what sets it.

In `src/seed/index.ts`, replace the EN hero `floatingWords` array (currently 12 entries) with:

```ts
          floatingWords: [
            'sketch', 'craft', 'design', 'identity', 'motion', 'detail',
            'story', 'precision',
          ].map((word) => ({ word })),
```

and the ID list in `idValues.hero` with:

```ts
      floatingWords: [
        'sketsa', 'kriya', 'desain', 'identitas', 'gerak', 'detail',
        'cerita', 'presisi',
      ].map((word) => ({ word })),
```

- [ ] **Step 4: Relabel the existing hero-block fields**

The CMS field NAMES stay (`floatingWords`, `constellationEnabled`) — renaming them means a Payload schema change, and this project hit a blocked interactive schema-push prompt on 2026-08-10. Only the labels change.

In `src/blocks/index.ts`, on the `constellationEnabled` field add:

```ts
      label: 'Show orbiting orbs',
```

and on the `floatingWords` field add:

```ts
      label: 'Orbiting words',
      admin: { description: 'One orb orbits the logo per word. Its word appears on hover.' },
```

- [ ] **Step 5: Reseed and regenerate types**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npm run seed && rm -rf .next/cache && npm run generate:types
```

`rm -rf .next/cache` is **required, not optional**. `getHeroEffects` uses `unstable_cache`, which persists to disk and survives dev-server restarts; the seed script's `revalidateTag` is a documented no-op outside a request context. Skipping this makes the new values invisible.

⚠️ **If the dev server hangs after this**, it is Drizzle's schema push waiting on an interactive "DATA LOSS" prompt that a background server cannot answer. Diagnose with `SELECT name FROM sqlite_master WHERE name LIKE '__new_%'`. Any leftover `__new_*` table is safe to drop **only after** diffing it column-by-column against its real counterpart and taking a DB backup. Full precedent: HANDOFF 2026-08-10.

- [ ] **Step 6: Verify a partial save does not wipe siblings**

```bash
curl -s http://localhost:3000/api/globals/hero-effects | python -c "import sys,json;d=json.load(sys.stdin);print('orbsField:', d.get('orbsField'))"
```

Expected: the group is present with the seeded values, and the `ignition*` and separation groups are all still intact.

- [ ] **Step 7: Commit**

```bash
git add src/globals/HeroEffects.ts src/seed/index.ts src/blocks/index.ts src/payload-types.ts
git commit -m "feat(orbs): hero-effects global fields, seed, and 8-word orb list"
```

---

### Task 6: Wire the orbs into LogoEngine, with the depth-only occlusion pass

**Files:**
- Modify: `src/lib/three/LogoEngine.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces, on `LogoEngine`:
  - `startOrbs(): void` — begin the entrance; records intent if `load()` has not resolved
  - `setOrbScrollFade(v: number): void`
  - `getOrbScreenPositions(): THREE.Vector3[]`

**⚠️ The single most important detail in this task.** Occlusion does **not** come free from being in the 3D scene. Every logo material sets `depthWrite = false` — the skin (`LogoEngine.ts:162`), the body surfaces (`:292`) and the body edges (`:303`) — so the depth buffer is empty and the orbs would paint straight over the mark. A colour-less depth-only clone of the logo, rendered before the orbs, is what makes them disappear behind it.

- [ ] **Step 1: Add imports and fields**

At the top of `src/lib/three/LogoEngine.ts`, alongside the existing ignition imports:

```ts
import { buildOrbField, type Orb } from './orbs/orbField'
import { buildOrbPoints, buildTrails, makeOrbMaterial, makeOrbUniforms } from './orbs/orbMaterial'
import { OrbsController } from './orbs/OrbsController'
import { DEFAULT_ORBS, type OrbsConfig, type OrbUniforms } from './orbs/types'
```

In the class field block, after the ignition fields:

```ts
  // orbiting orbs
  private orbs: OrbsController | null = null
  private orbUniforms: OrbUniforms | null = null
  private orbPoints: THREE.Points | null = null
  private orbTrails: THREE.LineSegments | null = null
  private orbDepthMask: THREE.Group | null = null
  private wantOrbs = false
  private orbScrollFade = 1
```

Extend the constructor signature to accept the config, defaulting so existing callers still compile:

```ts
  constructor(
    private canvas: HTMLCanvasElement,
    private config: SeparationConfig = DEFAULT_SEPARATION,
    private ignitionConfig: IgnitionConfig = DEFAULT_IGNITION,
    private orbsConfig: OrbsConfig = DEFAULT_ORBS,
    private orbWordCount = 0,
  ) {
```

- [ ] **Step 2: Build the depth-only occlusion mask**

Add this private method to `LogoEngine`:

```ts
  /**
   * A colour-less clone of the logo that writes ONLY depth.
   *
   * Every logo material sets depthWrite:false (skin, body surfaces, body edges),
   * so without this the depth buffer is empty and the orbs paint over the mark
   * no matter where they actually are. This restores real occlusion for one
   * extra draw of existing geometry.
   *
   * Accepted approximation: the skin is 60% opaque, so strictly the orbs behind
   * it should show through faintly. They are hidden completely instead, which
   * reads more clearly than a sorted-transparency system would cost (spec §3.3).
   */
  private buildOrbDepthMask(group: THREE.Group): THREE.Group {
    const mask = new THREE.Group()
    const mat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
    })
    group.traverse((o) => {
      const src = o as THREE.Mesh
      if (!src.isMesh || !src.geometry) return
      const m = new THREE.Mesh(src.geometry, mat)
      m.position.copy(src.position)
      m.quaternion.copy(src.quaternion)
      m.scale.copy(src.scale)
      // before the trails (3) and the orbs (4), after the skin (2)
      m.renderOrder = 2.5
      mask.add(m)
    })
    return mask
  }
```

- [ ] **Step 3: Build the orb system inside `load()`**

In `load()`, immediately **after** the ignition block closes and **before** `group.add(body)`, add:

```ts
      // Orbs. Built from the CLEAN skin group, before the inner body is parented,
      // so the depth mask traces the mark's silhouette and not a doubled copy.
      if (this.orbsConfig.ENABLED && this.orbWordCount > 0) {
        const orbField: Orb[] = buildOrbField(this.orbWordCount, this.orbsConfig)
        const logoHeight = heightFrac * visH

        this.orbDepthMask = this.buildOrbDepthMask(group)
        group.add(this.orbDepthMask)

        const ou = makeOrbUniforms(this.orbsConfig, logoHeight, CALIB.CAMERA_Z)
        this.orbUniforms = ou
        const orbMat = makeOrbMaterial(ou)
        this.orbPoints = buildOrbPoints(orbField.length, orbMat)
        group.add(this.orbPoints)

        this.orbTrails = buildTrails(orbField, this.orbsConfig, logoHeight)
        if (this.orbTrails) group.add(this.orbTrails)

        this.orbs = new OrbsController(
          orbField,
          ou,
          this.orbsConfig,
          logoHeight,
          this.orbPoints.geometry.getAttribute('position') as THREE.BufferAttribute,
        )
        this.orbs.setScrollFade(this.orbScrollFade)

        // Reduced motion: place them once and never animate (spec §3.9).
        if (!this.interactive) this.orbs.setStatic()
        // Honour an entrance that arrived before load() resolved.
        else if (this.wantOrbs) this.orbs.enter()
      }
```

⚠️ Note this block sits **outside** the `if (this.interactive)` guard, because reduced motion must still render static orbs. Place it after that block closes.

- [ ] **Step 4: Add the public methods**

```ts
  /**
   * Begin the orbs' entrance.
   *
   * Records the intent even if the mesh has not finished loading — load() calls
   * enter() when it builds the controller. Without that, a slow load finishing
   * after the caller starts would leave the orbs permanently invisible with no
   * console error. Same shape as startIgnition() and the setShatterArmed bug.
   */
  startOrbs() {
    this.wantOrbs = true
    this.orbs?.enter()
  }

  setOrbScrollFade(v: number) {
    this.orbScrollFade = v
    this.orbs?.setScrollFade(v)
  }

  getOrbScreenPositions(): THREE.Vector3[] {
    return this.orbs?.getScreenPositions() ?? []
  }
```

- [ ] **Step 5: Drive the orbs from `tick()`**

In `tick()`, after the ignition update, add:

```ts
    // getCharge() is pull-based precisely to avoid a per-frame allocation; the
    // orb update honours that and allocates nothing either.
    this.orbs?.update(dt, this.shatter?.getCharge() ?? 0)
```

- [ ] **Step 6: Free the orb resources in `dispose()`**

In `dispose()`, alongside the ignition teardown:

```ts
    this.orbs?.dispose()
    this.orbs = null
    this.orbPoints?.geometry.dispose()
    ;(this.orbPoints?.material as THREE.Material | undefined)?.dispose()
    this.orbPoints = null
    this.orbTrails?.geometry.dispose()
    ;(this.orbTrails?.material as THREE.Material | undefined)?.dispose()
    this.orbTrails = null
    this.orbDepthMask?.traverse((o) => {
      const m = o as THREE.Mesh
      // geometry is SHARED with the real logo meshes — do not dispose it here,
      // the existing scene traversal already frees it. Only the mask material
      // is ours.
      if (m.isMesh) (m.material as THREE.Material).dispose()
    })
    this.orbDepthMask = null
```

- [ ] **Step 7: Typecheck and commit**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && npm run verify:config
git add src/lib/three/LogoEngine.ts
git commit -m "feat(orbs): drive orbs from LogoEngine with a depth-only occlusion pass"
```

---

### Task 7: Replace ConstellationField with the orb layer

**Files:**
- Create: `src/components/hero/OrbLabels.tsx`
- Delete: `src/components/hero/ConstellationField.tsx`
- Modify: `src/components/three/LogoCanvas.tsx`
- Modify: `src/components/hero/LogoStage.tsx`
- Modify: `src/components/blocks/HeroBlock.tsx`
- Modify: `src/components/blocks/RenderBlocks.tsx`

**Interfaces:**
- Consumes: `LogoEngine.startOrbs/setOrbScrollFade/getOrbScreenPositions` (Task 6); `OrbsConfig` (Task 1).
- Produces: `<OrbLabels words={string[]} engineRef={...} />`, and an `orbs` prop threaded `RenderBlocks → HeroBlock → LogoStage → LogoCanvas → LogoEngine`.

- [ ] **Step 1: Thread the config as a REQUIRED prop**

Make `orbs: OrbsConfig` a **required** prop on `HeroBlock` and `LogoStage`, exactly as `separation` and `ignition` are. Required, not optional: a dropped prop must fail loudly at compile time rather than silently reverting to `DEFAULT_ORBS`. This was an explicit finding of the 2026-08-09 review.

In `src/components/blocks/RenderBlocks.tsx`, alongside the existing `separation`/`ignition` resolution, add:

```tsx
                  orbs={resolveOrbs(heroEffects)}
```

with the import:

```ts
import { resolveOrbs } from '../../lib/three/orbs/resolveOrbs'
```

- [ ] **Step 2: Pass word count and config through LogoCanvas**

In `src/components/three/LogoCanvas.tsx`, add `orbs` and `orbWordCount` props and pass them to the engine constructor:

```tsx
      engine = new LogoEngine(canvas, config, ignition, orbs, orbWordCount)
```

and start the orbs on the ignition cue, replacing nothing else:

```tsx
    const offIgnition = engine.onIgnition((e) => {
      if (e === 'cue') {
        cueRef.current?.()
        engine.startOrbs()
      } else if (e === 'done') doneRef.current?.()
    })
```

The orbs enter at `cue` because that is where the charge front finishes and the ignition's energy disperses into them — `ignition/types.ts` already anticipates this in its `CUE_FRAC` comment.

- [ ] **Step 3: Create the label layer**

Create `src/components/hero/OrbLabels.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import type * as THREE from 'three'

/**
 * The orbs' words, as real DOM text.
 *
 * DOM rather than canvas so the words stay readable by screen readers and
 * search engines — they are the hero's only body content besides the headline.
 * Each label is positioned every frame by projecting its orb to screen space,
 * and stays at opacity 0 until the cursor is near it.
 *
 * Hover resolves to the NEAREST orb within a threshold rather than a raycast:
 * targets this small are unforgiving to hit exactly, and proximity matching is
 * both cheaper and kinder. Only one label shows at a time.
 */
const HOVER_PX = 70

export function OrbLabels({
  words,
  getPositions,
  project,
}: {
  words: string[]
  getPositions: () => THREE.Vector3[]
  project: (v: THREE.Vector3) => { x: number; y: number; visible: boolean } | null
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const pointer = useRef({ x: -9999, y: -9999 })

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = e.clientX
      pointer.current.y = e.clientY
    }
    window.addEventListener('pointermove', onMove)

    let raf = 0
    const tick = () => {
      const positions = getPositions()
      let nearest = -1
      let nearestD = HOVER_PX

      const screen: ({ x: number; y: number; visible: boolean } | null)[] = []
      for (let i = 0; i < positions.length; i++) {
        const p = project(positions[i])
        screen.push(p)
        if (!p || !p.visible) continue
        const d = Math.hypot(p.x - pointer.current.x, p.y - pointer.current.y)
        if (d < nearestD) {
          nearestD = d
          nearest = i
        }
      }

      for (let i = 0; i < refs.current.length; i++) {
        const el = refs.current[i]
        const p = screen[i]
        if (!el) continue
        if (!p || !p.visible) {
          el.style.opacity = '0'
          continue
        }
        el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`
        el.style.opacity = i === nearest ? '0.9' : '0'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [getPositions, project, words.length])

  if (words.length === 0) return null

  return (
    <div
      ref={rootRef}
      aria-hidden={false}
      style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
    >
      {words.map((text, i) => (
        <div
          key={`${i}-${text}`}
          ref={(el) => {
            refs.current[i] = el
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            opacity: 0,
            fontStyle: 'italic',
            fontSize: 'clamp(0.75rem, 1.1vw, 1rem)',
            color: 'var(--muted)',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            pointerEvents: 'none',
            transition: 'opacity 0.25s ease',
            willChange: 'transform, opacity',
          }}
        >
          {text}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Swap the component in HeroBlock**

In `src/components/blocks/HeroBlock.tsx`, delete the `ConstellationField` import and its usage at line 141, and render `OrbLabels` in its place, wired to the engine through `LogoStage`. Keep the `constellationEnabled` gate — it now switches the orbs.

- [ ] **Step 5: Delete the old component**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && rm src/components/hero/ConstellationField.tsx
```

Then grep to prove nothing still imports it:

```bash
grep -rn "ConstellationField" src/ || echo "no references remain"
```

Expected: `no references remain`.

- [ ] **Step 6: Typecheck, verify and commit**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && npm run verify:config
git add -A
git commit -m "feat(orbs): replace ConstellationField with the orbiting orb layer"
```

---

### Task 8: Scroll dissolve and reduced motion

**Files:**
- Modify: `src/components/hero/LogoStage.tsx` (or `HeroBlock.tsx`, wherever the scroll listener lives)

- [ ] **Step 1: Dissolve the orbs over the first 60vh**

Mirroring what `ConstellationField` did, so the hero behaves consistently. Add a passive scroll listener that computes `1 - clamp(scrollY / (0.6 * innerHeight), 0, 1)` and feeds it to `engine.setOrbScrollFade(...)`. Use `{ passive: true }` and cancel on unmount.

- [ ] **Step 2: Confirm reduced motion needs no extra wiring**

`LogoCanvas` already reads `prefers-reduced-motion` and calls `engine.setInteractive(!reduced)` before `load()`; Task 6 Step 3 calls `orbs.setStatic()` on that same flag. Verify by reading the code that no second code path is needed, rather than adding one.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(orbs): scroll dissolve over the first 60vh"
```

---

### Task 9: Browser verification

**Files:**
- Create: `docs/superpowers/verification/orbs-verify.mjs`

Run from a scratchpad that has `puppeteer-core` and `ffmpeg-static` installed — never add them to the app. See `docs/superpowers/verification/README.md`.

> ⚠️ **The in-app browser pane CANNOT verify this.** It reports the tab hidden and throttles `requestAnimationFrame` to ~1 Hz, which stalls the engine's own clock — measured at 13 frames in 13 real seconds. Always headless Chrome. Tile frames into a contact sheet before judging them; single screenshots have hidden real defects on this project twice.

- [ ] **Step 1: Occlusion — the claim most likely to be wrong**

The depth-only pass is invisible to every unit test. Capture the settled hero over one full orbit period and assert that orb pixels **disappear** while passing behind the mark: sample the orb colour's presence inside the logo's silhouette versus outside it. If orbs remain visible over the mark at all times, the depth pass is not working — check that the mask's `renderOrder` really is below the orbs' and that `colorWrite: false` did not also disable depth writes.

- [ ] **Step 2: Hover reveals exactly one word**

Move the pointer onto an orb's projected position and assert exactly one label has opacity > 0, and that its text is one of the CMS words.

- [ ] **Step 3: Hold agitates the orbs**

Hold the pointer on the canvas and confirm the orbs measurably speed up versus an unheld control window over the same duration — the same in-run control pattern used by `t9-draco-stall.mjs`, which exists precisely because idle motion otherwise swamps the signal.

- [ ] **Step 4: Reduced motion draws orbs but never animates them**

`page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])` **before** navigation, so the first `matchMedia` read sees it. Assert orbs are present and frame-to-frame delta stays at the noise floor.

- [ ] **Step 5: Performance floor**

Measure real rAF rate via `performance.now()` deltas, not screenshot timing. Under swiftshader treat the number as a floor. If it is poor, suspect `gl_PointSize` first — that exact trap cost 5.9 fps in the ignition.

- [ ] **Step 6: Commit**

```bash
git commit -m "test(orbs): browser verification of occlusion, hover, hold and reduced motion" --allow-empty
```

---

### Task 10: Whole-branch review and merge

- [ ] **Step 1: Whole-branch review**

Use `superpowers:requesting-code-review` against `main..feat/hero-orbs`.

**Budget for it to find something real.** On sub-project 1 the final whole-branch review caught a production-reachable bug that all six task-level reviews had missed; on sub-project 2 it caught a second, of the same shape — a signal firing unconditionally from one component, consumed by another that assumed it only fired when a feature was enabled. Hunt specifically for: signals arriving before `load()` resolves, config flags that gate a symptom rather than the cause, and anything that silently no-ops.

- [ ] **Step 2: Fix findings, re-run gates**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && npm run verify:config
```

- [ ] **Step 3: Merge**

```bash
git checkout main && git merge --no-ff feat/hero-orbs
npx tsc --noEmit && npm run verify:config
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/en
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/id
git push origin main && git push origin --delete feat/hero-orbs
```

- [ ] **Step 4: Update the handoff**

Rewrite `_HANDOFF/HANDOFF.md` §0 into a dated, completed entry — final tuned values, anything the review caught, and the hard-won facts worth preserving. Note `_HANDOFF/` is **outside** the git repo, so it needs no commit.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §2 owner decisions (count follows words, 8 to start, no mobile cap) | 5 (seed + fields), 6 (`orbWordCount`) |
| §3 module layout | 1, 2, 3, 4 |
| §3.1 orbit geometry, 3 tilts | 2 (`orbPosition`, round-robin `tiltIndex`) |
| §3.2 separation rule + units | 2 (`buildOrbField`, the headline check) |
| §3.3 occlusion / depth-only pass | 6 (steps 2, 3) |
| §3.4 ring appearance, `gl_PointSize` trap | 3 |
| §3.5 trails | 3 (`buildTrails`) |
| §3.6 DOM word labels, proximity hover | 7 (`OrbLabels`) |
| §3.7 charge coupling | 4 (`update`), 6 (step 5) |
| §3.8 entrance on `cue` | 6 (`startOrbs`), 7 (step 2) |
| §3.9 degradation | 4 (`setStatic`, `setScrollFade`), 8 |
| §4 replacing ConstellationField, field names kept | 5 (step 4), 7 (steps 4, 5) |
| §5 configuration | 1, 5 |
| §6 verification | 1, 2, 4 (checks), 9 (browser) |

**Placeholder scan:** Task 7 Step 4 and Task 8 Step 1 describe edits to existing files without reproducing the full surrounding component — deliberate, because the exact surrounding code is short, local, and the codebase-pattern instruction says to follow the existing `separation`/`ignition` threading rather than restate it. Every step that creates a new file carries its complete contents. No "TBD", no "add error handling", no "similar to Task N".

**Type consistency:** `OrbsConfig` field names are identical across `types.ts`, `resolveOrbs.ts`, the Payload groups and the seed. `Orb` is `{ y, radius, tiltIndex, phase, speed }` everywhere. `buildOrbField(count, config)` and `orbPosition(orb, config, t, out)` are called with exactly those signatures in Tasks 3, 4 and 6. `OrbUniforms` keys match between `types.ts`, `orbMaterial.ts` and `OrbsController.ts`. `TILTS` is a 3-tuple in every reference.

**Known risk carried into execution.** Task 6's depth mask shares geometry with the real logo meshes. `dispose()` must therefore free only the mask's *material*, never its geometry — disposing shared geometry would blank the logo on the next remount. The plan states this inline at Task 6 Step 6, and it is the first thing to check if the logo disappears after navigating away and back.
