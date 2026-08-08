# Hero Effects CMS — Design

**Date:** 2026-08-08
**Status:** Approved for planning
**Depends on:** `2026-08-08-hero-logo-shatter-design.md` (implemented in `d3cbb6e`)

## 1. Goal

Make the hero logo separation adjustable from `/admin` instead of from code
constants, and arm the effect on the real homepage hero so those settings
visibly do something.

Today every value lives in `SHATTER`, a mutable module-level object in
`src/lib/three/shatter/types.ts`. Changing the look requires a developer.

## 2. Current state

- `SHATTER` is imported directly by `LogoEngine.ts`, `partition.ts`,
  `shatterMaterial.ts` and the dev bench. Nothing is passed in.
- `LogoCanvas` accepts only `onReady`.
- `RenderBlocks` is an async server component that already fetches its own data
  per block (`getManifesto`, `getWorks`), so the hero case can fetch a global
  itself without prop drilling from the page.
- **The separation is not wired to the live hero.** It exists only on the dev
  bench at `/[locale]/dev/shatter`.

## 3. Decisions

| Decision | Choice |
|---|---|
| Arm the live hero as part of this | Yes |
| Where settings live | New `hero-effects` global |
| How many parameters exposed | All 24, grouped and clamped |
| How config reaches the engine | Explicit threading (no singleton, no context) |
| Bench → CMS | "Save to CMS" button on the bench |

Rejected: hydrating the `SHATTER` singleton at boot — `LogoCanvas` is
`next/dynamic(ssr:false)`, so the engine can mount before hydration lands and
silently render defaults. Rejected: React context — `partition.ts` and
`shatterMaterial.ts` are not React and need explicit passing regardless, so a
provider for one consumer buys nothing.

## 4. Schema

New global `hero-effects`, mirroring `SiteSettings`:
`access: { read: () => true }`, `hooks: { afterChange: [globalRevalidateHook('hero-effects')] }`.

**Not localized.** These are numbers, identical in EN and ID, which also keeps
the cache key locale-free.

`separationEnabled` — checkbox, default `true` — sits at the top. Then five
collapsible groups:

| Group | Field | Range | Default |
|---|---|---|---|
| Timing | `chargeMs` | 300–4000 | 950 |
| | `reformMs` | 100–2500 | 2500 |
| | `separateStart` | 0–0.9 | 0.65 |
| | `staggerMax` | 0–0.5 | 0.2 |
| Motion | `spreadFrac` | 0–2 | 1.6 |
| | `spreadVar` | 0–0.9 | 0.8 |
| | `lateralDrift` | 0–1.5 | 0.75 |
| | `spinMin` | 0–1 | 0.18 |
| | `spinMax` | 0–1.5 | 0.21 |
| | `capNormalMin` | 0.5–0.99 | 0.79 |
| Material | `normalFollow` | 0–1 | 0.55 |
| | `hatchStrength` | 0–1 | 0.65 |
| | `hatchScale` | 0.5–4 | 0.5 |
| | `shineStrength` | 0–1 | 0.3 |
| | `shineWidth` | 0.05–1 | 0.05 |
| | `shineSpeed` | 0–3 | 0.9 |
| | `shineChargeBoost` | 0–4 | 1 |
| | `shineWarm` | hex text | `#B4571C` |
| | `shineBright` | hex text | `#FFF8E0` |
| Body | `skinOpacity` | 0.05–1 | 0.6 |
| | `bodyOpacity` | 0–1 | 0 |
| | `bodyEdgeOpacity` | 0–1 | 0.9 |
| | `bodyEdgeAngle` | 1–60 | 26 |
| Feel | `vibrateFrac` | 0–0.05 | 0.006 |
| | `vibratePhaseStep` | 0–3 | 1.1 |
| | `dragThresholdPx` | 2–20 | 6 |

Every range mirrors its bench slider. Payload enforces `min`/`max` on the API as
well as in the admin UI, so an out-of-range value cannot be saved even through
REST.

Payload has no native colour field, so `shineWarm`/`shineBright` are `text`
validated against `/^#[0-9a-fA-F]{6}$/`, with an admin description saying so.

## 5. Data flow and caching

```
RenderBlocks (server, case 'hero')
  └─ await getHeroEffects()          ← unstable_cache, tag 'hero-effects', no locale
     └─ resolveSeparation(cms)       ← merged over DEFAULT_SEPARATION
        └─ HeroBlock (client)
           └─ LogoStage → LogoCanvas → new LogoEngine(canvas, config)
                                        ├─ partitionForShatter(root, config)
                                        └─ patchForShatter(mat, uniforms, config)
```

`getHeroEffects()` goes in `lib/cms.ts` beside `getSettings`, same
`unstable_cache` shape but without a locale in the key.

**Caching trap — this bit is a known landmine in this repo.** `unstable_cache`
persists to disk at `.next/cache/fetch-cache/` and survives dev-server
restarts, and `revalidateTag` is a documented no-op outside a Next request
context. That combination is exactly why adding `floatingWords` in July appeared
broken until `.next/cache` was deleted. Two consequences:

- Publishing from `/admin` **does** work, because that runs inside a request
  context — hence `globalRevalidateHook('hero-effects')` on the global.
- The seed script **cannot** invalidate. After seeding or reseeding, run
  `rm -rf .next/cache` before expecting new values to appear.

## 6. Config resolution

`SHATTER` is replaced by `DEFAULT_SEPARATION`, frozen with `Object.freeze`, plus
a `SeparationConfig` type. The mutable singleton is deleted.

`resolveSeparation(cms: HeroEffect | null): SeparationConfig`:

1. Start from `DEFAULT_SEPARATION`.
2. Overlay any CMS value that is not `null`/`undefined`, so a never-saved global
   — or a field added in a later release — falls back cleanly.
3. Convert `shineWarm`/`shineBright` from `#RRGGBB` to the numbers three.js
   wants. A malformed string falls back to its default rather than rendering
   black.
4. Swap `spinMin` and `spinMax` if a CMS value arrives with min above max. Not
   hypothetical: the bench values approved on 2026-08-08 had `spinMin` 0.21
   above `spinMax` 0.18, and the sliders make that easy to do again. It is
   harmless arithmetically — `MIN + rand()*(MAX−MIN)` produces the same range
   either way — but the resolver is the right place to make the field names
   honest. The defaults in §4 are already stored the right way round.

No other per-field clamping — Payload's `min`/`max` already guarantees range on
write, and duplicating it here would be two sources of truth.

## 7. Arming the live hero

`LogoStage` already computes `introDone && canvasReady` for its `onLive` signal.
That same boolean becomes an `armed` prop on `LogoCanvas`, which calls
`engine.setShatterArmed(armed)`. The effect therefore cannot fire during the
sketch-draw video — it arms exactly when the 3D mesh takes over.

Reduced motion needs no new work: `LogoCanvas` already calls
`setInteractive(!reduced)` and the engine skips the whole separation setup when
not interactive.

**What `separationEnabled: false` does.** It disables the *interaction* only:
partitioning and the vertex-displacement patch are skipped (which also avoids
~2.8 MB of attribute data), while the fragment patch stays, so the pencil hatch,
the light wash, the glass skin and the inner wireframe body all remain. The logo
looks exactly as it does now; it simply cannot be pulled apart.

The alternative reading — a total kill switch reverting to the old opaque logo —
was rejected because it would hide the approved material work behind a checkbox
whose label says nothing about it.

## 8. Bench ↔ CMS

The bench's `page.tsx` fetches the same global and seeds `ShatterLab` with the
resolved live values, so tuning starts from what is actually published.
`ShatterLab` holds its own mutable copy in a ref and passes it to the engine on
each rebuild — removing the last piece of mutable global state.

A **"Save to CMS"** button writes the current values back through Payload's
global update endpoint, `POST /api/globals/hero-effects`, with
`credentials: 'include'` so the existing admin session cookie authenticates the
request. No separate auth handling is built into the bench.

States the button must handle, shown inline on the bench:

- **not signed in / 401 / 403** — "Log in to /admin first" (the dev bench does
  not handle authentication itself)
- **validation error** — surface Payload's message; ranges are enforced
  server-side so a rejected save means a genuinely bad value
- **success** — confirm saved, and note that the homepage picks it up on next
  load because the `afterChange` hook revalidates

This closes the tuning loop: live sliders, one click, persisted. It replaces
transcribing 24 numbers by hand, which is how the current values were moved and
is both slow and error-prone.

The bench remains dev-only (`notFound()` in production), so neither the write
path nor the `window.__ttShatter` handle can reach a production build.

## 9. Fallbacks

- Global never saved → `DEFAULT_SEPARATION` throughout.
- Malformed hex → that colour's default.
- `bodyOpacity: 0` → invisible surface meshes are skipped entirely and their
  cloned geometry disposed (existing behaviour, preserved).
- `prefers-reduced-motion` → separation never arms; unchanged.
- WebGL failure → unchanged; `LogoStage`'s 4 s fallback still forces the
  video→mesh handoff.
- Scroll gate, `pointercancel`/`blur` reform, and the drag-vs-hold rule are all
  unchanged from the separation spec.

## 10. Verification

1. `payload generate:types`, with `payload-types.ts` committed.
2. Seed the global's defaults; note the `.next/cache` step from §5.
3. Typecheck; SSR 200 on both locales.
4. **Puppeteer harness re-run against the real homepage hero**, not the bench —
   this is what proves arming actually works end to end. Assert: no charge
   during the sketch video, charge ramps once the mesh is live, reform returns
   to 0, events fire `blast → reform → idle`.
5. **CMS round-trip**: change a value in `/admin`, reload the homepage, confirm
   the live hero reflects it.
6. **Bench save round-trip**: move a slider, click Save to CMS, confirm the
   value persists in `/admin`.

The browser pane cannot reach localhost on this project and its tabs report
`document.hidden`, which pauses `rAF`. The puppeteer harness in the session
scratchpad is the reliable path and is already set up.

## 11. Files

New:
- `src/globals/HeroEffects.ts`
- `src/lib/three/shatter/resolveSeparation.ts`

Modified:
- `src/lib/three/shatter/types.ts` — `SHATTER` → frozen `DEFAULT_SEPARATION`,
  plus the `SeparationConfig` type
- `src/lib/three/shatter/partition.ts`, `shatterMaterial.ts` — take config as a
  parameter instead of importing the singleton
- `src/lib/three/LogoEngine.ts` — accept config in the constructor, honour
  `separationEnabled`
- `src/components/three/LogoCanvas.tsx` — accept `config` and `armed`
- `src/components/hero/LogoStage.tsx` — forward config, pass `armed`
- `src/components/blocks/HeroBlock.tsx` — accept and forward config
- `src/components/blocks/RenderBlocks.tsx` — fetch the global for the hero case
- `src/lib/cms.ts` — `getHeroEffects()`
- `src/payload.config.ts` — register the global
- `src/seed/index.ts` — seed defaults
- `src/app/(frontend)/[locale]/dev/shatter/{page,ShatterLab}.tsx` — seed from
  CMS, hold a local mutable copy, add Save to CMS

Unchanged: `materials.ts`, `calibration.ts`, `loadLogo.ts`, `ConstellationField.tsx`,
`SketchIntro.tsx`, all other collections and blocks.

## 12. Out of scope

The two remaining hero sub-projects, each with its own spec and reference video
in `_ASSETS/video/`: the **electrical sketch→3D transition**
(`Transition-3d-sketch-to-3d-rotating.mp4`) and the **orbiting glowing orbs**
(`Orbiting-orbs-sample.mp4`, replacing `ConstellationField`). Both will want
their own CMS groups; the `hero-effects` global is deliberately named to host
them without redesign, but no fields for them are added now.
