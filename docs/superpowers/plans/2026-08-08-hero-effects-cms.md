# Hero Effects CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the hero logo separation parameters out of code constants into a `hero-effects` Payload global, arm the effect on the live homepage hero, and let the dev bench write tuned values straight back to the CMS.

**Architecture:** The mutable `SHATTER` singleton is replaced by a frozen `DEFAULT_SEPARATION` plus a `SeparationConfig` object threaded explicitly from `RenderBlocks` (server) down through `HeroBlock → LogoStage → LogoCanvas → LogoEngine`, and onward into `partitionForShatter` and `patchForShatter`. A `resolveSeparation()` pure function merges CMS values over the defaults.

**Tech Stack:** Next.js 15.4 App Router · Payload CMS 3 (SQLite in dev) · three.js 0.185 · TypeScript 5.7 · tsx for scripts

**Spec:** `docs/superpowers/specs/2026-08-08-hero-effects-cms-design.md`

## Global Constraints

- **No test runner exists in this repo.** devDependencies contain no vitest/jest/playwright. Do **not** add one. Verification is: `npx tsc --noEmit`, SSR `curl` on both locales, `npm run seed:verify`, the tsx assertion script added in Task 1, and the puppeteer harness in the session scratchpad.
- **three.js `^0.185.1`** — shader chunk names `<common>`, `<beginnormal_vertex>`, `<begin_vertex>`, `<opaque_fragment>` are valid for this version.
- **DB adapter is isolated to `src/payload.config.ts` only.** Do not reference sqlite/postgres anywhere else.
- **Dev bench must remain unreachable in production** — `src/app/(frontend)/[locale]/dev/shatter/page.tsx` calls `notFound()` when `process.env.NODE_ENV === 'production'`. Never remove that guard.
- **`unstable_cache` persists to disk** at `.next/cache/fetch-cache/` and survives dev-server restarts. `revalidateTag` is a no-op outside a Next request context, so seed scripts cannot invalidate. After seeding, run `rm -rf .next/cache`.
- **Never run `npm run build` while `next dev` is running** on the same `.next` directory — it corrupts module resolution. If every route starts returning a `JSON.parse` SyntaxError at an identical byte offset (including `/favicon.ico`), that is a corrupted `.next`: stop the server, `rm -rf .next`, restart.
- **Bilingual EN/ID.** The `hero-effects` global is **not** localized — its values are numbers, identical in both locales.
- **Atelier appearance only.** No dark palette, no sound.
- **Working tree is `D:\TAMPA TARUNO\WEBSITE\_WEB_PRODUCT`.** A stale duplicate exists at `C:\Users\user\OneDrive\TAMPA TARUNO\WEBSITE` — do not edit it.
- **Commit after every task**, and push to `origin main` (https://github.com/prabu-yudhistira/TT-WEB).

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/three/shatter/types.ts` | *Modify* — frozen `DEFAULT_SEPARATION`, `SeparationConfig` type. `SHATTER` deleted. |
| `src/lib/three/shatter/resolveSeparation.ts` | *Create* — CMS ⇄ config mapping, both directions |
| `src/lib/three/shatter/resolveSeparation.check.ts` | *Create* — tsx assertion script for the above |
| `src/globals/HeroEffects.ts` | *Create* — the Payload global |
| `src/payload.config.ts` | *Modify* — register the global |
| `src/lib/cms.ts` | *Modify* — `getHeroEffects()` |
| `src/seed/index.ts` | *Modify* — seed defaults |
| `src/lib/three/shatter/partition.ts` | *Modify* — take config as a parameter |
| `src/lib/three/shatter/shatterMaterial.ts` | *Modify* — take config as a parameter |
| `src/lib/three/LogoEngine.ts` | *Modify* — accept config, honour `separationEnabled` |
| `src/components/three/LogoCanvas.tsx` | *Modify* — accept `config` and `armed` |
| `src/components/hero/LogoStage.tsx` | *Modify* — forward config, pass `armed` |
| `src/components/blocks/HeroBlock.tsx` | *Modify* — accept and forward config |
| `src/components/blocks/RenderBlocks.tsx` | *Modify* — fetch the global for the hero case |
| `src/app/(frontend)/[locale]/dev/shatter/page.tsx` | *Modify* — fetch global, pass to lab |
| `src/app/(frontend)/[locale]/dev/shatter/ShatterLab.tsx` | *Modify* — local mutable copy, Save to CMS |

---

### Task 1: SeparationConfig, frozen defaults, and the resolver

**Files:**
- Modify: `src/lib/three/shatter/types.ts`
- Create: `src/lib/three/shatter/resolveSeparation.ts`
- Create: `src/lib/three/shatter/resolveSeparation.check.ts`
- Modify: `package.json` (add `verify:config` script)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `SeparationConfig` (type), `DEFAULT_SEPARATION: Readonly<SeparationConfig>`, `resolveSeparation(cms: HeroEffectsInput | null | undefined): SeparationConfig`, `toHeroEffectsPayload(config: SeparationConfig): HeroEffectsInput`, and the `HeroEffectsInput` shape (a hand-written structural type so this task does not depend on generated Payload types).

- [ ] **Step 1: Write the failing assertion script**

Create `src/lib/three/shatter/resolveSeparation.check.ts`:

```ts
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
```

- [ ] **Step 2: Add the npm script**

In `package.json`, inside `"scripts"`, after the `seed:verify` line:

```json
    "verify:config": "node --import tsx src/lib/three/shatter/resolveSeparation.check.ts"
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npm run verify:config
```

Expected: FAIL — module `./resolveSeparation` cannot be resolved (it does not exist yet).

- [ ] **Step 4: Convert `SHATTER` into frozen defaults plus a type**

In `src/lib/three/shatter/types.ts`, replace the line `export const SHATTER = {` with:

```ts
export type SeparationConfig = {
  ENABLED: boolean
  CHARGE_MS: number
  REFORM_MS: number
  DRAG_THRESHOLD_PX: number
  SEPARATE_START: number
  STAGGER_MAX: number
  CAP_NORMAL_MIN: number
  SPREAD_FRAC: number
  SPREAD_VAR: number
  LATERAL_DRIFT: number
  SPIN_MIN: number
  SPIN_MAX: number
  NORMAL_FOLLOW: number
  HATCH_STRENGTH: number
  HATCH_SCALE: number
  SHINE_STRENGTH: number
  SHINE_WIDTH: number
  SHINE_SPEED: number
  SHINE_CHARGE_BOOST: number
  SHINE_WARM: number
  SHINE_BRIGHT: number
  VIBRATE_FRAC: number
  VIBRATE_PHASE_STEP: number
  SCROLL_DISARM_FRAC: number
  SKIN_OPACITY: number
  BODY_OPACITY: number
  BODY_EDGE_OPACITY: number
  BODY_EDGE_ANGLE: number
}

export const DEFAULT_SEPARATION: Readonly<SeparationConfig> = Object.freeze({
  ENABLED: true,
```

Then change the closing `}` of that object literal to `})`, and **delete the `SHATTER` name entirely** — nothing may import it after Task 2. Keep every existing comment and every existing value unchanged; the only additions are the `ENABLED: true` entry and the freeze.

- [ ] **Step 5: Write the resolver**

Create `src/lib/three/shatter/resolveSeparation.ts`:

```ts
import { DEFAULT_SEPARATION, type SeparationConfig } from './types'

/**
 * Structural shape of the `hero-effects` global. Written by hand rather than
 * imported from payload-types so this module compiles before the global exists
 * and does not break if generated types are stale. Every field is optional and
 * nullable because Payload returns nulls for never-saved fields.
 */
export type HeroEffectsInput = {
  separationEnabled?: boolean | null
  timing?: {
    chargeMs?: number | null
    reformMs?: number | null
    separateStart?: number | null
    staggerMax?: number | null
  } | null
  motion?: {
    spreadFrac?: number | null
    spreadVar?: number | null
    lateralDrift?: number | null
    spinMin?: number | null
    spinMax?: number | null
    capNormalMin?: number | null
  } | null
  material?: {
    normalFollow?: number | null
    hatchStrength?: number | null
    hatchScale?: number | null
    shineStrength?: number | null
    shineWidth?: number | null
    shineSpeed?: number | null
    shineChargeBoost?: number | null
    shineWarm?: string | null
    shineBright?: string | null
  } | null
  body?: {
    skinOpacity?: number | null
    bodyOpacity?: number | null
    bodyEdgeOpacity?: number | null
    bodyEdgeAngle?: number | null
  } | null
  feel?: {
    vibrateFrac?: number | null
    vibratePhaseStep?: number | null
    dragThresholdPx?: number | null
  } | null
}

const HEX = /^#[0-9a-fA-F]{6}$/

const num = (v: number | null | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const hexToInt = (v: string | null | undefined, fallback: number): number =>
  typeof v === 'string' && HEX.test(v) ? parseInt(v.slice(1), 16) : fallback

const intToHex = (v: number): string => `#${v.toString(16).padStart(6, '0').toUpperCase()}`

/**
 * Merges CMS values over the frozen defaults. Anything null/undefined — a
 * never-saved global, or a field added in a later release — falls back.
 */
export function resolveSeparation(cms: HeroEffectsInput | null | undefined): SeparationConfig {
  const d = DEFAULT_SEPARATION
  const t = cms?.timing ?? {}
  const m = cms?.motion ?? {}
  const mat = cms?.material ?? {}
  const b = cms?.body ?? {}
  const f = cms?.feel ?? {}

  let spinMin = num(m.spinMin, d.SPIN_MIN)
  let spinMax = num(m.spinMax, d.SPIN_MAX)
  // The bench makes it easy to drag min above max; the range is arithmetically
  // identical either way, but store it so the field names stay honest.
  if (spinMin > spinMax) [spinMin, spinMax] = [spinMax, spinMin]

  return {
    ENABLED: typeof cms?.separationEnabled === 'boolean' ? cms.separationEnabled : d.ENABLED,
    CHARGE_MS: num(t.chargeMs, d.CHARGE_MS),
    REFORM_MS: num(t.reformMs, d.REFORM_MS),
    SEPARATE_START: num(t.separateStart, d.SEPARATE_START),
    STAGGER_MAX: num(t.staggerMax, d.STAGGER_MAX),
    SPREAD_FRAC: num(m.spreadFrac, d.SPREAD_FRAC),
    SPREAD_VAR: num(m.spreadVar, d.SPREAD_VAR),
    LATERAL_DRIFT: num(m.lateralDrift, d.LATERAL_DRIFT),
    SPIN_MIN: spinMin,
    SPIN_MAX: spinMax,
    CAP_NORMAL_MIN: num(m.capNormalMin, d.CAP_NORMAL_MIN),
    NORMAL_FOLLOW: num(mat.normalFollow, d.NORMAL_FOLLOW),
    HATCH_STRENGTH: num(mat.hatchStrength, d.HATCH_STRENGTH),
    HATCH_SCALE: num(mat.hatchScale, d.HATCH_SCALE),
    SHINE_STRENGTH: num(mat.shineStrength, d.SHINE_STRENGTH),
    SHINE_WIDTH: num(mat.shineWidth, d.SHINE_WIDTH),
    SHINE_SPEED: num(mat.shineSpeed, d.SHINE_SPEED),
    SHINE_CHARGE_BOOST: num(mat.shineChargeBoost, d.SHINE_CHARGE_BOOST),
    SHINE_WARM: hexToInt(mat.shineWarm, d.SHINE_WARM),
    SHINE_BRIGHT: hexToInt(mat.shineBright, d.SHINE_BRIGHT),
    SKIN_OPACITY: num(b.skinOpacity, d.SKIN_OPACITY),
    BODY_OPACITY: num(b.bodyOpacity, d.BODY_OPACITY),
    BODY_EDGE_OPACITY: num(b.bodyEdgeOpacity, d.BODY_EDGE_OPACITY),
    BODY_EDGE_ANGLE: num(b.bodyEdgeAngle, d.BODY_EDGE_ANGLE),
    VIBRATE_FRAC: num(f.vibrateFrac, d.VIBRATE_FRAC),
    VIBRATE_PHASE_STEP: num(f.vibratePhaseStep, d.VIBRATE_PHASE_STEP),
    DRAG_THRESHOLD_PX: num(f.dragThresholdPx, d.DRAG_THRESHOLD_PX),
    SCROLL_DISARM_FRAC: d.SCROLL_DISARM_FRAC,
  }
}

/** Inverse mapping, used by the dev bench's Save to CMS button. */
export function toHeroEffectsPayload(c: SeparationConfig): HeroEffectsInput {
  return {
    separationEnabled: c.ENABLED,
    timing: {
      chargeMs: c.CHARGE_MS,
      reformMs: c.REFORM_MS,
      separateStart: c.SEPARATE_START,
      staggerMax: c.STAGGER_MAX,
    },
    motion: {
      spreadFrac: c.SPREAD_FRAC,
      spreadVar: c.SPREAD_VAR,
      lateralDrift: c.LATERAL_DRIFT,
      spinMin: c.SPIN_MIN,
      spinMax: c.SPIN_MAX,
      capNormalMin: c.CAP_NORMAL_MIN,
    },
    material: {
      normalFollow: c.NORMAL_FOLLOW,
      hatchStrength: c.HATCH_STRENGTH,
      hatchScale: c.HATCH_SCALE,
      shineStrength: c.SHINE_STRENGTH,
      shineWidth: c.SHINE_WIDTH,
      shineSpeed: c.SHINE_SPEED,
      shineChargeBoost: c.SHINE_CHARGE_BOOST,
      shineWarm: intToHex(c.SHINE_WARM),
      shineBright: intToHex(c.SHINE_BRIGHT),
    },
    body: {
      skinOpacity: c.SKIN_OPACITY,
      bodyOpacity: c.BODY_OPACITY,
      bodyEdgeOpacity: c.BODY_EDGE_OPACITY,
      bodyEdgeAngle: c.BODY_EDGE_ANGLE,
    },
    feel: {
      vibrateFrac: c.VIBRATE_FRAC,
      vibratePhaseStep: c.VIBRATE_PHASE_STEP,
      dragThresholdPx: c.DRAG_THRESHOLD_PX,
    },
  }
}
```

- [ ] **Step 6: Run the checks — expect PASS**

```bash
npm run verify:config
```

Expected: every line prefixed `ok`, then `All config checks passed.`, exit 0.

Note: `SCROLL_DISARM_FRAC` is intentionally not CMS-editable (it is a safety gate, not a look), so it always comes from defaults and round-trips trivially.

- [ ] **Step 7: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exits 0. Existing imports of `SHATTER` will now fail — that is expected and is fixed in Task 2. If you prefer a green tree at every step, do Task 2 before committing; otherwise commit now and treat Tasks 1+2 as one reviewable unit.

- [ ] **Step 8: Commit**

```bash
git add src/lib/three/shatter/types.ts src/lib/three/shatter/resolveSeparation.ts src/lib/three/shatter/resolveSeparation.check.ts package.json
git commit -m "feat(hero): frozen separation defaults + CMS config resolver"
```

---

### Task 2: Thread config through the engine, delete the singleton

**Files:**
- Modify: `src/lib/three/shatter/partition.ts`
- Modify: `src/lib/three/shatter/shatterMaterial.ts`
- Modify: `src/lib/three/LogoEngine.ts`
- Modify: `src/app/(frontend)/[locale]/dev/shatter/ShatterLab.tsx`

**Interfaces:**
- Consumes: `SeparationConfig`, `DEFAULT_SEPARATION` from Task 1
- Produces: `partitionForShatter(root: THREE.Object3D, config: SeparationConfig, seedValue?: number): PartitionResult` · `makeShatterUniforms(center: THREE.Vector3, spread: number, config: SeparationConfig): ShatterUniforms` · `patchForShatter(material: THREE.Material, u: ShatterUniforms, config: SeparationConfig): void` · `new LogoEngine(canvas: HTMLCanvasElement, config?: SeparationConfig)`

- [ ] **Step 1: Make `partition.ts` take config**

Replace the import line `import { SHATTER, mulberry32 } from './types'` with:

```ts
import { mulberry32, type SeparationConfig } from './types'
```

Change the signature to:

```ts
export function partitionForShatter(
  root: THREE.Object3D,
  config: SeparationConfig,
  seedValue = 0x7a3b1c,
): PartitionResult {
```

Then replace every `SHATTER.` in the file body with `config.`. The properties referenced are `SPIN_MIN`, `SPIN_MAX`, `SEPARATE_START`, `STAGGER_MAX`, `SPREAD_VAR`, `LATERAL_DRIFT` (all in the panel-construction loop) and `CAP_NORMAL_MIN` (in the cap-vs-side-band classification). Confirm none remain with `grep -n "SHATTER" src/lib/three/shatter/partition.ts` — expect no output.

- [ ] **Step 2: Make `shatterMaterial.ts` take config**

Replace `import { SHATTER, type ShatterUniforms } from './types'` with:

```ts
import { type SeparationConfig, type ShatterUniforms } from './types'
```

Change both exported signatures:

```ts
export function makeShatterUniforms(
  center: THREE.Vector3,
  spread: number,
  config: SeparationConfig,
): ShatterUniforms {
```

```ts
export function patchForShatter(
  material: THREE.Material,
  u: ShatterUniforms,
  config: SeparationConfig,
) {
```

Inside `makeShatterUniforms`, replace every `SHATTER.` with `config.`.

**Then gate the vertex half of the patch on `config.ENABLED`.** Per spec §7, disabling the interaction must keep the hatch, light wash, glass skin and wireframe body — only the displacement goes away. Inside `onBeforeCompile`, keep the uniform assignment and the *fragment* patch unconditional, then insert this **before** the `shader.vertexShader = …` chain:

```ts
    // Vertex displacement only when the interaction is on. When it is off we
    // skip partitioning, so aOrigin/aAxis/aDir/aParams do not exist — and a
    // DISABLED vertex attribute defaults to (0, 0, 0, 1), not zeros. That would
    // give aParams.w = 1 (displacement active) while aAxis is zero-length,
    // producing NaN from the Rodrigues normalize. Skipping the injection is the
    // only safe option; relying on attribute defaults is not.
    if (!config.ENABLED) return
```

- [ ] **Step 3: Make `LogoEngine` accept config**

In `src/lib/three/LogoEngine.ts`, change the import:

```ts
import { DEFAULT_SEPARATION, type SeparationConfig, type ShatterEvent, type ShatterUniforms } from './shatter/types'
```

Change the constructor signature from `constructor(private canvas: HTMLCanvasElement) {` to:

```ts
  constructor(
    private canvas: HTMLCanvasElement,
    private config: SeparationConfig = DEFAULT_SEPARATION,
  ) {
```

In `load()`, keep the branch condition as `if (this.interactive) {` — the material work must still run when the interaction is disabled. Replace the body of that branch with:

```ts
      const body = this.buildInnerBody(group)

      // Partition only when the interaction is on: it costs ~2.8 MB of vertex
      // attributes. uCenter/uSpread are read solely by the vertex patch, which
      // is skipped in the same case, so the zero fallbacks are never sampled.
      const part = this.config.ENABLED ? partitionForShatter(group, this.config) : null
      const u = makeShatterUniforms(
        part?.center ?? new THREE.Vector3(),
        part ? part.height * this.config.SPREAD_FRAC : 0,
        this.config,
      )

      Object.values(set).forEach((m) => {
        // The skin is glass: sheer, and both sides visible as panels turn.
        m.side = THREE.DoubleSide
        m.transparent = true
        m.opacity = this.config.SKIN_OPACITY
        m.depthWrite = false
        patchForShatter(m, u, this.config)
      })

      // skin draws over the body; body surfaces under their own edges
      group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.renderOrder = 2
      })
      // parented to the group, so it inherits the idle spin, tilt and shake
      group.add(body)
      this.shatterUniforms = u

      // No controller when disabled — nothing can charge, so nothing can move.
      if (part) {
        this.shatter = new ShatterController(u, heightFrac * visH, this.config)
      }
```

Inside `buildInnerBody`, replace every `SHATTER.` with `this.config.`.

- [ ] **Step 4: Make `ShatterController` take config**

In `src/lib/three/shatter/ShatterController.ts`, change the import to:

```ts
import { DEFAULT_SEPARATION, type SeparationConfig, type ShatterEvent, type ShatterUniforms } from './types'
```

Change the constructor to:

```ts
  constructor(
    private u: ShatterUniforms,
    private logoHeight: number,
    private config: SeparationConfig = DEFAULT_SEPARATION,
  ) {}
```

Replace every `SHATTER.` in the file with `this.config.` — occurrences are `VIBRATE_FRAC`, `SCROLL_DISARM_FRAC`, `DRAG_THRESHOLD_PX` (twice, in the squared comparison), `CHARGE_MS`, `REFORM_MS`, `VIBRATE_PHASE_STEP`.

- [ ] **Step 5: Give the bench its own mutable copy**

In `ShatterLab.tsx`, replace the import of `SHATTER` with:

```ts
import { DEFAULT_SEPARATION, type SeparationConfig } from '@/lib/three/shatter/types'
```

Add, immediately inside the component:

```ts
  // The bench owns a mutable copy; nothing global is mutated any more.
  const cfgRef = useRef<SeparationConfig>({ ...DEFAULT_SEPARATION })
```

Replace every read of `SHATTER[r.key]` with `cfgRef.current[r.key]`, every write `SHATTER[r.key] = parseFloat(...)` with `cfgRef.current[r.key] = parseFloat(...)`, and the two colour handlers likewise. Pass the copy to the engine:

```ts
    const engine = new LogoEngine(canvas, cfgRef.current)
```

Update the `Row` type from `keyof typeof SHATTER` to:

```ts
type Row = {
  key: Exclude<keyof SeparationConfig, 'ENABLED' | 'SHINE_WARM' | 'SHINE_BRIGHT'>
  label: string
  min: number
  max: number
  step: number
}
```

and the colour list to `const COLORS = [['SHINE_WARM', 'Shine warm'], ['SHINE_BRIGHT', 'Shine hot']] as const`.

- [ ] **Step 6: Verify no reference to the singleton survives**

```bash
grep -rn "SHATTER" src/ | grep -v "DEFAULT_SEPARATION"
```

Expected: **no output**. Any hit is a missed call site.

- [ ] **Step 7: Typecheck and re-run config checks**

```bash
npx tsc --noEmit && npm run verify:config
```

Expected: both exit 0.

- [ ] **Step 8: Verify the bench still works**

Start the dev server via the preview tooling (never `npm run dev` in a raw shell), then from the session scratchpad:

```bash
node verify-sheet.mjs
```

Expected: `samples` ramp 0→1, `held: 1`, `after` decaying toward 0, `errors: []`. The rendered contact sheet must look the same as before this task — this is a pure refactor.

- [ ] **Step 9: Commit**

```bash
git add src/lib/three src/app
git commit -m "refactor(hero): thread separation config explicitly, drop mutable singleton"
```

---

### Task 3: The `hero-effects` global

**Files:**
- Create: `src/globals/HeroEffects.ts`
- Modify: `src/payload.config.ts`
- Modify: `src/seed/index.ts`
- Modify: `src/payload-types.ts` (generated — commit the result)

**Interfaces:**
- Consumes: nothing from earlier tasks (the global is standalone; the field names must match `HeroEffectsInput` from Task 1 exactly)
- Produces: Payload global slug `'hero-effects'`; generated type `HeroEffect` in `payload-types.ts`

- [ ] **Step 1: Create the global**

Create `src/globals/HeroEffects.ts`:

```ts
import type { GlobalConfig } from 'payload'
import { globalRevalidateHook } from '../lib/revalidate'

// Payload has no native colour field; validate a 6-digit hex string instead.
const hexColour = (value: unknown) =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
    ? true
    : 'Use a 6-digit hex colour, e.g. #B4571C'

/**
 * Physics and material settings for the hero logo separation.
 * NOT localized — these are numbers, identical in EN and ID.
 * Ranges mirror the dev bench sliders at /[locale]/dev/shatter and are enforced
 * by Payload on the REST API as well as in the admin UI.
 */
export const HeroEffects: GlobalConfig = {
  slug: 'hero-effects',
  label: 'Hero Effects',
  access: { read: () => true },
  hooks: { afterChange: [globalRevalidateHook('hero-effects')] },
  fields: [
    {
      name: 'separationEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Lets visitors press and hold the logo to pull it apart. Turning this off keeps the glass look, hatching and light wash — it only disables the interaction.',
      },
    },
    {
      name: 'timing',
      type: 'group',
      admin: { description: 'How long the charge and the reassembly take' },
      fields: [
        { name: 'chargeMs', type: 'number', defaultValue: 950, min: 300, max: 4000 },
        { name: 'reformMs', type: 'number', defaultValue: 2500, min: 100, max: 2500 },
        {
          name: 'separateStart',
          type: 'number',
          defaultValue: 0.65,
          min: 0,
          max: 0.9,
          admin: { description: 'Fraction of the charge that passes before anything moves' },
        },
        { name: 'staggerMax', type: 'number', defaultValue: 0.2, min: 0, max: 0.5 },
      ],
    },
    {
      name: 'motion',
      type: 'group',
      admin: { description: 'How far and how the six faces travel' },
      fields: [
        {
          name: 'spreadFrac',
          type: 'number',
          defaultValue: 1.6,
          min: 0,
          max: 2,
          admin: {
            description:
              'Drift distance as a multiple of logo height. Above ~1.0 the faces leave the screen before you can watch them.',
          },
        },
        { name: 'spreadVar', type: 'number', defaultValue: 0.8, min: 0, max: 0.9 },
        { name: 'lateralDrift', type: 'number', defaultValue: 0.75, min: 0, max: 1.5 },
        { name: 'spinMin', type: 'number', defaultValue: 0.18, min: 0, max: 1 },
        { name: 'spinMax', type: 'number', defaultValue: 0.21, min: 0, max: 1.5 },
        {
          name: 'capNormalMin',
          type: 'number',
          defaultValue: 0.79,
          min: 0.5,
          max: 0.99,
          admin: { description: 'Cutoff deciding whether a surface is a flat face or a side wall' },
        },
      ],
    },
    {
      name: 'material',
      type: 'group',
      admin: { description: 'Pencil hatching and the sweeping light wash' },
      fields: [
        { name: 'normalFollow', type: 'number', defaultValue: 0.55, min: 0, max: 1 },
        { name: 'hatchStrength', type: 'number', defaultValue: 0.65, min: 0, max: 1 },
        {
          name: 'hatchScale',
          type: 'number',
          defaultValue: 0.5,
          min: 0.5,
          max: 4,
          admin: { description: 'Higher = coarser strokes, lower = denser' },
        },
        { name: 'shineStrength', type: 'number', defaultValue: 0.3, min: 0, max: 1 },
        { name: 'shineWidth', type: 'number', defaultValue: 0.05, min: 0.05, max: 1 },
        { name: 'shineSpeed', type: 'number', defaultValue: 0.9, min: 0, max: 3 },
        { name: 'shineChargeBoost', type: 'number', defaultValue: 1, min: 0, max: 4 },
        {
          name: 'shineWarm',
          type: 'text',
          defaultValue: '#B4571C',
          validate: hexColour,
          admin: { description: 'Warm end of the light wash, 6-digit hex' },
        },
        {
          name: 'shineBright',
          type: 'text',
          defaultValue: '#FFF8E0',
          validate: hexColour,
          admin: { description: 'Hot end of the light wash, 6-digit hex' },
        },
      ],
    },
    {
      name: 'body',
      type: 'group',
      admin: { description: 'The glass skin and the ghost logo left behind' },
      fields: [
        {
          name: 'skinOpacity',
          type: 'number',
          defaultValue: 0.6,
          min: 0.05,
          max: 1,
          admin: {
            description:
              'Below ~0.5 the black and red wash out against the paper background.',
          },
        },
        {
          name: 'bodyOpacity',
          type: 'number',
          defaultValue: 0,
          min: 0,
          max: 1,
          admin: { description: 'At 0 only the wireframe outline of the ghost logo is drawn' },
        },
        { name: 'bodyEdgeOpacity', type: 'number', defaultValue: 0.9, min: 0, max: 1 },
        {
          name: 'bodyEdgeAngle',
          type: 'number',
          defaultValue: 26,
          min: 1,
          max: 60,
          admin: { description: 'Degrees. Lower draws more edges and gets noisy quickly.' },
        },
      ],
    },
    {
      name: 'feel',
      type: 'group',
      admin: { description: 'Shake while charging, and drag sensitivity' },
      fields: [
        { name: 'vibrateFrac', type: 'number', defaultValue: 0.006, min: 0, max: 0.05 },
        { name: 'vibratePhaseStep', type: 'number', defaultValue: 1.1, min: 0, max: 3 },
        {
          name: 'dragThresholdPx',
          type: 'number',
          defaultValue: 6,
          min: 2,
          max: 20,
          admin: { description: 'Pointer travel that turns a hold into a drag' },
        },
      ],
    },
  ],
}
```

- [ ] **Step 2: Register it**

In `src/payload.config.ts`, add the import after the `SiteSettings` import:

```ts
import { HeroEffects } from './globals/HeroEffects'
```

and change `globals: [SiteSettings],` to:

```ts
  globals: [SiteSettings, HeroEffects],
```

- [ ] **Step 3: Seed defaults**

In `src/seed/index.ts`, immediately after the closing `})` of the `site-settings` `locale: 'id'` update, insert:

```ts
  // --- hero effects (not localized) ---
  await payload.updateGlobal({
    slug: 'hero-effects',
    data: {
      separationEnabled: true,
      timing: { chargeMs: 950, reformMs: 2500, separateStart: 0.65, staggerMax: 0.2 },
      motion: {
        spreadFrac: 1.6,
        spreadVar: 0.8,
        lateralDrift: 0.75,
        spinMin: 0.18,
        spinMax: 0.21,
        capNormalMin: 0.79,
      },
      material: {
        normalFollow: 0.55,
        hatchStrength: 0.65,
        hatchScale: 0.5,
        shineStrength: 0.3,
        shineWidth: 0.05,
        shineSpeed: 0.9,
        shineChargeBoost: 1,
        shineWarm: '#B4571C',
        shineBright: '#FFF8E0',
      },
      body: { skinOpacity: 0.6, bodyOpacity: 0, bodyEdgeOpacity: 0.9, bodyEdgeAngle: 26 },
      feel: { vibrateFrac: 0.006, vibratePhaseStep: 1.1, dragThresholdPx: 6 },
    },
  })
```

- [ ] **Step 4: Regenerate types**

Stop the dev server first, then:

```bash
npm run generate:types
```

Expected: `src/payload-types.ts` gains a `HeroEffect` interface with the five groups. If the sqlite adapter prints an interactive `DATA LOSS WARNING` and appears to hang, that is the documented schema-prompt trap — adding a global should be purely additive, but if it does hang, delete `tampa-taruno.db`, restart, and re-seed.

- [ ] **Step 5: Seed and verify**

```bash
npm run seed && npm run seed:verify && rm -rf .next/cache
```

Expected: `seed:verify` prints its usual JSON without error. The `.next/cache` removal is required — `revalidateTag` cannot fire from a seed script, so cached reads would otherwise serve stale values.

- [ ] **Step 6: Confirm the fields appear in admin**

Start the dev server via the preview tooling, sign in at `/admin`, open **Hero Effects**. Confirm: the checkbox, five groups, and that entering `9999` in `chargeMs` is rejected on save with a max-value message.

- [ ] **Step 7: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/globals/HeroEffects.ts src/payload.config.ts src/seed/index.ts src/payload-types.ts
git commit -m "feat(cms): hero-effects global with grouped, clamped separation settings"
```

---

### Task 4: Feed the CMS values to the live hero and arm it

**Files:**
- Modify: `src/lib/cms.ts`
- Modify: `src/components/blocks/RenderBlocks.tsx`
- Modify: `src/components/blocks/HeroBlock.tsx`
- Modify: `src/components/hero/LogoStage.tsx`
- Modify: `src/components/three/LogoCanvas.tsx`

**Interfaces:**
- Consumes: `resolveSeparation`, `SeparationConfig` (Task 1); `LogoEngine(canvas, config)` (Task 2); global slug `'hero-effects'` and type `HeroEffect` (Task 3)
- Produces: `getHeroEffects(): Promise<HeroEffect>`; `LogoCanvas` props `{ onReady?, armed?, config? }`; `LogoStage` prop `separation?`; `HeroBlock` prop `separation?`

- [ ] **Step 1: Add the cached getter**

In `src/lib/cms.ts`, add `HeroEffect` to the type import from `../payload-types`, then add after `getSettings`:

```ts
// Not localized — the values are numbers, so no locale in the cache key.
export const getHeroEffects = (): Promise<HeroEffect> =>
  unstable_cache(
    async () => {
      const payload = await payloadPromise
      return payload.findGlobal({ slug: 'hero-effects' })
    },
    ['hero-effects'],
    { tags: ['hero-effects'] },
  )()
```

- [ ] **Step 2: Fetch it in `RenderBlocks`**

In `src/components/blocks/RenderBlocks.tsx`, add to the `cms` import: `getHeroEffects`. Add near the other imports:

```ts
import { resolveSeparation } from '../../lib/three/shatter/resolveSeparation'
```

Change the `case 'hero':` branch to fetch and pass config — note the branch must become a block so it can `await`:

```ts
            case 'hero': {
              const effects = await getHeroEffects()
              return (
                <HeroBlock
                  key={block.id}
                  line1={block.line1}
                  line2={block.line2}
                  locationLine={block.locationLine}
                  scrollCue={block.scrollCue}
                  constellationEnabled={block.constellationEnabled ?? true}
                  separation={resolveSeparation(effects)}
                  floatingWords={(block.floatingWords || [])
                    .map((w) => w.word)
                    .filter((w): w is string => !!w)}
                />
              )
            }
```

- [ ] **Step 3: Forward through `HeroBlock`**

In `src/components/blocks/HeroBlock.tsx`, add to the `Props` type:

```ts
  separation?: SeparationConfig
```

with the import:

```ts
import type { SeparationConfig } from '../../lib/three/shatter/types'
```

Add `separation` to the destructured parameters, and pass it on:

```tsx
      <LogoStage onLive={onStageLive} onIntroPlayStart={onIntroPlayStart} separation={separation} />
```

- [ ] **Step 4: Forward through `LogoStage` and arm**

In `src/components/hero/LogoStage.tsx`, extend the props:

```tsx
export function LogoStage({
  onLive,
  onIntroPlayStart,
  separation,
}: {
  onLive?: () => void
  onIntroPlayStart?: () => void
  separation?: SeparationConfig
}) {
```

with `import type { SeparationConfig } from '../../lib/three/shatter/types'`.

Pass both config and the armed flag — the component already computes `introDone && canvasReady` for `onLive`, and that is exactly the moment the mesh takes over from the video:

```tsx
        <LogoCanvas
          onReady={() => setCanvasReady(true)}
          config={separation}
          armed={introDone && canvasReady}
        />
```

- [ ] **Step 5: Accept config and arm in `LogoCanvas`**

Rewrite `src/components/three/LogoCanvas.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { LogoEngine } from '../../lib/three/LogoEngine'
import { DEFAULT_SEPARATION, type SeparationConfig } from '../../lib/three/shatter/types'

// Heavy client component — import it via next/dynamic(ssr:false) so three.js
// stays out of the base bundle (Global Constraint: three lazy).
export default function LogoCanvas({
  onReady,
  config = DEFAULT_SEPARATION,
  armed = false,
}: {
  onReady?: () => void
  config?: SeparationConfig
  armed?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<LogoEngine | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new LogoEngine(canvas, config)
    engineRef.current = engine

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    engine.setInteractive(!reduced)

    engine.load().then(() => onReady?.()).catch((err) => console.error('LogoEngine load failed', err))

    const onResize = () => engine.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      engine.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Armed only once the 3D mesh has taken over from the sketch-draw video, so a
  // press during the intro cannot trigger the separation.
  useEffect(() => {
    engineRef.current?.setShatterArmed(armed)
  }, [armed])

  return (
    <canvas
      ref={canvasRef}
      aria-label="Rotating TAMPA TARUNO logo"
      role="img"
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
    />
  )
}
```

- [ ] **Step 6: Typecheck and SSR**

```bash
npx tsc --noEmit
for l in en id; do printf "%s: " "$l"; curl -s -o /dev/null -w "%{http_code}\n" --max-time 30 "http://127.0.0.1:3000/$l"; done
```

Expected: typecheck exits 0; both locales return `200`.

- [ ] **Step 7: Prove arming works on the real hero**

Create `scratchpad/verify-live-hero.mjs` (in the session scratchpad, not the repo):

```js
import puppeteer from 'puppeteer-core'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--no-sandbox'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))
await page.goto('http://localhost:3000/en', { waitUntil: 'networkidle2', timeout: 120000 })

// press during the sketch-draw intro: must NOT separate
await page.mouse.move(640, 410)
await page.mouse.down()
await sleep(1200)
const duringIntro = await page.evaluate(() => document.querySelectorAll('canvas').length)
await page.mouse.up()

// wait out the intro, then press again
await sleep(9000)
await page.mouse.move(640, 410)
await page.mouse.down()
await sleep(1600)
await page.screenshot({ path: 'live-hero-separated.png' })
await page.mouse.up()
await sleep(3000)
await page.screenshot({ path: 'live-hero-reformed.png' })

console.log(JSON.stringify({ canvases: duringIntro, errors }, null, 1))
await browser.close()
```

Run it:

```bash
node verify-live-hero.mjs
```

Expected: `errors: []`. Open `live-hero-separated.png` — the logo must be visibly pulled apart with the wireframe ghost showing. Open `live-hero-reformed.png` — the logo must be whole again.

- [ ] **Step 8: CMS round-trip**

In `/admin` → Hero Effects, set `body.skinOpacity` to `1` and save. Reload `http://localhost:3000/en`. The logo must render fully opaque. Set it back to `0.6` and save.

If the change does not appear, that is the `unstable_cache` trap: `rm -rf .next/cache` and reload. Publishing from `/admin` should revalidate correctly via the `afterChange` hook — if it does not, the hook is not wired.

- [ ] **Step 9: Commit**

```bash
git add src/lib/cms.ts src/components
git commit -m "feat(hero): drive separation from CMS and arm it on the live hero"
```

---

### Task 5: Save to CMS from the dev bench

**Files:**
- Modify: `src/app/(frontend)/[locale]/dev/shatter/page.tsx`
- Modify: `src/app/(frontend)/[locale]/dev/shatter/ShatterLab.tsx`

**Interfaces:**
- Consumes: `getHeroEffects` (Task 4), `resolveSeparation` / `toHeroEffectsPayload` (Task 1)
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Seed the bench from live CMS values**

Rewrite `src/app/(frontend)/[locale]/dev/shatter/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getHeroEffects } from '@/lib/cms'
import { resolveSeparation } from '@/lib/three/shatter/resolveSeparation'
import ShatterLab from './ShatterLab'

// Dev-only tuning bench for the hold-to-separate effect. Never reachable in a
// production build.
export default async function ShatterDevPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  const effects = await getHeroEffects()
  return <ShatterLab initial={resolveSeparation(effects)} />
}
```

- [ ] **Step 2: Accept the initial config in the lab**

In `ShatterLab.tsx`, change the component signature to `export default function ShatterLab({ initial }: { initial: SeparationConfig })` and seed the ref from it:

```ts
  const cfgRef = useRef<SeparationConfig>({ ...initial })
```

Also change each slider's `defaultValue` to read from `cfgRef.current[r.key]` (already done in Task 2) — no further change needed there.

- [ ] **Step 3: Add the save handler**

Add these imports:

```ts
import { toHeroEffectsPayload } from '@/lib/three/shatter/resolveSeparation'
```

Add state and handler inside the component:

```ts
  const [saveState, setSaveState] = useState<string>('')

  const saveToCms = useCallback(async () => {
    setSaveState('saving…')
    try {
      const res = await fetch('/api/globals/hero-effects', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toHeroEffectsPayload(cfgRef.current)),
      })
      if (res.status === 401 || res.status === 403) {
        setSaveState('not signed in — log in at /admin first')
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setSaveState(`rejected: ${body?.errors?.[0]?.message ?? res.status}`)
        return
      }
      setSaveState('saved — homepage picks it up on next load')
    } catch (e) {
      setSaveState(`failed: ${String(e).slice(0, 80)}`)
    }
  }, [])
```

- [ ] **Step 4: Add the button**

Immediately above the existing `rebuild` button:

```tsx
        <button
          type="button"
          onClick={saveToCms}
          style={{
            width: '100%',
            marginTop: 4,
            padding: '6px 8px',
            cursor: 'pointer',
            border: '1px solid #8E1114',
            background: 'transparent',
            color: '#8E1114',
            font: 'inherit',
          }}
        >
          save to CMS
        </button>
        {saveState ? <div style={{ marginTop: 6, opacity: 0.8 }}>{saveState}</div> : null}
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 6: Verify the round trip by hand**

With the dev server running and signed in at `/admin`: open `/en/dev/shatter`, move **Skin opacity** to `0.85`, click **save to CMS**. Expect `saved — homepage picks it up on next load`. Open `/admin` → Hero Effects and confirm `skinOpacity` reads `0.85`. Set it back to `0.6` and save again.

Then sign out of `/admin` and click save again — expect `not signed in — log in at /admin first` rather than a silent failure.

- [ ] **Step 7: Commit**

```bash
git add src/app/(frontend)/[locale]/dev/shatter
git commit -m "feat(dev): seed bench from CMS and add save-to-CMS"
```

---

### Task 6: Documentation and handoff

**Files:**
- Modify: `_WEB_PRODUCT/README.md`
- Modify: `_HANDOFF/HANDOFF.md` (outside the git repo — update anyway)

**Interfaces:**
- Consumes: everything above
- Produces: nothing

- [ ] **Step 1: Document the global in the README**

In `README.md`, in the **Content model** section, after the `site-settings` bullet, add:

```markdown
- **Global:** `hero-effects` — physics and material settings for the hero logo
  separation (hold the logo to pull it apart). Not localized. All 24 values are
  range-clamped to match the dev tuning bench at `/[locale]/dev/shatter`, which
  can write back to this global with its "save to CMS" button.
  `separationEnabled` disables the interaction only — the glass skin, pencil
  hatching, light wash and wireframe ghost all remain.
```

- [ ] **Step 2: Note the cache caveat in the README**

In the **Re-seed from scratch** section, after the `npm run seed:verify` block, add:

```markdown
`unstable_cache` writes to disk at `.next/cache/`, and `revalidateTag` cannot
fire from a seed script — so after seeding run `rm -rf .next/cache` or the site
will keep serving the previous values. Publishing from `/admin` revalidates
correctly and needs no manual step.
```

- [ ] **Step 3: Update HANDOFF**

In `_HANDOFF/HANDOFF.md`, insert this immediately above the `**✅ 2026-08-08 — SHIPPED: Hero logo hold-to-SEPARATE …**` entry (adjust the commit hashes to the real ones):

```markdown
**✅ 2026-08-08 — SHIPPED: Hero separation is CMS-editable and LIVE on the homepage**
- New Payload global **`hero-effects`** (`src/globals/HeroEffects.ts`, registered in `payload.config.ts`, seeded in `seed/index.ts`) exposes all 24 separation parameters in five groups — Timing / Motion / Material / Body / Feel — each range-clamped to match the dev bench sliders. **Not localized** (numbers, identical EN/ID). Edit at `/admin` → Hero Effects.
- **The effect is now armed on the real homepage hero**, not just the bench. `LogoStage` passes `introDone && canvasReady` as `armed` to `LogoCanvas`, so it cannot fire during the sketch-draw video.
- **`SHATTER` no longer exists.** It is now a frozen `DEFAULT_SEPARATION` plus a `SeparationConfig` threaded explicitly `RenderBlocks → HeroBlock → LogoStage → LogoCanvas → LogoEngine → partition/material`. The singleton was rejected because `LogoCanvas` is `dynamic(ssr:false)` and could mount before CMS values landed, silently rendering defaults.
- **`separationEnabled: false` disables the interaction ONLY** — the glass skin, pencil hatch, light wash and wireframe ghost all remain. Implementation detail worth knowing: when disabled, `patchForShatter` skips the *vertex* injection entirely rather than relying on attribute defaults, because a disabled WebGL vertex attribute defaults to **(0,0,0,1)** — `aParams.w` would be 1, activating displacement about a zero-length axis and producing NaN.
- **The dev bench can write back**: `/[locale]/dev/shatter` now seeds from the live global and has a **save to CMS** button (`POST /api/globals/hero-effects`, admin session cookie). No more transcribing 24 numbers by hand.
- **Cache gotcha, again:** publishing from `/admin` revalidates via the `afterChange` hook, but a **seed script cannot** — `revalidateTag` is a no-op outside a request context and `unstable_cache` persists to disk. After `npm run seed`, run `rm -rf .next/cache`.
```

- [ ] **Step 4: Final full verification**

```bash
npx tsc --noEmit && npm run verify:config
for l in en id; do printf "%s: " "$l"; curl -s -o /dev/null -w "%{http_code}\n" --max-time 30 "http://127.0.0.1:3000/$l"; done
```

Expected: typecheck 0, all config checks `ok`, both locales `200`.

- [ ] **Step 5: Commit and push**

```bash
git add README.md
git commit -m "docs: hero-effects global and cache caveat"
git push
```

---

## Notes for the implementer

- **Do not add a test framework.** The `verify:config` script is deliberately a plain tsx assertion runner matching the existing `seed:verify` idiom.
- **`reformMs` max is 2500** because that is the bench slider's ceiling and the current value sits exactly on it. If a longer reassembly is ever wanted, raise the max in `HeroEffects.ts` and the bench `ROWS` entry together, or they will disagree.
- **`SCROLL_DISARM_FRAC` is not CMS-editable** by design — it is a safety gate that stops the effect firing when the hero is scrolled away, not a look control.
- **Task 1 leaves the tree failing typecheck** (existing `SHATTER` imports break) until Task 2 lands. That is intentional so the pure resolver can be reviewed on its own; if you prefer a green tree at every commit, land Tasks 1 and 2 together.
- **`HeroEffectsInput` (hand-written, Task 1) vs `HeroEffect` (generated, Task 3).** `resolveSeparation` deliberately takes the hand-written structural type so the resolver compiles before the global exists and does not break on stale generated types. Passing a generated `HeroEffect` into it works because the generated interface is a structural superset — its extra `id`/`createdAt`/`updatedAt` are ignored when assigning from a variable (excess-property checking only applies to object literals). If Payload generates a group as non-optional where the hand-written type has it optional, that is still assignable. If typecheck disagrees at Task 4 Step 2, widen `HeroEffectsInput` rather than casting — a cast there would hide a real schema/field-name mismatch, which is exactly the failure this split is meant to catch.
