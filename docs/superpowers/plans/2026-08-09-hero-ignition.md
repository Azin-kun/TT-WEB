# Hero Electrical Wireframe Ignition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bridge the sketch video's 3D-sketch end frame and the live rotating logo with a 2 s electrical wireframe ignition in TT red — a dense scribble cage whose charge front leaves finished logo in its wake.

**Architecture:** A new `src/lib/three/ignition/` module mirroring the proven `shatter/` structure: frozen defaults + CMS resolver + controller + material, driven by `LogoEngine`. The cage is a `WireframeGeometry` deterministically subsampled to a density knob. The charge front is distance-from-seed computed in the shader — **no per-vertex attributes**. One narrow front-aware alpha patch on the skin materials produces the wake.

**Tech Stack:** Next.js 15 App Router · TypeScript · three.js (lazy, `dynamic(ssr:false)`) · Payload CMS 3 · `tsx` check scripts (no test runner in this repo) · `puppeteer-core` for browser verification.

**Spec:** [2026-08-09-hero-ignition-design.md](../specs/2026-08-09-hero-ignition-design.md)
**Observations:** [2026-08-09-hero-effects-reference-observations.md](../specs/2026-08-09-hero-effects-reference-observations.md)

## Global Constraints

- **Branch:** `feat/hero-ignition` (already created, holds the spec commit `3e9d953`). Do not commit to `main`.
- **Working directory:** `D:\TAMPA TARUNO\WEBSITE\_WEB_PRODUCT`. The `C:\Users\user\OneDrive\...` copy is stale — never touch it.
- **three.js stays lazy.** Nothing under `src/lib/three/` may be imported from a server component or from anything outside the `dynamic(ssr:false)` boundary.
- **`done` must fire exactly once, unconditionally** — `armed` and `onLive` both hang off it.
- **No per-vertex attributes.** The charge front is `distance(position, uSeed)` in the shader.
- **Config is not localized.** Numbers and hex strings, identical EN/ID.
- **This repo has no test runner.** Tests are plain `tsx` scripts that `process.exit(1)` on failure, following the `resolveSeparation.check.ts` idiom. All are wired into `npm run verify:config`.
- **Every `.replace()` on a shader string must be asserted to have applied.** A missed anchor silently no-ops; this codebase has already shipped one silent-drop bug of exactly that shape.
- **Commit after every task.**

---

### Task 1: Ignition config types, CMS resolver, and checks

**Files:**
- Create: `src/lib/three/ignition/types.ts`
- Create: `src/lib/three/ignition/resolveIgnition.ts`
- Create: `src/lib/three/ignition/resolveIgnition.check.ts`
- Modify: `package.json` (the `verify:config` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `IgnitionConfig` — the 21-field config object
  - `DEFAULT_IGNITION: Readonly<IgnitionConfig>` — frozen
  - `IgnitionEvent = 'seed' | 'cue' | 'done'`
  - `IgnitionUniforms` — `{ uFront, uSeed, uSoftness, uCoreRadius, uCoreStrength, uCoreLive, uGlobalFade, uWakeLag, uWakeActive, uCold, uWarm, uHot, uCrest, uCageOpacity }`
  - `resolveIgnition(cms: HeroEffectsIgnitionInput | null | undefined): IgnitionConfig`
  - `toIgnitionPayload(c: IgnitionConfig): HeroEffectsIgnitionInput`

- [ ] **Step 1: Write the failing check script**

Create `src/lib/three/ignition/resolveIgnition.check.ts`:

```ts
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

console.log(failures === 0 ? '\nAll ignition config checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/three/ignition/resolveIgnition.check.ts
```

Expected: FAIL — `Cannot find module './types'`.

- [ ] **Step 3: Create the types**

Create `src/lib/three/ignition/types.ts`:

```ts
import type * as THREE from 'three'

/**
 * Default tuning for the electrical wireframe ignition.
 * Spec: docs/superpowers/specs/2026-08-09-hero-ignition-design.md §3, §4.6
 *
 * Frozen. Live values come from the `hero-effects` Payload global and are
 * merged over these by resolveIgnition(); the dev bench at
 * /[locale]/dev/ignition keeps its own mutable copy for tuning and can write
 * approved values back to that global.
 *
 * Phase boundaries are FRACTIONS of IGNITION_MS, never absolute milliseconds:
 * one duration retimes the whole sequence, and the phases cannot be driven
 * into an inconsistent state the way three independent ms values could.
 */
export type IgnitionConfig = {
  ENABLED: boolean
  IGNITION_MS: number
  SEED_END: number
  FRONT_END: number
  CUE_FRAC: number
  SEED_OFFSET_X: number
  SEED_OFFSET_Y: number
  SEED_OFFSET_Z: number
  FRONT_SOFTNESS: number
  WAKE_LAG: number
  CAGE_DENSITY: number
  CAGE_DENSITY_MOBILE: number
  CAGE_OPACITY: number
  CAGE_SEED: number
  COLD_COLOR: number
  WARM_COLOR: number
  HOT_COLOR: number
  CREST_COLOR: number
  CORE_STRENGTH: number
  CORE_RADIUS: number
  DARK_MASS_OPACITY: number
  GLOW_DECAY: number
}

export const DEFAULT_IGNITION: Readonly<IgnitionConfig> = Object.freeze({
  ENABLED: true,
  /** total duration of the bridge, ms. The single pacing control. */
  IGNITION_MS: 2000,
  /** fraction at which the seed bloom ends and the front starts expanding */
  SEED_END: 0.12,
  /** fraction at which the charge front finishes crossing the geometry */
  FRONT_END: 0.78,
  /**
   * Fraction at which `cue` fires. Sub-project 3's orbs enter here, and
   * ConstellationField's entrance (onLive) moves here too — it lands just as
   * the front finishes, so the energy disperses INTO the orbiting bodies.
   */
  CUE_FRAC: 0.8,
  /** seed position offset from the logo's centre, as fractions of logo height */
  SEED_OFFSET_X: 0,
  SEED_OFFSET_Y: 0,
  SEED_OFFSET_Z: 0,
  /** crest half-width, as a fraction of logo height */
  FRONT_SOFTNESS: 0.18,
  /** how far behind the crest the skin materializes, as a fraction of logo height */
  WAKE_LAG: 0.1,
  /**
   * Fraction of wireframe segments kept. A PARTIAL wireframe reads as scribble
   * where a complete one reads as CAD — this is a look control as much as a
   * budget control.
   */
  CAGE_DENSITY: 0.55,
  /** same, below 640px */
  CAGE_DENSITY_MOBILE: 0.3,
  CAGE_OPACITY: 0.9,
  /** mulberry32 seed, so the subsample is identical on every load */
  CAGE_SEED: 1337,
  /** cold cage — identical to the ghost wireframe ink and to the video's pencil */
  COLD_COLOR: 0x2b2a27,
  /** red-pencil token */
  WARM_COLOR: 0x8e1114,
  HOT_COLOR: 0xc8341a,
  /** already the SHINE_BRIGHT token. Kept small and brief. */
  CREST_COLOR: 0xfff8e0,
  CORE_STRENGTH: 1,
  /** hot-core radius as a fraction of logo height */
  CORE_RADIUS: 0.22,
  /**
   * Inner-body surface opacity DURING IGNITION ONLY. A 1px red line on
   * #F6F1E7 paper reads as a line, not as glow — glow needs contrast the paper
   * does not provide. OPTIMIND's struts read against soft dark mesh behind
   * them; this is that dark mass. See spec §3.3.
   */
  DARK_MASS_OPACITY: 0.12,
  /** exponential decay rate for residual glow during settle; higher = faster */
  GLOW_DECAY: 2.4,
})

export type IgnitionEvent = 'seed' | 'cue' | 'done'

export type IgnitionUniforms = {
  /** current front radius, in logo-local units */
  uFront: { value: number }
  uSeed: { value: THREE.Vector3 }
  uSoftness: { value: number }
  uCoreRadius: { value: number }
  uCoreStrength: { value: number }
  /** 1 while the core is alive, decaying to 0 through settle */
  uCoreLive: { value: number }
  /** whole-cage fade, 1 through seed+front, 0 by the end of settle */
  uGlobalFade: { value: number }
  uWakeLag: { value: number }
  /** 1 while ignition owns the skin's alpha, 0 once it is handed back */
  uWakeActive: { value: number }
  uCold: { value: THREE.Color }
  uWarm: { value: THREE.Color }
  uHot: { value: THREE.Color }
  uCrest: { value: THREE.Color }
  uCageOpacity: { value: number }
}
```

- [ ] **Step 4: Create the resolver**

Create `src/lib/three/ignition/resolveIgnition.ts`:

```ts
import { DEFAULT_IGNITION, type IgnitionConfig } from './types'

/**
 * Ignition's slice of the `hero-effects` global. Written by hand rather than
 * imported from payload-types so this module compiles before the fields exist
 * and does not break if generated types are stale. Every field is optional and
 * nullable because Payload returns nulls for never-saved fields.
 */
export type HeroEffectsIgnitionInput = {
  ignitionEnabled?: boolean | null
  ignitionTiming?: {
    ignitionMs?: number | null
    seedEnd?: number | null
    frontEnd?: number | null
    cueFrac?: number | null
  } | null
  ignitionShape?: {
    seedOffsetX?: number | null
    seedOffsetY?: number | null
    seedOffsetZ?: number | null
    frontSoftness?: number | null
    wakeLag?: number | null
    coreRadius?: number | null
    coreStrength?: number | null
  } | null
  ignitionCage?: {
    cageDensity?: number | null
    cageDensityMobile?: number | null
    cageOpacity?: number | null
    cageSeed?: number | null
  } | null
  ignitionColor?: {
    coldColor?: string | null
    warmColor?: string | null
    hotColor?: string | null
    crestColor?: string | null
    darkMassOpacity?: number | null
    glowDecay?: number | null
  } | null
}

const HEX = /^#[0-9a-fA-F]{6}$/

const num = (v: number | null | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const hexToInt = (v: string | null | undefined, fallback: number): number =>
  typeof v === 'string' && HEX.test(v) ? parseInt(v.slice(1), 16) : fallback

const intToHex = (v: number): string => `#${v.toString(16).padStart(6, '0').toUpperCase()}`

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/**
 * Merges CMS values over the frozen defaults. Anything null/undefined — a
 * never-saved global, or a field added in a later release — falls back.
 */
export function resolveIgnition(cms: HeroEffectsIgnitionInput | null | undefined): IgnitionConfig {
  const d = DEFAULT_IGNITION
  const t = cms?.ignitionTiming ?? {}
  const s = cms?.ignitionShape ?? {}
  const g = cms?.ignitionCage ?? {}
  const c = cms?.ignitionColor ?? {}

  // Phase boundaries must stay ordered and inside 0..1. Payload's min/max
  // guards the admin UI, but the REST API can be written to directly.
  const seedEnd = clamp01(num(t.seedEnd, d.SEED_END))
  const frontEnd = Math.max(seedEnd, clamp01(num(t.frontEnd, d.FRONT_END)))
  const cueFrac = clamp01(num(t.cueFrac, d.CUE_FRAC))

  return {
    ENABLED: typeof cms?.ignitionEnabled === 'boolean' ? cms.ignitionEnabled : d.ENABLED,
    IGNITION_MS: num(t.ignitionMs, d.IGNITION_MS),
    SEED_END: seedEnd,
    FRONT_END: frontEnd,
    CUE_FRAC: cueFrac,
    SEED_OFFSET_X: num(s.seedOffsetX, d.SEED_OFFSET_X),
    SEED_OFFSET_Y: num(s.seedOffsetY, d.SEED_OFFSET_Y),
    SEED_OFFSET_Z: num(s.seedOffsetZ, d.SEED_OFFSET_Z),
    FRONT_SOFTNESS: num(s.frontSoftness, d.FRONT_SOFTNESS),
    WAKE_LAG: num(s.wakeLag, d.WAKE_LAG),
    CORE_RADIUS: num(s.coreRadius, d.CORE_RADIUS),
    CORE_STRENGTH: num(s.coreStrength, d.CORE_STRENGTH),
    CAGE_DENSITY: num(g.cageDensity, d.CAGE_DENSITY),
    CAGE_DENSITY_MOBILE: num(g.cageDensityMobile, d.CAGE_DENSITY_MOBILE),
    CAGE_OPACITY: num(g.cageOpacity, d.CAGE_OPACITY),
    CAGE_SEED: num(g.cageSeed, d.CAGE_SEED),
    COLD_COLOR: hexToInt(c.coldColor, d.COLD_COLOR),
    WARM_COLOR: hexToInt(c.warmColor, d.WARM_COLOR),
    HOT_COLOR: hexToInt(c.hotColor, d.HOT_COLOR),
    CREST_COLOR: hexToInt(c.crestColor, d.CREST_COLOR),
    DARK_MASS_OPACITY: num(c.darkMassOpacity, d.DARK_MASS_OPACITY),
    GLOW_DECAY: num(c.glowDecay, d.GLOW_DECAY),
  }
}

/** Inverse mapping, used by the dev bench's Save to CMS button. */
export function toIgnitionPayload(c: IgnitionConfig): HeroEffectsIgnitionInput {
  return {
    ignitionEnabled: c.ENABLED,
    ignitionTiming: {
      ignitionMs: c.IGNITION_MS,
      seedEnd: c.SEED_END,
      frontEnd: c.FRONT_END,
      cueFrac: c.CUE_FRAC,
    },
    ignitionShape: {
      seedOffsetX: c.SEED_OFFSET_X,
      seedOffsetY: c.SEED_OFFSET_Y,
      seedOffsetZ: c.SEED_OFFSET_Z,
      frontSoftness: c.FRONT_SOFTNESS,
      wakeLag: c.WAKE_LAG,
      coreRadius: c.CORE_RADIUS,
      coreStrength: c.CORE_STRENGTH,
    },
    ignitionCage: {
      cageDensity: c.CAGE_DENSITY,
      cageDensityMobile: c.CAGE_DENSITY_MOBILE,
      cageOpacity: c.CAGE_OPACITY,
      cageSeed: c.CAGE_SEED,
    },
    ignitionColor: {
      coldColor: intToHex(c.COLD_COLOR),
      warmColor: intToHex(c.WARM_COLOR),
      hotColor: intToHex(c.HOT_COLOR),
      crestColor: intToHex(c.CREST_COLOR),
      darkMassOpacity: c.DARK_MASS_OPACITY,
      glowDecay: c.GLOW_DECAY,
    },
  }
}
```

- [ ] **Step 5: Run the check to verify it passes**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/three/ignition/resolveIgnition.check.ts
```

Expected: every line `ok`, then `All ignition config checks passed.`, exit 0.

- [ ] **Step 6: Wire it into `verify:config`**

In `package.json`, replace the `verify:config` script:

```json
"verify:config": "node --import tsx src/lib/three/shatter/resolveSeparation.check.ts && node --import tsx src/lib/three/ignition/resolveIgnition.check.ts"
```

Run: `npm run verify:config` — expected: both suites pass, exit 0.

- [ ] **Step 7: Typecheck and commit**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit
git add src/lib/three/ignition package.json
git commit -m "feat(ignition): config types, CMS resolver and checks"
```

---

### Task 2: Payload global fields and seed

**Files:**
- Modify: `src/globals/HeroEffects.ts` (append 1 checkbox + 4 groups after the existing `feel` group)
- Modify: `src/seed/index.ts:66-91` (the `hero-effects` `updateGlobal` call)

**Interfaces:**
- Consumes: `DEFAULT_IGNITION` field names from Task 1 — the Payload field names must match `HeroEffectsIgnitionInput` exactly (`ignitionEnabled`, `ignitionTiming`, `ignitionShape`, `ignitionCage`, `ignitionColor`).
- Produces: a `hero-effects` global that `resolveIgnition()` can read.

- [ ] **Step 1: Add the fields**

In `src/globals/HeroEffects.ts`, append these to the `fields` array, after the closing brace of the `feel` group. `hexColour` is already defined at the top of the file — reuse it, do not redefine.

```ts
    {
      name: 'ignitionEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Plays the electrical wireframe transition between the sketch video and the rotating 3D logo. Turning this off restores the plain crossfade.',
      },
    },
    {
      name: 'ignitionTiming',
      type: 'group',
      label: 'Ignition — timing',
      admin: {
        description:
          'Total length, and the phase boundaries as fractions of it. Changing the duration retimes everything proportionally.',
      },
      fields: [
        {
          name: 'ignitionMs',
          type: 'number',
          defaultValue: 2000,
          min: 600,
          max: 4000,
          admin: { description: 'Total length of the transition. The main pacing control.' },
        },
        {
          name: 'seedEnd',
          type: 'number',
          defaultValue: 0.12,
          min: 0,
          max: 0.5,
          admin: { description: 'Fraction where the core bloom ends and the front starts moving' },
        },
        {
          name: 'frontEnd',
          type: 'number',
          defaultValue: 0.78,
          min: 0.2,
          max: 1,
          admin: { description: 'Fraction where the charge front finishes crossing the logo' },
        },
        {
          name: 'cueFrac',
          type: 'number',
          defaultValue: 0.8,
          min: 0.1,
          max: 1,
          admin: { description: 'Fraction where the floating words / orbs are told to enter' },
        },
      ],
    },
    {
      name: 'ignitionShape',
      type: 'group',
      label: 'Ignition — shape',
      admin: { description: 'Where the charge starts and how wide its crest is' },
      fields: [
        { name: 'seedOffsetX', type: 'number', defaultValue: 0, min: -1, max: 1 },
        { name: 'seedOffsetY', type: 'number', defaultValue: 0, min: -1, max: 1 },
        { name: 'seedOffsetZ', type: 'number', defaultValue: 0, min: -1, max: 1 },
        {
          name: 'frontSoftness',
          type: 'number',
          defaultValue: 0.18,
          min: 0.02,
          max: 1,
          admin: { description: 'Width of the glowing crest, as a fraction of logo height' },
        },
        {
          name: 'wakeLag',
          type: 'number',
          defaultValue: 0.1,
          min: 0,
          max: 0.6,
          admin: { description: 'How far behind the crest the solid surfaces appear' },
        },
        { name: 'coreRadius', type: 'number', defaultValue: 0.22, min: 0, max: 1 },
        { name: 'coreStrength', type: 'number', defaultValue: 1, min: 0, max: 2 },
      ],
    },
    {
      name: 'ignitionCage',
      type: 'group',
      label: 'Ignition — cage',
      admin: { description: 'The scribble wireframe that carries the charge' },
      fields: [
        {
          name: 'cageDensity',
          type: 'number',
          defaultValue: 0.55,
          min: 0.05,
          max: 1,
          admin: {
            description:
              'Fraction of wireframe lines drawn. At 1 it looks like CAD; lower reads as pencil scribble.',
          },
        },
        {
          name: 'cageDensityMobile',
          type: 'number',
          defaultValue: 0.3,
          min: 0.05,
          max: 1,
          admin: { description: 'Same, on screens below 640px' },
        },
        { name: 'cageOpacity', type: 'number', defaultValue: 0.9, min: 0, max: 1 },
        {
          name: 'cageSeed',
          type: 'number',
          defaultValue: 1337,
          min: 0,
          max: 999999,
          admin: { description: 'Changes which lines are drawn. Same number = same cage every load.' },
        },
      ],
    },
    {
      name: 'ignitionColor',
      type: 'group',
      label: 'Ignition — colour',
      admin: { description: 'The graphite-to-hot ramp, and the dark mass that makes red readable' },
      fields: [
        {
          name: 'coldColor',
          type: 'text',
          defaultValue: '#2B2A27',
          validate: hexColour,
          admin: { description: 'Unlit cage — matches the pencil in the sketch video' },
        },
        { name: 'warmColor', type: 'text', defaultValue: '#8E1114', validate: hexColour },
        { name: 'hotColor', type: 'text', defaultValue: '#C8341A', validate: hexColour },
        {
          name: 'crestColor',
          type: 'text',
          defaultValue: '#FFF8E0',
          validate: hexColour,
          admin: { description: 'The very peak of the charge. Kept small and brief.' },
        },
        {
          name: 'darkMassOpacity',
          type: 'number',
          defaultValue: 0.12,
          min: 0,
          max: 0.6,
          admin: {
            description:
              'Faint dark fill shown only during the transition. Without it the red washes out against the paper background.',
          },
        },
        { name: 'glowDecay', type: 'number', defaultValue: 2.4, min: 0.2, max: 8 },
      ],
    },
```

- [ ] **Step 2: Extend the seed**

In `src/seed/index.ts`, inside the `hero-effects` `updateGlobal` `data` object, after the `feel: {...}` line, add:

```ts
      ignitionEnabled: true,
      ignitionTiming: { ignitionMs: 2000, seedEnd: 0.12, frontEnd: 0.78, cueFrac: 0.8 },
      ignitionShape: {
        seedOffsetX: 0,
        seedOffsetY: 0,
        seedOffsetZ: 0,
        frontSoftness: 0.18,
        wakeLag: 0.1,
        coreRadius: 0.22,
        coreStrength: 1,
      },
      ignitionCage: { cageDensity: 0.55, cageDensityMobile: 0.3, cageOpacity: 0.9, cageSeed: 1337 },
      ignitionColor: {
        coldColor: '#2B2A27',
        warmColor: '#8E1114',
        hotColor: '#C8341A',
        crestColor: '#FFF8E0',
        darkMassOpacity: 0.12,
        glowDecay: 2.4,
      },
```

- [ ] **Step 3: Reseed and regenerate types**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npm run seed && rm -rf .next/cache && npm run generate:types
```

`rm -rf .next/cache` is **required, not optional**. `getHeroEffects` uses `unstable_cache`, which persists to disk and survives dev-server restarts; the seed script's `revalidateTag` is a documented no-op outside a request context. Skipping this makes the new values invisible and wastes an afternoon.

- [ ] **Step 4: Verify the shatter bench does not wipe the new fields**

This is a real risk: `ShatterLab.tsx:67` posts `toHeroEffectsPayload(...)` to `/api/globals/hero-effects`, and that payload contains **only** the separation groups.

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npm run dev
```

Then, in another shell:

```bash
curl -s http://localhost:3000/api/globals/hero-effects | python -c "import sys,json;d=json.load(sys.stdin);print('ignitionTiming BEFORE:', d.get('ignitionTiming'))"
curl -s -X POST http://localhost:3000/api/globals/hero-effects -H "Content-Type: application/json" -d '{"timing":{"chargeMs":951}}'
curl -s http://localhost:3000/api/globals/hero-effects | python -c "import sys,json;d=json.load(sys.stdin);print('ignitionTiming AFTER: ', d.get('ignitionTiming'))"
```

Expected: `ignitionTiming` is identical before and after — a partial update must not null sibling groups.

**If it IS wiped**, fix it by making both benches send a merged payload: change `ShatterLab`'s save body to `JSON.stringify({ ...toHeroEffectsPayload(cfg), ...toIgnitionPayload(ignitionCfg) })`, and do the same in reverse for the ignition bench in Task 8. Record which behaviour you observed in the commit message either way.

- [ ] **Step 5: Commit**

```bash
git add src/globals/HeroEffects.ts src/seed/index.ts src/payload-types.ts
git commit -m "feat(ignition): hero-effects global fields and seed"
```

---

### Task 3: The cage builder

**Files:**
- Create: `src/lib/three/ignition/cage.ts`
- Create: `src/lib/three/ignition/cage.check.ts`
- Modify: `package.json` (`verify:config` — append the third check)

**Interfaces:**
- Consumes: `IgnitionConfig` (Task 1); `mulberry32` from `../shatter/types`.
- Produces:
  - `buildIgnitionCage(source: THREE.Object3D, config: IgnitionConfig, density: number, material: THREE.Material): THREE.LineSegments | null`
  - `subsampleSegments(positions: Float32Array, density: number, seed: number): Float32Array` — exported for the check script

`three` runs fine in Node for pure geometry work — no WebGL context is needed for `WireframeGeometry` or `BufferGeometry`, so this task is genuinely unit-testable.

- [ ] **Step 1: Write the failing check**

Create `src/lib/three/ignition/cage.check.ts`:

```ts
/**
 * Assertions for the deterministic cage subsample.
 * Run: npm run verify:config
 */
import { subsampleSegments } from './cage'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

// 12 segments = 24 vertices = 72 floats
const N = 12
const src = new Float32Array(N * 6)
for (let i = 0; i < N * 6; i++) src[i] = i

const half = subsampleSegments(src, 0.5, 1337)
check('half density keeps ~half the segments', half.length / 6 === Math.round(N * 0.5))
check('output length is a whole number of segments', half.length % 6 === 0)

// determinism: same seed -> byte-identical output
const again = subsampleSegments(src, 0.5, 1337)
check('same seed is deterministic', half.every((v, i) => v === again[i]))

// a different seed picks a different subset (with 12 segments this is
// overwhelmingly likely; a collision would mean the seed is being ignored)
const other = subsampleSegments(src, 0.5, 99)
check('different seed picks a different subset', !half.every((v, i) => v === other[i]))

// segments are copied whole — never split across the 6-float boundary
const full = subsampleSegments(src, 1, 1337)
check('density 1 keeps everything', full.length === src.length)
for (let s = 0; s < full.length / 6; s++) {
  const base = full[s * 6]
  check(`segment ${s} copied intact`, full[s * 6 + 1] === base + 1 && full[s * 6 + 5] === base + 5)
}

// clamping
check('density 0 yields an empty array', subsampleSegments(src, 0, 1337).length === 0)
check('density above 1 clamps', subsampleSegments(src, 5, 1337).length === src.length)
check('negative density clamps to empty', subsampleSegments(src, -2, 1337).length === 0)

console.log(failures === 0 ? '\nAll cage checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/three/ignition/cage.check.ts
```

Expected: FAIL — `Cannot find module './cage'`.

- [ ] **Step 3: Implement the cage builder**

Create `src/lib/three/ignition/cage.ts`:

```ts
import * as THREE from 'three'
import { mulberry32 } from '../shatter/types'
import type { IgnitionConfig } from './types'

/**
 * The dense scribble cage that carries the charge.
 * Spec: docs/superpowers/specs/2026-08-09-hero-ignition-design.md §3.4
 *
 * WireframeGeometry, not EdgesGeometry. EdgesGeometry only emits an edge where
 * adjacent face normals differ by more than a threshold, so the extruded logo's
 * FLAT front and back caps come out nearly empty and only the curved side band
 * is dense — an outline with a dense rim, not a cage.
 *
 * The result is then subsampled: it is the mobile budget knob, it keeps the
 * segment count near ~30k, and a PARTIAL wireframe reads as pencil scribble
 * where a complete one reads as CAD.
 */

/**
 * Keeps `density` of the segments, chosen deterministically from `seed`.
 * Operates on whole segments — 6 floats, two endpoints — never splitting one.
 */
export function subsampleSegments(
  positions: Float32Array,
  density: number,
  seed: number,
): Float32Array {
  const segCount = Math.floor(positions.length / 6)
  const d = Math.min(1, Math.max(0, density))
  const keep = Math.round(segCount * d)
  if (keep <= 0) return new Float32Array(0)
  if (keep >= segCount) return positions.slice()

  // Partial Fisher-Yates over an index array: an unbiased sample of exactly
  // `keep` segments, without the clustering a plain `rand() < d` test produces.
  const idx = new Uint32Array(segCount)
  for (let i = 0; i < segCount; i++) idx[i] = i
  const rand = mulberry32(seed)
  for (let i = 0; i < keep; i++) {
    const j = i + Math.floor(rand() * (segCount - i))
    const t = idx[i]
    idx[i] = idx[j]
    idx[j] = t
  }

  // Sorted so the output order is stable and cache-friendly.
  const chosen = Array.from(idx.slice(0, keep)).sort((a, b) => a - b)
  const out = new Float32Array(keep * 6)
  for (let i = 0; i < keep; i++) {
    const s = chosen[i] * 6
    out.set(positions.subarray(s, s + 6), i * 6)
  }
  return out
}

/**
 * Builds one LineSegments covering every mesh under `source`, in `source`'s
 * local space, so it can be added to the logo group and inherit spin and tilt.
 * Returns null when nothing was produced (no meshes, or density 0).
 */
export function buildIgnitionCage(
  source: THREE.Object3D,
  config: IgnitionConfig,
  density: number,
  material: THREE.Material,
): THREE.LineSegments | null {
  const chunks: Float32Array[] = []

  source.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return

    const wire = new THREE.WireframeGeometry(mesh.geometry)
    const attr = wire.getAttribute('position') as THREE.BufferAttribute
    const raw = new Float32Array(attr.array as ArrayLike<number>)

    // Bake the mesh's own transform relative to `source`, so a single
    // LineSegments at the group's origin lands on top of every sub-mesh.
    mesh.updateWorldMatrix(true, false)
    const m = new THREE.Matrix4()
      .copy(source.matrixWorld)
      .invert()
      .multiply(mesh.matrixWorld)
    const v = new THREE.Vector3()
    for (let i = 0; i < raw.length; i += 3) {
      v.set(raw[i], raw[i + 1], raw[i + 2]).applyMatrix4(m)
      raw[i] = v.x
      raw[i + 1] = v.y
      raw[i + 2] = v.z
    }

    chunks.push(subsampleSegments(raw, density, config.CAGE_SEED))
    wire.dispose()
  })

  const total = chunks.reduce((n, c) => n + c.length, 0)
  if (total === 0) return null

  const merged = new Float32Array(total)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.length
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(merged, 3))

  const lines = new THREE.LineSegments(geo, material)
  lines.renderOrder = 3 // above the skin (2) and the ghost body (0/1)
  lines.frustumCulled = false
  return lines
}
```

- [ ] **Step 4: Run the check to verify it passes**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/three/ignition/cage.check.ts
```

Expected: all `ok`, exit 0.

- [ ] **Step 5: Verify the real segment budget against the shipped Draco mesh**

The spec's ~30k figure came from the **uncompressed** `_ASSETS/logo-3d/logo.glb`. Confirm the shipped file decodes to the same topology before trusting it. Add a temporary script `scripts/cage-budget.mjs`:

```js
import { readFileSync } from 'node:fs'
const b = readFileSync('public/media/logo.draco.glb')
const jsonLen = b.readUInt32LE(12)
const json = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'))
let tris = 0
for (const m of json.meshes || [])
  for (const p of m.primitives) {
    const d = p.extensions?.KHR_draco_mesh_compression
    const acc = json.accessors[p.indices]
    tris += acc.count / 3
    if (d) console.log('draco primitive, indices accessor count:', acc.count)
  }
console.log('tris:', tris, 'wireframe segments:', tris * 3, 'at 0.55:', Math.round(tris * 3 * 0.55))
```

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node scripts/cage-budget.mjs && rm scripts/cage-budget.mjs
```

**Result (measured 2026-08-09):** shipped Draco mesh = **19,696 tris**, vs 19,704 in the uncompressed source — 0.04 % apart, same mesh.

**But the segment figure in this plan was wrong.** `THREE.WireframeGeometry` **deduplicates shared edges**; it does not emit 3 per triangle. Verified on a synthetic quad (5 segments, not 6) and a unit box (18, not 36), then measured on the real logo: **29,557 unique segments**, not 59,112.

Consequence: `CAGE_DENSITY` is a **look control, not a budget control** — even density 1 is one draw call of ~29.6 k segments. The 0.55 default's original justification no longer holds; it stays as a provisional starting point to be settled visually on the bench in Task 8. Do not "fix" it by arithmetic.

- [ ] **Step 6: Wire the check in and commit**

`package.json` — `verify:config` becomes:

```json
"verify:config": "node --import tsx src/lib/three/shatter/resolveSeparation.check.ts && node --import tsx src/lib/three/ignition/resolveIgnition.check.ts && node --import tsx src/lib/three/ignition/cage.check.ts"
```

```bash
npm run verify:config && npx tsc --noEmit
git add src/lib/three/ignition/cage.ts src/lib/three/ignition/cage.check.ts package.json
git commit -m "feat(ignition): deterministic scribble cage builder"
```

---

### Task 4: Ignition material — cage shader and the skin wake patch

**Files:**
- Create: `src/lib/three/ignition/ignitionMaterial.ts`

**Interfaces:**
- Consumes: `IgnitionConfig`, `IgnitionUniforms` (Task 1).
- Produces:
  - `makeIgnitionUniforms(config: IgnitionConfig, logoHeight: number, center: THREE.Vector3): IgnitionUniforms`
  - `makeCageMaterial(u: IgnitionUniforms): THREE.ShaderMaterial`
  - `patchSkinForIgnition(material: THREE.Material, u: IgnitionUniforms): void`

**⚠️ The single most important detail in this task.** `patchForShatter` **assigns** `material.onBeforeCompile`. Assigning it again here would silently clobber the shatter patch — the hatch, the light wash and the whole panel displacement would vanish with no error. `patchSkinForIgnition` must **compose**: capture the existing callback and call it first. It must also be applied **after** `patchForShatter` in `LogoEngine.load()`.

- [ ] **Step 1: Implement the material module**

Create `src/lib/three/ignition/ignitionMaterial.ts`:

```ts
import * as THREE from 'three'
import type { IgnitionConfig, IgnitionUniforms } from './types'

/**
 * The cage's own shader, plus the one narrow patch ignition makes to the
 * existing skin materials.
 * Spec: docs/superpowers/specs/2026-08-09-hero-ignition-design.md §3.2, §4.1
 *
 * No per-vertex attributes: the charge front is distance from a seed point,
 * which the shader computes straight from `position`.
 */

export function makeIgnitionUniforms(
  config: IgnitionConfig,
  logoHeight: number,
  center: THREE.Vector3,
): IgnitionUniforms {
  const seed = center
    .clone()
    .add(
      new THREE.Vector3(
        config.SEED_OFFSET_X * logoHeight,
        config.SEED_OFFSET_Y * logoHeight,
        config.SEED_OFFSET_Z * logoHeight,
      ),
    )
  return {
    uFront: { value: 0 },
    uSeed: { value: seed },
    uSoftness: { value: Math.max(1e-4, config.FRONT_SOFTNESS * logoHeight) },
    uCoreRadius: { value: Math.max(1e-4, config.CORE_RADIUS * logoHeight) },
    uCoreStrength: { value: config.CORE_STRENGTH },
    uCoreLive: { value: 0 },
    uGlobalFade: { value: 0 },
    uWakeLag: { value: config.WAKE_LAG * logoHeight },
    uWakeActive: { value: 0 },
    uCold: { value: new THREE.Color(config.COLD_COLOR) },
    uWarm: { value: new THREE.Color(config.WARM_COLOR) },
    uHot: { value: new THREE.Color(config.HOT_COLOR) },
    uCrest: { value: new THREE.Color(config.CREST_COLOR) },
    uCageOpacity: { value: config.CAGE_OPACITY },
  }
}

const CAGE_VERT = /* glsl */ `
uniform vec3 uSeed;
varying float vDist;
void main() {
  vDist = distance(position, uSeed);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/**
 * Heat is the max of two sources: the travelling crest, and the hot core that
 * sits at the seed. The ramp then walks cold -> warm -> hot -> crest, with the
 * blown-out crest colour confined to the top of the range so it stays a thin
 * bright line rather than a white wash on the paper background.
 */
const CAGE_FRAG = /* glsl */ `
uniform float uFront;
uniform float uSoftness;
uniform float uCoreRadius;
uniform float uCoreStrength;
uniform float uCoreLive;
uniform float uGlobalFade;
uniform float uCageOpacity;
uniform vec3  uCold;
uniform vec3  uWarm;
uniform vec3  uHot;
uniform vec3  uCrest;
varying float vDist;

void main() {
  float crest = 1.0 - smoothstep(0.0, uSoftness, abs(vDist - uFront));
  float core  = uCoreStrength * uCoreLive * (1.0 - smoothstep(0.0, uCoreRadius, vDist));
  float heat  = clamp(max(crest, core), 0.0, 1.0);

  vec3 c = mix(uCold, uWarm, smoothstep(0.0, 0.40, heat));
  c = mix(c, uHot,   smoothstep(0.40, 0.75, heat));
  c = mix(c, uCrest, smoothstep(0.90, 1.00, heat));

  float a = uCageOpacity * uGlobalFade;
  if (a <= 0.001) discard;
  gl_FragColor = vec4(c, a);
}
`

export function makeCageMaterial(u: IgnitionUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFront: u.uFront,
      uSeed: u.uSeed,
      uSoftness: u.uSoftness,
      uCoreRadius: u.uCoreRadius,
      uCoreStrength: u.uCoreStrength,
      uCoreLive: u.uCoreLive,
      uGlobalFade: u.uGlobalFade,
      uCageOpacity: u.uCageOpacity,
      uCold: u.uCold,
      uWarm: u.uWarm,
      uHot: u.uHot,
      uCrest: u.uCrest,
    },
    vertexShader: CAGE_VERT,
    fragmentShader: CAGE_FRAG,
    transparent: true,
    depthWrite: false,
  })
}

const SKIN_FRAG_HELPERS = /* glsl */ `
uniform float uFront;
uniform float uWakeLag;
uniform float uSoftness;
uniform float uWakeActive;
varying float vIgnDist;

// 0 ahead of the crest, 1 well behind it. Multiplied into the skin's alpha so
// the solid logo materializes in the front's wake.
float tt_ignWake() {
  float w = smoothstep(0.0, max(1e-4, uSoftness), (uFront - uWakeLag) - vIgnDist);
  return mix(1.0, w, uWakeActive);
}
`

const SKIN_VERT_HELPERS = /* glsl */ `
uniform vec3 uSeed;
varying float vIgnDist;
`

/** Throws loudly if a shader anchor was not found — a missed replace silently no-ops. */
function replaceOrThrow(src: string, anchor: string, next: string, where: string): string {
  if (!src.includes(anchor)) {
    throw new Error(`patchSkinForIgnition: anchor "${anchor}" not found in ${where}`)
  }
  return src.replace(anchor, next)
}

/**
 * Adds the wake alpha to a skin material.
 *
 * MUST be applied AFTER patchForShatter, and MUST compose rather than assign:
 * three exposes exactly one onBeforeCompile per material, so assigning here
 * would silently drop the hatch, the light wash and the panel displacement.
 */
export function patchSkinForIgnition(material: THREE.Material, u: IgnitionUniforms) {
  const prev = material.onBeforeCompile

  material.onBeforeCompile = function (shader, renderer) {
    prev?.call(this, shader, renderer)

    Object.assign(shader.uniforms, {
      uFront: u.uFront,
      uSeed: u.uSeed,
      uSoftness: u.uSoftness,
      uWakeLag: u.uWakeLag,
      uWakeActive: u.uWakeActive,
    })

    shader.vertexShader = replaceOrThrow(
      shader.vertexShader,
      '#include <common>',
      `#include <common>\n${SKIN_VERT_HELPERS}`,
      'vertex',
    )
    // `position` is the untouched attribute — deliberately not `transformed`,
    // which the shatter patch displaces. The wake follows the logo's real
    // shape, not where its panels have drifted to.
    shader.vertexShader = replaceOrThrow(
      shader.vertexShader,
      '#include <begin_vertex>',
      `#include <begin_vertex>\n  vIgnDist = distance(position, uSeed);`,
      'vertex',
    )

    shader.fragmentShader = replaceOrThrow(
      shader.fragmentShader,
      '#include <common>',
      `#include <common>\n${SKIN_FRAG_HELPERS}`,
      'fragment',
    )
    // <alphatest_fragment> runs after diffuseColor exists and before lighting,
    // and is untouched by patchForShatter (which uses <common> and
    // <opaque_fragment>), so the two patches cannot collide.
    shader.fragmentShader = replaceOrThrow(
      shader.fragmentShader,
      '#include <alphatest_fragment>',
      `diffuseColor.a *= tt_ignWake();\n  #include <alphatest_fragment>`,
      'fragment',
    )
  }

  // Materials whose compiled program differs must not share a cache entry.
  material.customProgramCacheKey = () => 'tt-ignition-1'
  material.needsUpdate = true
}
```

- [ ] **Step 2: Typecheck**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/three/ignition/ignitionMaterial.ts
git commit -m "feat(ignition): cage shader and composing skin wake patch"
```

---

### Task 5: IgnitionController

**Files:**
- Create: `src/lib/three/ignition/IgnitionController.ts`
- Create: `src/lib/three/ignition/IgnitionController.check.ts`
- Modify: `package.json` (`verify:config` — append the fourth check)

**Interfaces:**
- Consumes: `IgnitionConfig`, `IgnitionEvent`, `IgnitionUniforms` (Task 1).
- Produces: `class IgnitionController` with
  - `constructor(u: IgnitionUniforms, reach: number, config: IgnitionConfig)`
  - `start(): void`
  - `update(dt: number): void`
  - `onIgnition(cb: (e: IgnitionEvent) => void): () => void`
  - `getProgress(): number`
  - `isFinished(): boolean`
  - `finishNow(): void` — force completion, still emitting `done` exactly once
  - `dispose(): void`

`reach` is the maximum distance from the seed to any part of the logo, so the front is guaranteed to clear the geometry by `FRONT_END`.

- [ ] **Step 1: Write the failing check**

Create `src/lib/three/ignition/IgnitionController.check.ts`:

```ts
/**
 * Assertions for the ignition state machine.
 * Run: npm run verify:config
 *
 * All authoritative state lives in JS — the GPU only renders the numbers this
 * hands it — which is what makes the effect verifiable without a browser.
 */
import * as THREE from 'three'
import { DEFAULT_IGNITION, type IgnitionEvent } from './types'
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

const make = (cfg = DEFAULT_IGNITION) => {
  const u = makeIgnitionUniforms(cfg, 1, new THREE.Vector3())
  const events: IgnitionEvent[] = []
  const c = new IgnitionController(u, 1, cfg)
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
}

// done fires EXACTLY once even if update keeps being called.
{
  const { c, events } = make()
  c.start()
  for (let i = 0; i < 600; i++) c.update(0.016)
  check('done fires exactly once', events.filter((e) => e === 'done').length === 1)
  check('cue fires exactly once', events.filter((e) => e === 'cue').length === 1)
}

// start() is idempotent — a second call must not replay or re-emit.
{
  const { c, events } = make()
  c.start()
  c.start()
  check('start is idempotent', events.filter((e) => e === 'seed').length === 1)
}

// finishNow() short-circuits but still emits the full sequence exactly once.
// This is the path taken when the mesh never loads or reduced motion is on:
// `armed` and `onLive` hang off done, so it can never be skipped.
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

// finishNow() without start() still emits done exactly once.
{
  const { c, events } = make()
  c.finishNow()
  check('finishNow without start still emits done', events.filter((e) => e === 'done').length === 1)
}

// The front actually crosses the whole reach by FRONT_END.
{
  const u = makeIgnitionUniforms(DEFAULT_IGNITION, 1, new THREE.Vector3())
  const c = new IgnitionController(u, 3, DEFAULT_IGNITION)
  c.start()
  const stopAt = DEFAULT_IGNITION.IGNITION_MS * DEFAULT_IGNITION.FRONT_END
  for (let t = 0; t < stopAt; t += 16) c.update(0.016)
  check('front clears the geometry by FRONT_END', u.uFront.value >= 3)
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

console.log(failures === 0 ? '\nAll ignition controller checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/three/ignition/IgnitionController.check.ts
```

Expected: FAIL — `Cannot find module './IgnitionController'`.

- [ ] **Step 3: Implement the controller**

Create `src/lib/three/ignition/IgnitionController.ts`:

```ts
import { DEFAULT_IGNITION, type IgnitionConfig, type IgnitionEvent, type IgnitionUniforms } from './types'

/**
 * Phase clock for the electrical wireframe ignition.
 * Spec: docs/superpowers/specs/2026-08-09-hero-ignition-design.md §3.1, §4.5
 *
 * All authoritative state lives here in JS — the GPU only renders the numbers
 * this hands it, which is what keeps the effect verifiable in Node.
 *
 * INVARIANT: `done` fires exactly once, unconditionally. Separation arming and
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
    return () => this.listeners.delete(cb)
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

  /** Force completion — mesh never loaded, reduced motion, or teardown. */
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

    // Core is full through the seed bloom, then decays away as the front takes over.
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

  private emit(e: IgnitionEvent) {
    this.listeners.forEach((cb) => cb(e))
  }
}
```

- [ ] **Step 4: Run the check to verify it passes**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && node --import tsx src/lib/three/ignition/IgnitionController.check.ts
```

Expected: all `ok`, exit 0.

- [ ] **Step 5: Wire the check in and commit**

`package.json` — `verify:config` becomes:

```json
"verify:config": "node --import tsx src/lib/three/shatter/resolveSeparation.check.ts && node --import tsx src/lib/three/ignition/resolveIgnition.check.ts && node --import tsx src/lib/three/ignition/cage.check.ts && node --import tsx src/lib/three/ignition/IgnitionController.check.ts"
```

```bash
npm run verify:config && npx tsc --noEmit
git add src/lib/three/ignition/IgnitionController.ts src/lib/three/ignition/IgnitionController.check.ts package.json
git commit -m "feat(ignition): phase controller with guaranteed single done"
```

---

### Task 6: LogoEngine integration

**Files:**
- Modify: `src/lib/three/LogoEngine.ts`

**Interfaces:**
- Consumes: everything from Tasks 1, 3, 4, 5.
- Produces on `LogoEngine`:
  - `constructor(canvas, config?: SeparationConfig, ignition?: IgnitionConfig)`
  - `startIgnition(): void`
  - `onIgnition(cb: (e: IgnitionEvent) => void): () => void`

- [ ] **Step 1: Add imports and fields**

At the top of `src/lib/three/LogoEngine.ts`, alongside the existing shatter imports:

```ts
import { buildIgnitionCage } from './ignition/cage'
import { IgnitionController } from './ignition/IgnitionController'
import { makeCageMaterial, makeIgnitionUniforms, patchSkinForIgnition } from './ignition/ignitionMaterial'
import { DEFAULT_IGNITION, type IgnitionConfig, type IgnitionEvent, type IgnitionUniforms } from './ignition/types'
```

Add these private fields next to the existing `// hold-to-shatter` block:

```ts
  // electrical wireframe ignition
  private ignition: IgnitionController | null = null
  private ignitionUniforms: IgnitionUniforms | null = null
  private cage: THREE.LineSegments | null = null
  private cageMaterial: THREE.ShaderMaterial | null = null
  private bodySurfaceMats: THREE.Material[] = []
  private wantIgnition = false
  private pendingIgnitionListeners = new Set<(e: IgnitionEvent) => void>()
```

Extend the constructor signature:

```ts
  constructor(
    private canvas: HTMLCanvasElement,
    private config: SeparationConfig = DEFAULT_SEPARATION,
    private ignitionConfig: IgnitionConfig = DEFAULT_IGNITION,
  ) {
```

(The constructor body is unchanged.)

- [ ] **Step 2: Build the dark mass surfaces when ignition needs them**

`buildInnerBody` currently skips the surfaces entirely when `BODY_OPACITY <= 0`, which is the shipped value. Ignition needs them for §3.3's dark mass.

In `buildInnerBody`, replace the `if (this.config.BODY_OPACITY > 0) {` guard and the matching `if (this.config.BODY_OPACITY <= 0) geo.dispose()` at the end of the traverse with:

```ts
      // Ignition raises these surfaces to DARK_MASS_OPACITY for the duration of
      // the transition — red on light paper needs local darkness to read as
      // glow (spec §3.3) — so they must exist even when BODY_OPACITY is 0.
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
```

and

```ts
      if (!needSurfaces) geo.dispose()
```

Also record the surface materials so they can be animated. Immediately after `this.bodyMaterials = [...Object.values(bodyMats), edgeMat]`, add:

```ts
    this.bodySurfaceMats = Object.values(bodyMats)
```

- [ ] **Step 3: Build the cage and controller in `load()`**

In `load()`, inside `if (this.interactive) {`, **after** the `Object.values(set).forEach(...)` block that calls `patchForShatter` (order matters — see Task 4), insert:

```ts
      // Ignition. Built here rather than at transition time so the sketch
      // video's 7.67s absorbs the cost and the bridge starts without a hitch.
      if (this.ignitionConfig.ENABLED) {
        const bbox = new THREE.Box3().setFromObject(group)
        const centre = bbox.getCenter(new THREE.Vector3())
        group.worldToLocal(centre)
        const logoHeight = heightFrac * visH

        const iu = makeIgnitionUniforms(this.ignitionConfig, logoHeight, centre)
        this.ignitionUniforms = iu

        // AFTER patchForShatter: patchSkinForIgnition composes with whatever
        // onBeforeCompile is already there. Assigning instead of composing
        // would silently drop the hatch, wash and displacement.
        Object.values(set).forEach((m) => patchSkinForIgnition(m, iu))

        const isMobileNow = typeof window !== 'undefined' && window.innerWidth < 640
        const density = isMobileNow
          ? this.ignitionConfig.CAGE_DENSITY_MOBILE
          : this.ignitionConfig.CAGE_DENSITY
        this.cageMaterial = makeCageMaterial(iu)
        this.cage = buildIgnitionCage(group, this.ignitionConfig, density, this.cageMaterial)
        if (this.cage) group.add(this.cage)

        // Reach: furthest corner of the box from the seed, so the front is
        // guaranteed to clear the geometry.
        const corners = [bbox.min, bbox.max].map((v) => group.worldToLocal(v.clone()))
        const reach = Math.max(...corners.map((c) => c.distanceTo(centre))) || logoHeight
        this.ignition = new IgnitionController(iu, reach, this.ignitionConfig)
        this.pendingIgnitionListeners.forEach((cb) => this.ignition!.onIgnition(cb))
        this.pendingIgnitionListeners.clear()
        this.ignition.onIgnition((e) => {
          if (e === 'done') this.teardownIgnition()
        })
        if (this.wantIgnition) this.ignition.start()
      }
```

- [ ] **Step 4: Add the public API**

Add these methods next to `setShatterArmed`:

```ts
  /**
   * Begin the electrical wireframe transition.
   *
   * Records the intent even if the mesh has not finished loading — `load()`
   * starts the controller when it is created. Without that, a slow load (cold
   * cache, Draco wasm) that finishes after the caller starts would leave the
   * bridge dead and, because `armed` and `onLive` both hang off its `done`
   * event, the hero permanently inert with no console error. This is the exact
   * shape of the bug the 2026-08-09 review found in setShatterArmed.
   */
  startIgnition() {
    this.wantIgnition = true
    if (this.ignition) this.ignition.start()
    else if (!this.ignitionConfig.ENABLED) this.emitImmediateDone()
  }

  /** Subscribe before or after load(); early subscriptions are replayed onto the controller. */
  onIgnition(cb: (e: IgnitionEvent) => void): () => void {
    if (this.ignition) return this.ignition.onIgnition(cb)
    this.pendingIgnitionListeners.add(cb)
    return () => this.pendingIgnitionListeners.delete(cb)
  }

  /**
   * Ignition disabled, reduced motion, or no mesh: consumers still need the
   * full event sequence, because `armed` and `onLive` depend on `done`.
   */
  private emitImmediateDone() {
    const cbs = [...this.pendingIgnitionListeners]
    this.pendingIgnitionListeners.clear()
    for (const e of ['seed', 'cue', 'done'] as const) cbs.forEach((cb) => cb(e))
  }

  /** Cage has served its purpose — free ~1.4MB of line geometry. */
  private teardownIgnition() {
    if (this.cage) {
      this.cage.parent?.remove(this.cage)
      this.cage.geometry.dispose()
      this.cage = null
    }
    this.cageMaterial?.dispose()
    this.cageMaterial = null
    // Hand the skin's alpha back and drop the dark mass.
    if (this.ignitionUniforms) {
      this.ignitionUniforms.uWakeActive.value = 0
      this.ignitionUniforms.uGlobalFade.value = 0
    }
    this.bodySurfaceMats.forEach((m) => {
      m.opacity = this.config.BODY_OPACITY
      m.visible = this.config.BODY_OPACITY > 0
    })
  }
```

- [ ] **Step 5: Drive the controller from `tick`, and set the dark mass**

In `tick`, immediately after the existing `if (this.shatterUniforms) this.shatterUniforms.uTime.value += dt` line:

```ts
    if (this.ignition && !this.ignition.isFinished()) {
      this.ignition.update(dt)
      // Dark mass fades in with the cage and back out through settle, so the
      // red always has something to burn against while it is on screen.
      const fade = this.ignitionUniforms?.uGlobalFade.value ?? 0
      const target = this.ignitionConfig.DARK_MASS_OPACITY * fade
      this.bodySurfaceMats.forEach((m) => {
        m.opacity = Math.max(this.config.BODY_OPACITY, target)
        m.visible = m.opacity > 0
      })
    }
```

- [ ] **Step 6: Dispose**

In `dispose()`, after `this.shatter?.dispose()`:

```ts
    this.ignition?.dispose()
    this.ignition = null
    this.pendingIgnitionListeners.clear()
    this.cageMaterial?.dispose()
    this.cageMaterial = null
    this.cage?.geometry.dispose()
    this.cage = null
```

- [ ] **Step 7: Typecheck and commit**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && npm run verify:config
git add src/lib/three/LogoEngine.ts
git commit -m "feat(ignition): drive cage and controller from LogoEngine"
```

---

### Task 7: React wiring

**Files:**
- Modify: `src/components/three/LogoCanvas.tsx`
- Modify: `src/components/hero/LogoStage.tsx`
- Modify: `src/components/blocks/HeroBlock.tsx:9-17` (Props) and `:130`
- Modify: `src/components/blocks/RenderBlocks.tsx:9` (import) and `:37`

**Interfaces:**
- Consumes: `LogoEngine.startIgnition/onIgnition` (Task 6), `resolveIgnition` (Task 1).
- Produces: the wiring in spec §4.4 — `startIgnition()` at `introDone && canvasReady`, `onLive` at `cue`, `armed` at `done`.

- [ ] **Step 1: `LogoCanvas` — accept ignition config and expose the lifecycle**

Replace the props block and add the ignition effect:

```tsx
export default function LogoCanvas({
  onReady,
  config = DEFAULT_SEPARATION,
  ignition = DEFAULT_IGNITION,
  armed = false,
  ignite = false,
  onIgnitionCue,
  onIgnitionDone,
}: {
  onReady?: () => void
  config?: SeparationConfig
  ignition?: IgnitionConfig
  armed?: boolean
  ignite?: boolean
  onIgnitionCue?: () => void
  onIgnitionDone?: () => void
}) {
```

Add the imports:

```tsx
import { DEFAULT_IGNITION, type IgnitionConfig } from '../../lib/three/ignition/types'
```

Pass the config into the engine — change the construction line to:

```tsx
    const engine = new LogoEngine(canvas, config, ignition)
```

Subscribe in the same mount effect, immediately after `engineRef.current = engine`:

```tsx
    const offIgnition = engine.onIgnition((e) => {
      if (e === 'cue') onIgnitionCue?.()
      else if (e === 'done') onIgnitionDone?.()
    })
```

and call `offIgnition()` in the cleanup, before `engine.dispose()`.

Under reduced motion the engine skips the whole interactive path, so nothing would ever emit `done`. Change the reduced-motion line to force the sequence through:

```tsx
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    engine.setInteractive(!reduced)
```

and add, after the `engine.load()` call:

```tsx
    // Reduced motion skips the interactive path entirely, so no controller is
    // ever built. Consumers still need `done` — armed and onLive hang off it.
    if (reduced) {
      onIgnitionCue?.()
      onIgnitionDone?.()
    }
```

Finally, add the trigger effect next to the existing `armed` effect:

```tsx
  useEffect(() => {
    if (ignite) engineRef.current?.startIgnition()
  }, [ignite])
```

- [ ] **Step 2: `LogoStage` — retime the signals**

Replace the body of `LogoStage` with:

```tsx
export function LogoStage({
  onLive,
  onIntroPlayStart,
  separation,
  ignition,
}: {
  onLive?: () => void
  onIntroPlayStart?: () => void
  separation: SeparationConfig
  ignition: IgnitionConfig
}) {
  const [introDone, setIntroDone] = useState(false)
  const [canvasReady, setCanvasReady] = useState(false)
  const [ignited, setIgnited] = useState(false)
  const live = introDone && canvasReady

  // The floating words enter at the ignition's `cue`, not when the canvas
  // appears — the charge disperses INTO them (spec §4.4).
  const onCue = useCallback(() => onLive?.(), [onLive])

  useEffect(() => {
    if (!introDone || canvasReady) return
    const t = setTimeout(() => {
      console.error('LogoStage: 3D canvas never reported ready — forcing handoff')
      setCanvasReady(true)
    }, CANVAS_READY_FALLBACK_MS)
    return () => clearTimeout(t)
  }, [introDone, canvasReady])

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: live ? 1 : introDone ? 0.001 : 0,
          transition: 'opacity 0.6s ease',
        }}
      >
        <LogoCanvas
          onReady={() => setCanvasReady(true)}
          config={separation}
          ignition={ignition}
          armed={ignited}
          ignite={live}
          onIgnitionCue={onCue}
          onIgnitionDone={() => setIgnited(true)}
        />
      </div>
      <SketchIntro onDone={() => setIntroDone(true)} onPlayStart={onIntroPlayStart} />
    </div>
  )
}
```

Update the imports at the top of the file:

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { IgnitionConfig } from '../../lib/three/ignition/types'
```

The `onLive` effect that fired on `live` is **deleted** — `onCue` replaces it.

- [ ] **Step 3: `HeroBlock` — thread the prop**

Add to the `Props` type (required, matching `separation`):

```tsx
  ignition: IgnitionConfig
```

Add the import:

```tsx
import type { IgnitionConfig } from '../../lib/three/ignition/types'
```

Add `ignition,` to the destructured parameter list, and pass it at line 130:

```tsx
      <LogoStage
        onLive={onStageLive}
        onIntroPlayStart={onIntroPlayStart}
        separation={separation}
        ignition={ignition}
      />
```

- [ ] **Step 4: `RenderBlocks` — resolve it**

Add the import beside the existing one:

```tsx
import { resolveIgnition } from '../../lib/three/ignition/resolveIgnition'
```

Add the prop beside `separation`:

```tsx
                  ignition={resolveIgnition(effects)}
```

- [ ] **Step 5: Typecheck, verify and commit**

```bash
cd "D:/TAMPA TARUNO/WEBSITE/_WEB_PRODUCT" && npx tsc --noEmit && npm run verify:config
```

Then confirm SSR still renders on both locales:

```bash
npm run dev
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/en
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/id
```

Expected: `200` twice.

```bash
git add src/components
git commit -m "feat(ignition): wire ignition through the hero, retime onLive to cue"
```

---

### Task 8: Dev bench

**Files:**
- Create: `src/app/(frontend)/[locale]/dev/ignition/page.tsx`
- Create: `src/app/(frontend)/[locale]/dev/ignition/IgnitionLab.tsx`

**Interfaces:**
- Consumes: `resolveIgnition`, `toIgnitionPayload`, `DEFAULT_IGNITION`, and `LogoCanvas`.
- Produces: a tuning surface at `/[locale]/dev/ignition`.

Read `src/app/(frontend)/[locale]/dev/shatter/page.tsx` and `ShatterLab.tsx` first and follow them exactly — the `notFound()` production guard, the seed-from-CMS fetch, and the save-to-CMS POST are all established there and must not be reinvented.

- [ ] **Step 1: Create the route guard**

Create `src/app/(frontend)/[locale]/dev/ignition/page.tsx`, mirroring the shatter route's `page.tsx` exactly (including its `notFound()` when `process.env.NODE_ENV === 'production'`), but rendering `<IgnitionLab />`.

- [ ] **Step 2: Create the lab**

Create `IgnitionLab.tsx` following `ShatterLab.tsx`'s structure, with these differences:

1. Sliders for every field in `DEFAULT_IGNITION`, with ranges **matching the Payload `min`/`max` from Task 2 exactly** — a bench that can produce values the CMS rejects is worse than no bench.
2. A **"Replay ignition"** button. Ignition is one-shot, unlike the hold-triggered separation. Implement it by keying the `<LogoCanvas>` with a counter so a click remounts the engine:

```tsx
const [runId, setRunId] = useState(0)
// ...
<LogoCanvas key={runId} ignition={cfg} ignite config={DEFAULT_SEPARATION} />
// ...
<button onClick={() => setRunId((n) => n + 1)}>Replay ignition</button>
```

3. Save to CMS posting **both** slices, so saving from this bench cannot wipe the separation groups (the mirror image of the risk checked in Task 2 Step 4):

```tsx
const res = await fetch('/api/globals/hero-effects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(toIgnitionPayload(cfgRef.current)),
})
```

If Task 2 Step 4 found that partial updates DO wipe siblings, merge `toHeroEffectsPayload(separationCfg)` into that body as well.

- [ ] **Step 3: Verify the bench loads**

```bash
npm run dev
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/en/dev/ignition
```

Expected: `200`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(frontend)/[locale]/dev/ignition"
git commit -m "feat(ignition): dev tuning bench with replay"
```

---

### Task 9: Browser verification

**Files:**
- Create: `scratchpad/verify-ignition.mjs` (session scratchpad, **never** inside the app)

Use the session scratchpad directory, not the repo:
`C:\Users\user\AppData\Local\Temp\claude\D--TAMPA-TARUNO-WEBSITE\<session>\scratchpad`

`puppeteer-core` and `ffmpeg-static` are already installed there from the reference analysis.

- [ ] **Step 1: Contact-sheet the transition**

Write `verify-ignition.mjs` that launches headless Chrome via `puppeteer-core`, loads `http://localhost:3000/en`, and captures a screenshot every 80 ms from video-end for 2.6 s. Tile the frames into one sheet with `ffmpeg`:

```bash
node_modules/ffmpeg-static/ffmpeg.exe -y -framerate 1 -i shot-%03d.png \
  -vf "scale=420:-2,drawtext=fontfile='C\:/Windows/Fonts/arialbd.ttf':text='%{n}':x=6:y=6:fontsize=24:fontcolor=red:box=1:boxcolor=white@0.9,tile=6x6:padding=3:color=0x333333" \
  -frames:v 1 sheet-ignition.png
```

Read the sheet. **Assert visually:** a cold graphite cage is present at the start, red appears and travels outward, solid surfaces appear behind the front, and the cage is gone by the end. Single screenshots are not sufficient — the contact sheet is what caught two misreadings during the reference analysis.

- [ ] **Step 2: The regression test that matters most**

Reproduce the exact race the 2026-08-09 review found, adapted to ignition. Using `puppeteer-core` request interception, **stall only `logo.draco.glb` by 7 s**, then assert that `done` still fires and the logo ends up interactive.

**Stall only the `.glb`.** Stalling `draco_wasm_wrapper.js` or `draco_decoder.wasm` hangs DRACOLoader's own worker bootstrap and the logo never renders at all — that is a documented test artifact, not a product bug, and it cost the last session a false diagnosis.

Assert in-page:

```js
// after the stall clears
const armed = await page.evaluate(() => {
  // hold the logo and check the separation actually responds
  const c = document.querySelector('canvas')
  const r = c.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
```

then dispatch a hold at that point and confirm the logo separates. Expected: **it does** — `done` fired despite the slow load, so `armed` was set.

- [ ] **Step 3: Reduced motion**

Launch with `--force-prefers-reduced-motion` (or `page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])` before navigation) and assert the hero reaches the solid logo with no cage ever drawn, and that the floating words still appear — i.e. `cue`/`done` both fired.

- [ ] **Step 4: Record the results**

Save the sheets alongside the plan and note in the commit message which assertions passed. If any failed, fix and re-run before committing.

```bash
git commit -m "test(ignition): browser verification of the transition, draco stall and reduced motion" --allow-empty
```

---

---

## Scope extension (owner, 2026-08-09) — Tasks 11–14

Added after the owner saw Task 7's captured result. Spec §2b. Tasks 1–7 stand as built; these extend them.
Task 8 (bench) is deferred until after Task 13 so its sliders cover the new fields in one pass.

### Task 11: Morph targets in the cage shader

**Files:** Modify `src/lib/three/ignition/types.ts`, `resolveIgnition.ts`, `resolveIgnition.check.ts`,
`ignitionMaterial.ts`; `src/globals/HeroEffects.ts`; `src/seed/index.ts`.

**Interfaces produced:** `IgnitionConfig` gains the §4.6b fields; `IgnitionUniforms` gains
`uMorph`, `uBloom`, `uSphereR`, `uBloomR`, `uPolySides`, `uCentre`.

- [ ] **Step 1: Extend the check first** — add the 10 new fields to `PERTURBED` in
  `resolveIgnition.check.ts` and run it; it must FAIL with the fields missing from the config type.
- [ ] **Step 2:** Add the fields to `types.ts` / `resolveIgnition.ts` / the Payload global / the seed.
- [ ] **Step 3:** Run `npm run verify:config` — must pass, all fields round-tripping.
- [ ] **Step 4: Shape targets in the cage vertex shader.** No new attributes — every target is derived
  from `position` and `uCentre`:

```glsl
uniform vec3  uCentre;
uniform float uSphereR;     // logoRadius * SPHERE_SCALE
uniform float uBloomR;      // uSphereR * BLOOM_SCALE
uniform float uPolySides;   // 8
uniform float uBloom;       // 0 = sphere, 1 = bloomed polygon
uniform float uMorph;       // 0 = shaped, 1 = true logo position
uniform vec3  uSeed;
varying float vDist;

// Radius of a regular N-gon silhouette along a direction, inradius 1.
float tt_polyR(vec2 d, float N) {
  float a = atan(d.y, d.x);
  float seg = 6.28318530718 / N;
  float k = mod(a + seg * 0.5, seg) - seg * 0.5;
  return 1.0 / max(0.2, cos(k));
}

void main() {
  vec3 rel = position - uCentre;
  float len = max(1e-5, length(rel));
  vec3 dir = rel / len;
  // sphere target, then the bloomed N-gon target (polygonal in XY, kept round in Z)
  vec3 pSphere = uCentre + dir * uSphereR;
  vec3 pPoly   = uCentre + dir * (uBloomR * tt_polyR(normalize(rel.xy + vec2(1e-6)), uPolySides));
  vec3 shaped  = mix(pSphere, pPoly, uBloom);
  vec3 finalPos = mix(shaped, position, uMorph);

  vDist = distance(finalPos, uSeed);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
}
```

`vDist` is computed from the **morphed** position so the charge front tracks the cage wherever it currently
is, not where the logo will end up.

- [ ] **Step 5:** Typecheck, `npm run verify:config`, commit.

### Task 12: Overlay phase in the controller

**Files:** Modify `IgnitionController.ts`, `IgnitionController.check.ts`.

- [ ] **Step 1: Write the failing assertions first.** `startOverlay()` drives `uBloom` 0→1 across
  `BLOOM_START..BLOOM_END` and `uMorph` 0→1 from `MORPH_START`; `start()` called at the real video-end
  **snaps `uMorph` to 1** regardless of overlay progress; `done` still fires exactly once; `startOverlay()`
  is idempotent; `start()` without `startOverlay()` behaves exactly as it does today (uMorph 1, uBloom 0).
- [ ] **Step 2:** Implement, run the check, commit.

### Task 13: Wire the overlay to the video, and hold pulses

**Files:** Modify `SketchIntro.tsx`, `LogoStage.tsx`, `LogoCanvas.tsx`, `LogoEngine.ts`,
`IgnitionController.ts`.

- [ ] **Step 1:** `SketchIntro` gains `onNearEnd`, fired once when
  `currentTime >= duration - OVERLAY_LEAD_MS/1000`. Guard for `duration` being `NaN` while metadata is still
  loading, and fall back to firing at `loadedmetadata + (duration - lead)` if `timeupdate` is throttled.
- [ ] **Step 2:** Thread it: `LogoStage` calls `startOverlay()` on that signal and `startIgnition()` at
  video end as now.
- [ ] **Step 3: Stop disposing the cage at `done`** (spec §2b.3). `teardownIgnition()` hides it
  (`uGlobalFade = 0`) and returns the dark mass; the geometry and material are freed only in `dispose()`.
- [ ] **Step 4: Pulses.** `ShatterController` already knows when panels begin to move
  (`charge >= SEPARATE_START`). Add `IgnitionController.pulse()` — a charge-only run of `PULSE_MS` with the
  wake forced off (`uWakeActive = 0`) — and have `LogoEngine.tick()` fire it at `SEPARATE_START` and every
  `PULSE_MS` thereafter while `holding` is true. Pulses must not emit `seed`/`cue`/`done`; those belong to
  the one-shot bridge and `armed`/`onLive` hang off them.
- [ ] **Step 5:** Verify with the puppeteer harness: capture the bridge, then capture a 3 s hold and confirm
  repeated pulses with no surface materialization. Commit.

### Task 14: Bench coverage for the new fields

Fold into Task 8 — sliders for every §4.6b field, plus buttons to replay the overlay and to fire a single
pulse in isolation.

---

### Task 10 (CONDITIONAL): Kling video track

**Do not start this task until the owner has seen Task 9's contact sheets and explicitly asks for it.** Per spec §5.3 the whole point of sequencing is that a satisfying live track costs **zero credits**. 128 credits available; per-job cost is not exposed by the API.

**Files:**
- Create: `_ASSETS/video/GENERATE-IGNITION-ON-KLING.md` (prompt + decisions log, following `GENERATE-ON-KINGAI.md`)

- [ ] **Step 1: Extract the two anchor frames**

`first_image` — the existing master's final frame:

```bash
cd "D:/TAMPA TARUNO/WEBSITE" && node_modules/ffmpeg-static/ffmpeg.exe -y -sseof -0.1 \
  -i _ASSETS/video/sketch-draw-3d-16x9.mp4 -frames:v 1 ignition-first.png
```

`tail_image` — a render of the live mesh at rest, captured with the Task 9 harness at 1920×1080 once the logo has settled and before any cursor deflection.

- [ ] **Step 2: Confirm the spend with the owner**

Report both frames and the exact call about to be made. **Wait for explicit approval.** Do not submit a trial job.

- [ ] **Step 3: Upload and generate**

Upload both frames with `file_upload` (local paths are rejected by `image_to_video`), then submit **one** job:

```
model: kling-video-v3_0
duration: 3
imageCount: 1
resolution: 1080p
enable_audio: false
first_image: <uploaded first frame url>
tail_image:  <uploaded tail frame url>
prompt: <written against the finished live effect — describe the red charge
         travelling outward through a dark pencil wireframe of the mark, the
         solid logo forming behind it, on warm paper>
```

- [ ] **Step 4: If it misses, stop**

Report what came back and discuss before spending again. Do not iterate silently.

- [ ] **Step 5: Integrate (only if the owner picks this track)**

Trim to ~2 s, concatenate onto the master, re-encode all three shipped files, then handle the knock-ons from spec §5.4: the poster is the final frame **and** the OG image; `HEIGHT_FRAC`/`CENTER_Y` must be re-verified against the new final frame; `SketchIntro`'s mobile CSS constants derive from those ratios.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3.1 phases, fractional boundaries | 1 (types), 5 (controller) |
| §3.2 palette | 1, 4 |
| §3.3 dark mass + `buildInnerBody` change | 6 (steps 2, 5) |
| §3.4 `WireframeGeometry` + subsample | 3 |
| §3.5 no per-vertex attributes, build in `load()`, dispose at `done` | 4, 6 |
| §4.1 parallel module | 1, 3, 4, 5 |
| §4.2 data flow, required prop | 7 |
| §4.3 `startIgnition` intent recording | 6 (step 4) |
| §4.4 signal rewiring | 7 (steps 1, 2) |
| §4.5 failure modes | 5 (`finishNow`), 6 (`emitImmediateDone`), 7 (reduced motion), 9 (draco stall) |
| §4.6 config table | 1, 2 |
| §4.7 bench with replay | 8 |
| §5 video track | 10 |
| §6 verification | 1, 3, 5 (checks), 9 (browser) |

**Placeholder scan:** the only deliberately open item is Task 10 Step 3's `prompt`, which cannot be written until the live effect exists — that is the spec's stated sequencing, and the step says so explicitly. Task 8 Step 2 defers to the existing `ShatterLab.tsx` rather than restating it, which is the codebase-pattern instruction the plan's constraints require.

**Type consistency:** `IgnitionConfig` field names are identical across `types.ts`, `resolveIgnition.ts`, the Payload groups, the seed and the check scripts. `IgnitionUniforms` keys used in `ignitionMaterial.ts` and `IgnitionController.ts` match their `types.ts` declaration. `buildIgnitionCage(source, config, density, material)` is called with exactly that signature in Task 6. `IgnitionEvent` is `'seed' | 'cue' | 'done'` everywhere.

**Known risk carried into execution — RESOLVED 2026-08-09.** Task 4 anchors the skin patch on
`#include <alphatest_fragment>`. Verified against three r185's `matcap` shader before writing the patch: the
vertex stage has `<common>` and `<begin_vertex>`; the fragment stage has `<common>` and
`<alphatest_fragment>`, with `vec4 diffuseColor` declared before it. The documented fallbacks were not
needed.

Task 4 also gained a check script the plan did not originally call for
(`ignitionMaterial.check.ts`), because the onBeforeCompile clobber is the branch's biggest hazard and
`onBeforeCompile` is a pure string transform — so it can be driven against three's real shader source with
no WebGL context. It asserts that shatter's hatch, wash, displacement and uniforms all survive composition,
**and** carries a negative control proving those assertions fail when the patch assigns instead of composing.
