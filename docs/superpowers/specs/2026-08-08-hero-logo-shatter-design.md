# Hero Logo Hold-to-Separate — Design

**Date:** 2026-08-08
**Status:** Implemented; tuning approved by owner
**Scope:** Sub-project 1 of 3 (see §9)

> **Filename note.** This file is called `…-shatter-design.md` for continuity with
> commit `d1359d2`, but the mechanism is **separation, not shattering**. The
> first draft specified a Voronoi fracture into ~40 tumbling chunks. Frame-by-
> frame observation of trionn.com later proved that wrong: its faces leave as
> whole intact planes. The fracture model was deleted, not adjusted. Nothing in
> the codebase subdivides geometry any more.

## 1. Goal

Hold the pointer on the hero logo and its faces separate and drift apart,
leaving an intact ghost of the mark behind; release and they glide back
together. Rendered in the existing Atelier language — warm paper, graphite and
red pencil — with the logo reading as glass rather than solid.

## 2. What already existed

`src/lib/three/LogoEngine.ts` already drove the hero mesh: idle counter-clockwise
spin (≈14 s/rev), ±12° cursor deflection with spring return, drag-to-spin with
inertia, keyboard rotation, and two `MeshMatcapMaterial` slots (`logo-black`,
`logo-red`) using a procedurally drawn pencil cross-hatch matcap.

The mesh is `public/models/logo.draco.glb` — 53.7 KB Draco, **19,704 triangles**,
built as SVG → `ExtrudeGeometry` (depth 9% of width, bevel, curveSegments 5). A
flat extruded plate, not pre-fractured.

Toolchain: three.js `^0.185.1`, Next.js `~15.4.11`, GSAP `^3.15.0`.

## 3. Research: what trionn actually does

Two passes. The first read their source bundle (`1233qowaitufq.js`). The second
captured the running page frame by frame — a headless Chrome session with a
genuinely foregrounded load, which is the only way the symbol mounts at all.

### 3.1 Rendering architecture (from source)

One `WebGLRenderer` (`powerPreference: "high-performance"`,
`ACESFilmicToneMapping`, exposure 1.1, clear colour `#0C0C0C`) driving **two
scenes**: a perspective scene for the symbol, plus an **orthographic full-screen
plane** textured by an ordinary 2D canvas where interactive "lines" are drawn
each frame at `renderOrder: 1e4`.

Responsive camera `fov/z`: `42/6` (>1440px), `40/6.28` (≥1024), `38/7.55` (≥768),
`36/9.35` below. DPR capped 1 mobile / 1.5 desktop. `prefers-reduced-motion`
checked. No model file is fetched — the geometry is procedural.

### 3.2 Motion (from observed frames)

| Phase | Timing | What happens |
|---|---|---|
| Flare | 80–480 ms | Mark stays **fully assembled** while its faces light up orange and white |
| Separation | from ~480–620 ms | Whole faces detach and drift outward |
| Settled | ~1900–2600 ms | Only a wireframe cage of the mark remains |
| Reform | on release | Faces fly back in and the mark re-solidifies |

Critical correction to the first draft: **nothing fragments**. Individual frames
show single clean parallelograms and rounded panels drifting — the mark's own
faces, leaving one at a time. Motion is a slow near-linear glide with only a
slight turn, closer to an exploded-view diagram than an explosion. The resting
state is *already* mostly transparent outline with a few filled faces, so
"faces separate leaving a transparent body" is partly because the body was
always visible underneath.

Per-fragment rotation in their code is `spinAxis * spinSpeed * n * PI`; charge
state uses `holdTime += 1/60`, `clickBurst → min(1,…)`, `vibrateAmt = 1` then
`*= 0.88`, `vibratePhase += 1.1`; release returns pieces over
`0.6s cubic-bezier(0.25,0.46,0.45,0.94)`. Gated on `scrollProgress < 0.15`,
excluding `<a>`, `<button>` and the sound toggle.

### 3.3 Also observed, deliberately not ported

A blue **electrical arc** discharges through the mark mid-charge; the whole page
shakes rigidly (±2 px, identical transform on every element) then each element
tumbles independently in 3D via its own `matrix3d`; the headline text swaps
mid-blast. Their sound design, 2D line layer, `mix-blend-difference` treatment
and near-black palette are all out of scope — those belong to trionn's dark
canvas, which TT deliberately does not share. The arc overlaps sub-project 2.

## 4. Architecture

Four modules under `src/lib/three/shatter/`, plus wiring in `LogoEngine`:

| File | Responsibility |
|---|---|
| `types.ts` | Tuning constants, shared types, deterministic PRNG |
| `partition.ts` | CPU, once: de-index, tag every triangle with the panel it leaves with |
| `shatterMaterial.ts` | `onBeforeCompile` patches (vertex displacement, hatch, shine) |
| `ShatterController.ts` | Charge/blast/reform state machine; owns `uBlast`; emits events |

```
pointerdown ─► ShatterController (JS state) ─► uBlast uniform ─► vertex shader ─► pixels
                     │
                     └─► blast/reform/idle events ─► (no subscribers yet)
```

All authoritative state is JS; the GPU only renders a number it is handed. That
is what keeps the effect verifiable despite the displacement happening in a
shader (§8.2).

## 5. Panels

Runs once after `loadLogo()` resolves.

1. **Bake child transforms into geometry.** The shader displaces `position`,
   which lives in object space; a world-space bounding box would be in the wrong
   space once the group is scaled to fit the viewport.
2. **`toNonIndexed()`** so a triangle belongs to exactly one panel — with shared
   vertices, triangles spanning a boundary stretch instead of detaching.
   19,704 triangles → 59,112 vertices.
3. **Classify by face normal.** `|n.z| ≥ CAP_NORMAL_MIN` → front cap (`n.z > 0`)
   or back cap; otherwise the curved extruded side band.
4. **One panel per (mesh, kind)** — six in total: front cap, back cap and side
   band, for each of the two strokes. **There is no subdivision.**

Per-vertex attributes:

| Attribute | Type | Meaning |
|---|---|---|
| `aOrigin` | `vec3` | panel centroid — the pivot it turns about |
| `aAxis` | `vec3` | normalised random turn axis |
| `aDir` | `vec3` | drift direction |
| `aParams` | `vec4` | `x` turn, `y` stagger delay, `z` distance multiplier, `w` participates |

Caps drift along the way they **face** (front toward the viewer, back away) plus
a lateral component — delamination rather than a radial burst. The side band
wraps its stroke and has no single facing, so it opens outward in the plane
instead, falling back to its own random drift if its centroid sits on the
centre.

`aParams.w` is retained so the shader keeps one code path, but every panel now
participates, so nothing sets it to 0.

## 6. Shaders

One shared patch on both material slots via `onBeforeCompile`. The **vertex**
stage gets attribute declarations; the **fragment** stage gets its own helper
block, since attributes are illegal there.

**Vertex — displacement.** Rodrigues rotation about `aAxis`, then translation
along `aDir`:
```glsl
float ttT = tt_shardT();
vec3 ttLocal = tt_rotAxis(transformed - aOrigin, aAxis, aParams.x * ttT * PI);
transformed = aOrigin + ttLocal + aDir * (uSpread * aParams.z * ttT);
```

**Vertex — normals.** Rotated only *fractionally* (`uNormalFollow`). Rotating
fully is physically exact but swings the matcap lookup across flat regions and
flattens the pencil texture.

**Fragment — pencil hatch.** Three stroke families at different angles and
spacings switch in progressively as a surface darkens, which is how hand
hatching builds tone. Keyed off `gl_FragCoord`, **not** the surface: a matcap is
driven purely by the view normal, so a small flat face samples an almost
constant texel and comes out flat. Screen space is also how real pencil behaves
— strokes live on the paper, not on the object.

**Fragment — light wash.** A light orbits the mark; faces brighten as they turn
to meet it, blending warm → hot along a band whose width is tunable. Multiplied
up by `uShineBoost * uBlast` so the mark flares before it comes apart, matching
the observed order. Hatch is applied first and the wash over it, so the light
reads as falling *onto* drawn graphite.

## 7. Skin, body and interaction

### 7.1 Two logos

- **Outer skin** — the loaded mesh. Every face separates. `DoubleSide`,
  `transparent`, `SKIN_OPACITY`, `depthWrite: false`, `renderOrder: 2`.
- **Inner body** — a second logo built from *cloned* geometry before
  partitioning (partition replaces and disposes the originals). It never moves,
  and is **parented to the logo group** so it inherits the idle spin, cursor
  tilt and charge shake rather than sitting frozen while the skin moves.
  Surfaces at `BODY_OPACITY` (`renderOrder: 0`), outlines via `EdgesGeometry`
  at `BODY_EDGE_OPACITY` (`renderOrder: 1`).

At `BODY_OPACITY: 0` the surface meshes are skipped entirely and their cloned
geometry disposed, so the body renders as a pure wireframe — which is what
trionn's late frames actually show — with no invisible draw calls.

### 7.2 Drag vs. hold

`onDown` already set `dragging`, and hold-to-charge also begins on
`pointerdown`. Trionn resolves the same collision by carrying both `dragging`
and `holding`. Our rule:

```
pointerdown            → begin charging; record start x/y
moved > 6px            → reclassify as a drag: cancel charge, hand off to drag+inertia
released before full   → reform
charge reaches 1.0     → fully separated; held while the pointer stays down
release                → reform
```

Existing drag, inertia, cursor deflection and keyboard rotation are unchanged.

### 7.3 Tuning — owner-approved 2026-08-08

| Constant | Value | Note |
|---|---|---|
| `CHARGE_MS` | 950 | hold to full separation |
| `REFORM_MS` | 2500 | far slower than trionn's 600 — faces drift back, don't snap |
| `SEPARATE_START` | 0.65 | fraction of charge before anything moves — the flare |
| `STAGGER_MAX` | 0.2 | extra per-panel delay |
| `SPREAD_FRAC` | 1.6 | drift distance, × logo height |
| `SPREAD_VAR` | 0.8 | ± per-panel variation |
| `LATERAL_DRIFT` | 0.75 | sideways component (camera is near front-on) |
| `SPIN_MIN` / `SPIN_MAX` | 0.18 / 0.21 | × π radians — low, so it glides |
| `CAP_NORMAL_MIN` | 0.79 | cap vs side-band cutoff |
| `NORMAL_FOLLOW` | 0.55 | |
| `HATCH_STRENGTH` / `HATCH_SCALE` | 0.65 / 0.5 | dense, strong strokes |
| `SHINE_STRENGTH` / `WIDTH` / `SPEED` | 0.3 / 0.05 / 0.9 | narrow band = hard specular streak |
| `SHINE_CHARGE_BOOST` | 1 | |
| `SHINE_WARM` / `SHINE_BRIGHT` | `#B4571C` / `#FFF8E0` | |
| `SKIN_OPACITY` | 0.6 | glassy but the palette survives the light ground |
| `BODY_OPACITY` | 0 | wireframe only |
| `BODY_EDGE_OPACITY` / `BODY_EDGE_ANGLE` | 0.9 / 26 | |
| `VIBRATE_FRAC` / `VIBRATE_PHASE_STEP` | 0.006 / 1.1 | |
| `DRAG_THRESHOLD_PX` | 6 | |

`SHATTER` is deliberately a mutable object so the dev bench can write to it live.

**Known consequence of this tuning:** at `SPREAD_FRAC` 1.6 with ±0.8 variation,
panels reach the frame edges by ~350 ms and are gone by ~1200 ms, so most of the
travel happens off-screen. The effect reads as "the skin blows away, leaving the
ghost" rather than a visible glide. Around 0.6–0.9 would keep faces in view far
longer if that is ever wanted.

### 7.4 Public interface

```ts
engine.onShatter(cb: (e: 'blast' | 'reform' | 'idle') => void): () => void
engine.getCharge(): number   // 0..1
```

Discrete transitions are events; the continuous charge is **pulled**, so no
object is allocated per frame. **Nothing subscribes today** — this exists so the
orbiting-planets sub-project (§9) can react without the separation knowing about
it. That decoupling is what let this ship before the constellation is replaced.

## 8. Fallbacks and verification

### 8.1 Fallbacks

- **`prefers-reduced-motion`** — never engages; partitioning, patching and the
  inner body are all skipped, avoiding the attribute memory entirely.
- **Not armed until the mesh is live**, gated on the existing `LogoStage` ready
  signal, so a press during the sketch-draw video can't trigger it.
- **Scrolled away** — charging refused past 15% of viewport height (mirroring
  trionn's `scrollProgress < 0.15`). A blast already in flight still reforms.
- **Header/nav/links are safe** — `onDown` binds to the canvas, not `window`.
- **`pointercancel` and window `blur` reform**, so a blast can't stick open.
- **WebGL failure** — unchanged; `LogoStage`'s 4 s fallback still forces the
  video→mesh handoff and the separation simply never arms.

### 8.2 Verification

Panel positions live on the GPU and can't be read back, so verification is
layered. A headless-Chrome harness (`puppeteer-core`, installed in the session
scratchpad only) drives real mouse down/hold/up against the dev bench:

1. **JS state** — charge ramp, event ordering, drag-vs-hold, timings.
2. **Shader compile** — a silent GLSL failure renders a perfectly normal-looking
   logo that simply never separates, which is easy to misread as "not triggered".
3. **Frame contact sheets** — the progression captured at intervals and tiled
   into one image, which is what caught the fracture-vs-separation error that
   single screenshots had hidden.
4. **Typecheck**, plus SSR curl on both locales.

Measured after the approved tuning: charge 0 → 1 and holds; on release
0.611 → 0.312 → 0.129 → 0.031 → **0 at 2500 ms**, staying 0; events
`blast → reform → idle`; drag cancels a charge; no console errors.

**Note on the browser pane:** it cannot reach localhost on this project and its
tabs report `document.hidden`, which pauses `rAF` and stalls the render loop.
The puppeteer harness exists because of that, and is the reliable path.

## 9. Out of scope

Two further sub-projects, each getting its own spec, plan and build cycle:

- **Electrical sketch→3D transition** — reference video at
  `_ASSETS/video/Transition-3d-sketch-to-3d-rotating.mp4`. Related to trionn's
  discharge arc (§3.3).
- **Orbiting glowing planets** — replaces `ConstellationField.tsx`; reference at
  `_ASSETS/video/Orbiting-orbs-sample.mp4`. Will subscribe to §7.4.

`ConstellationField` is **not modified** here — it is scheduled for replacement,
so wiring the separation into its existing `gather`/`spiralBurst` would be
thrown away.

## 10. Files

New:
- `src/lib/three/shatter/{types,partition,shatterMaterial,ShatterController}.ts`
- `src/app/(frontend)/[locale]/dev/shatter/{page,ShatterLab}.tsx` — dev-only
  tuning bench, `notFound()` in production. Uses the real `LogoEngine`, so what
  is approved there is the shipping path. It publishes `window.__ttShatter` for
  tuning and automated checks; that handle never reaches a production build.

Modified:
- `src/lib/three/LogoEngine.ts` — builds the inner body, partitions and patches
  the skin, resolves drag-vs-hold, advances charge and the shine clock, exposes
  `onShatter`/`getCharge`/`setShatterArmed`

Unchanged: `materials.ts`, `calibration.ts`, `loadLogo.ts`, `ConstellationField.tsx`,
`SketchIntro.tsx`, `LogoStage.tsx`, all CMS collections and seed data. **The
homepage hero is not yet wired to this** — the capability and the bench exist;
arming it on the live hero is a separate step.
