# Hero electrical wireframe ignition — design (sub-project 2 of 3)

**Date:** 2026-08-09 · **Status:** APPROVED by owner, ready for implementation planning
**Observations this is built on:** [2026-08-09-hero-effects-reference-observations.md](./2026-08-09-hero-effects-reference-observations.md)
**Predecessor:** [2026-08-08-hero-logo-shatter-design.md](./2026-08-08-hero-logo-shatter-design.md) (sub-project 1, shipped)

---

## 1. The scene

The owner's stated hero sequence (2026-08-09):

```
sketching → extrude to 3D sketch → ELECTRICAL WIREFRAME TRANSITION → rotating 3D logo
                                          └─ orbiting orbs emerge as this ends ─┘
```

Sub-project 2 builds the third beat. Today that beat does not exist: the handoff is a plain crossfade —
`LogoStage` fades the canvas `0 → 1` over 0.6 s while `SketchIntro` fades the video out over 0.5 s.

Sub-project 3 (orbiting orbs, replacing `ConstellationField`) is **out of scope here** but this spec defines
the signal it will subscribe to.

## 2. Owner decisions (this session)

| Question | Decision |
|---|---|
| What does the viewer see? | **Wireframe is the bridge** — video ends, logo appears as a red wireframe, energy runs its edges, surfaces materialize, solid logo |
| What is the wireframe made of? | **Dense scribble cage** — not the existing clean 26° edge ghost |
| How does charge move? | **Both layered** — an expanding charge front *and* a hot core with a light-driven ramp |
| How does the solid take over? | **Solid forms in the front's wake** — one continuous gesture, single timeline |
| Colour | **Red-ish**, to sit in the TT palette |
| Total duration | **2.0 s** (owner asked for 1.8–2.0 s, up from the 1.2 s first proposed) |
| Build approach | **Both** the live WebGL module *and* a Kling video version, to compare and choose later |
| Credits | **Conserve.** 128 available, VIP Standard |

## 3. Visual target

Timing anchors to what exists: the video runs 7.67 s, the headline dissolves by 7 s, so the stage is clear
when the video ends. **t = 0 is video end.**

### 3.1 Phases

Phase boundaries are **fractions of `IGNITION_MS`, not absolute milliseconds.** One duration slider retimes
the whole sequence, and the phases cannot be driven into an inconsistent state — three independent ms values
can be set to sum past the total; fractions cannot.

| Phase | Fraction | @2.0 s | What happens |
|---|---|---|---|
| Seed | 0 → 0.12 | 0 → 240 ms | Hot core blooms at the seed point. Cage on screen but **cold**, in graphite `#2B2A27` |
| Front | 0.12 → 0.78 | 240 → 1560 ms | Wavefront expands from seed. Edges ignite at the crest, cool behind it, and **skin alpha ramps `0 → SKIN_OPACITY` in the wake** |
| Settle | 0.78 → 1.0 | 1560 → 2000 ms | Front clears the geometry, residual glow decays, cage fades out entirely |

**The overlap with the video's own 0.5 s fade-out is the bridge, not a problem to hide.** The video's last
frame and the cold cage are both dark lines on warm paper — the two images are made of the same material.
This is the whole reason the wireframe answer was correct.

### 3.2 Palette

Ramped by distance from the crest:

| Stop | Colour | Note |
|---|---|---|
| Cold | `#2B2A27` | Identical to the existing ghost-wireframe ink and to the video's pencil |
| Warm | `#8E1114` | Red-pencil token |
| Hot | `#C8341A` | |
| Crest | `#FFF8E0` | Already the `SHINE_BRIGHT` token. **Kept small and brief** |

### 3.3 Making red work on paper — mandatory, not decorative

A 1 px red line on `#F6F1E7` reads as a red line, not as glow. Glow needs contrast the paper does not
provide. This project has already paid for this lesson once (2026-08-08: skin opacity had to go 0.3 → 0.6
because "the black-and-red washed out entirely").

The observed mitigation from OPTIMIND: **their bright struts read against soft dark blurred mesh behind
them, not against the background.** Reproduced here by raising the inner body's surface opacity to
`DARK_MASS_OPACITY` (default 0.12) **during ignition only**, then returning it to `BODY_OPACITY`.

**Code consequence:** `LogoEngine.buildInnerBody()` currently *skips building the inner-body surfaces
entirely* when `BODY_OPACITY <= 0` — which is today's shipped value (0). Ignition needs those surfaces to
exist. This is a change to existing code, not an addition beside it.

### 3.4 The cage geometry — refined from the verbal design

The logo is **19,704 triangles / 32,354 verts** across 2 meshes — measured from the accessors of the
uncompressed source `_ASSETS/logo-3d/logo.glb`. The shipped file is `logo.draco.glb`, which should decode to
the same topology; **verify the decoded count during implementation** before trusting the segment budget
below.

`EdgesGeometry` with a low angle threshold was the obvious choice, but it is **wrong here**: it includes an
edge only when adjacent face normals differ by more than the threshold, so the extruded logo's **flat front
and back caps would be nearly empty of lines** and only the curved side band would be dense. The result is
an outline with a dense rim, not a cage.

**Use `WireframeGeometry`** (every triangle edge, no angle test) = 59,112 segments, then **subsample to
`CAGE_DENSITY`** with the existing `mulberry32` deterministic PRNG from `shatter/types.ts`.

Subsampling earns its place three times over: it is the mobile density knob, it keeps the segment count near
the ~30 k originally budgeted (0.55 × 59,112 ≈ 32.5 k), and **a partial wireframe reads as scribble where a
complete one reads as CAD** — which is the point.

### 3.5 Cost

One draw call. **No per-vertex attributes at all** — the charge front is distance-from-seed, computed in the
shader straight from `position`. (Sub-project 1 needed ~2.8 MB of per-vertex attributes for its panel
displacement; this effect is far lighter than its predecessor.) Cage is built during `load()`, where the
video's 7.67 s absorbs the cost with no hitch at the transition, and disposed at `done`.

## 4. Architecture — live track

### 4.1 Modules

Mirrors `shatter/` one-for-one, as a **parallel module rather than an extension** of it. The alternative —
adding ignition uniforms to `patchForShatter` — would stack a third concern onto a shader already carrying
screen-space hatch, light-wash and panel displacement, and would couple ignition tuning to
`SeparationConfig`. The 2026-08-09 review found a subtle production bug in exactly that shader's
surroundings; it should not get harder to reason about.

```
src/lib/three/ignition/
  types.ts                  IgnitionConfig + frozen DEFAULT_IGNITION, IgnitionEvent, IgnitionUniforms
  resolveIgnition.ts        merge the CMS global over defaults
  resolveIgnition.check.ts  round-trip assertion
  cage.ts                   WireframeGeometry + deterministic subsample → LineSegments
  ignitionMaterial.ts       cage line material, and the narrow front-aware alpha patch for the skin
  IgnitionController.ts     clock, phases, events
```

The skin patch is deliberately **narrow**: a single front-aware alpha factor. Per-fragment control is the
only way to get "solid forms in the wake", so this one patch is unavoidable — but it is the only place
ignition touches the existing materials.

### 4.2 Data flow

Identical to separation's, which is the proven path:

```
hero-effects global → RenderBlocks → HeroBlock → LogoStage → LogoCanvas → LogoEngine → controller/material
```

`ignition` threads as a **required** prop alongside `separation`, for the reason the last review
established: a dropped prop must fail loudly rather than silently reverting to defaults.

Config lives in the **existing `hero-effects` global** as new groups — it is already the hero-effects global,
already grouped and range-clamped, and already has bench save-back.

### 4.3 Engine API

```ts
startIgnition(): void
onIgnition(cb: (e: IgnitionEvent) => void): () => void   // 'seed' | 'cue' | 'done'
```

**`startIgnition()` must record intent unconditionally and apply it when the controller appears**, exactly
as `setShatterArmed` now does via `wantArmed`. That fix exists because the naive version silently dropped
calls arriving before `load()` resolved, leaving the interaction permanently dead with no console error, and
it was reachable on cold-cache mobile because the Draco chain can outrun the 4 s canvas fallback.
`startIgnition()` has the identical shape and the identical exposure.

### 4.4 Signal rewiring

Today `onLive` fires at `introDone && canvasReady` and drives `ConstellationField`'s entrance.

| Moment | Today | Under this design |
|---|---|---|
| `introDone && canvasReady` | canvas → opacity 1, `onLive`, arm separation | canvas → opacity 1, **`startIgnition()`** |
| `cue` (0.80 → 1600 ms) | — | **`onLive` fires here** — constellation entrance |
| `done` (1.0 → 2000 ms) | — | dispose cage, **arm separation** |

Two things fall out of this:

1. **Sub-project 3 becomes a component swap, not a rewiring.** The orbs subscribe to the signal that already
   exists, at exactly the moment the owner described ("orbs come out when the transition is about to end").
   The cue lands just as the front finishes, so the energy disperses *into* the orbiting bodies.
2. **Separation arms at `done`, not at `live`**, so a press mid-transition cannot trigger hold-to-separate.

### 4.5 Failure modes

The invariant: **`done` fires exactly once, unconditionally**, because both `armed` and `onLive` hang off it.

| Case | Behaviour |
|---|---|
| Mesh never loads | No cage. Ignition no-ops but **still fires `done`** |
| Autoplay blocked (common, mobile Safari — `introDone` at ~0 ms) | Ignition runs over bare paper with no video beneath. Still a good reveal — keep it |
| Reduced motion | Skip ignition entirely, fire `done` immediately, straight to solid logo. Consistent with `setInteractive(false)` already skipping the shatter path |
| Scroll away mid-ignition | Ignition continues; it is non-interactive |

### 4.6 Config

All range-clamped in CMS, following the separation global's pattern. Not localized (numbers, identical EN/ID).

| Field | Default | Meaning |
|---|---|---|
| `ENABLED` | `true` | Off → today's plain crossfade, `done` fires immediately |
| `IGNITION_MS` | `2000` | Total duration; the single pacing control |
| `SEED_END` | `0.12` | Fraction where the seed bloom ends |
| `FRONT_END` | `0.78` | Fraction where the charge front finishes |
| `CUE_FRAC` | `0.80` | Fraction at which `cue` fires (sub-project 3's entrance) |
| `SEED_OFFSET_X/Y/Z` | `0,0,0` | Seed position as a fraction of logo height, from the logo's centre |
| `FRONT_SOFTNESS` | `0.18` | Crest width as a fraction of logo height |
| `WAKE_LAG` | `0.10` | How far behind the crest the skin materializes |
| `CAGE_DENSITY` | `0.55` | Fraction of wireframe segments kept (desktop) |
| `CAGE_DENSITY_MOBILE` | `0.30` | Same, below 640 px |
| `CAGE_OPACITY` | `0.9` | |
| `CAGE_SEED` | `1337` | `mulberry32` seed — deterministic subsample |
| `COLD_COLOR` | `0x2B2A27` | |
| `WARM_COLOR` | `0x8E1114` | |
| `HOT_COLOR` | `0xC8341A` | |
| `CREST_COLOR` | `0xFFF8E0` | |
| `CORE_STRENGTH` | `1.0` | Hot-core intensity at the seed |
| `CORE_RADIUS` | `0.22` | As a fraction of logo height |
| `DARK_MASS_OPACITY` | `0.12` | Inner-body surface opacity **during ignition only** (§3.3) |
| `GLOW_DECAY` | `2.4` | Exponential decay rate for residual glow during settle; higher = faster falloff |

### 4.7 Dev bench

New route `/[locale]/dev/ignition`, `notFound()` in production, driving the real `LogoEngine` and reusing
the existing save-to-CMS helper. Needs a **replay button** — ignition is one-shot, unlike the hold-triggered
separation which is inherently repeatable.

## 5. Video track (Kling)

Built **second**, deliberately. See §5.3.

### 5.1 Both ends pinned

`image_to_video` accepts `tail_image`, which removes the objection originally raised against this approach
(that the video cannot know the live mesh's pose, so the seam merely moves to the end):

- **`first_image`** = the existing master's final frame — exact continuity into the draw-in
- **`tail_image`** = a render of the live mesh at its resting frontal pose, captured with the existing
  `puppeteer-core` harness — exact continuity out to the handoff

Pinning both ends also sidesteps the paper-tone drift that bit the 2026-07-16 session, where two
generations' paper tones visibly differed and needed a 0.35 s crossfade to hide the cut.

### 5.2 Settings

`kling-video-v3_0` — supports `tail_image` **and** arbitrary durations from 3 s. `kling-video-v2_5` also
supports `tail_image` and is described by the API as the better-value model, but offers only 5 s or 10 s, so
it would generate 5 s to use 2 s. Since per-job cost is not exposed (below), "better value at 5 s" cannot be
compared against "v3_0 at 3 s" from the data available — v3_0 is chosen because the shorter duration is
certain while the price difference is not.

```
model: kling-video-v3_0, duration: 3, imageCount: 1, resolution: 1080p, enable_audio: false
```

`enable_audio: false` because the hero video is muted — generated audio is pure waste.

**Per-job credit cost is not exposed anywhere in the API response**, so the spend cannot be stated in
advance. Confirm with the owner before submitting.

### 5.3 Credit discipline

1. **Build the live track first.** It is free to iterate. If it satisfies, **zero credits are spent.**
2. If we do generate, do it with the finished live effect as the visual target — a far better prompt than
   one written from imagination.
3. **One job. No trial runs.** Kling's own guidance says not to submit trial jobs. If the single generation
   misses, discuss before spending again.

### 5.4 Integration cost if this track wins

Real work, not a file swap:

- master 7.67 s → ~9.7 s; re-encode mp4 + webm + poster
- **the poster is the video's final frame *and* the OG image** — changing the ending changes the social preview
- mesh handoff calibration (`HEIGHT_FRAC` 0.408 / `CENTER_Y` 0.513) must be re-verified against the new final
  frame, and `SketchIntro`'s mobile CSS constants derive from those same ratios
- bundle grows ~25% (currently 1.58 MB mp4 / 622 KB webm)
- the orb `cue` becomes a fixed timecode instead of an event — workable, but no longer tunable

### 5.5 Trade-off summary

| | Live | Video |
|---|---|---|
| CMS-tunable | yes | no — regenerate |
| Varies per play | yes | no |
| Adapts to mobile | yes | no |
| Page weight | ~0 | +25 % on the hero video |
| WebGL risk | yes | **none — works where the 3D canvas fails** |

## 6. Verification

- **Contact sheets for both tracks** via `puppeteer-core`, so the comparison is like-for-like rather than
  from memory. This is the method that corrected two of this session's own misreadings of the reference
  videos, and it is the project's established technique.
- Typecheck, `verify:config`, SSR 200 on both locales.
- `resolveIgnition.check.ts` must **perturb every CMS-mapped field to a non-default value** before the
  round-trip. The last review caught the separation equivalent round-tripping `DEFAULT_SEPARATION` against
  itself — a near-tautology.
- **Regression test: stall `logo.draco.glb` and assert `done` still fires.** Both `armed` and `onLive` hang
  off it. Stall **only** the `.glb` — never the Draco wasm; stalling the wasm hangs the loader's worker
  bootstrap and produces a false failure (documented test artifact, 2026-08-09).

## 7. Out of scope

- The orbiting orbs themselves (sub-project 3). This spec only defines the `cue` signal they consume.
- Any change to the resting logo, the separation effect, or `ConstellationField`'s internals.
- The pre-existing fragility flagged 2026-08-09: if Draco's worker scripts genuinely fail, the hero silently
  shows no logo. Still unaddressed, still out of scope, still worth a visible fallback one day.
