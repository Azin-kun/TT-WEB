# Hero Logo Hold-to-Shatter — Design

**Date:** 2026-08-08
**Status:** Approved for planning
**Scope:** Sub-project 1 of 3 (see §9)

## 1. Goal

Add trionn.com's signature hero interaction — **hold the pointer on the logo to charge, and it breaks apart into tumbling shards; release and it reassembles** — to the TAMPA TARUNO hero, rendered in the existing Atelier pencil language (warm paper, graphite matcap, red `#830401`).

The site keeps its current look. Nothing about the Atelier appearance changes.

## 2. What already exists

`src/lib/three/LogoEngine.ts` already drives the hero mesh:

- idle counter-clockwise spin, one revolution ≈ 14 s (`IDLE_W = 2π/14`)
- cursor deflection up to ±12° with a spring return (lerp factor `0.06`)
- drag to spin, with inertia (velocity damping `0.94`)
- keyboard rotation, ±15° per arrow press
- two material slots, `logo-black` and `logo-red`, both `MeshMatcapMaterial` using a procedurally drawn pencil cross-hatch matcap (`src/lib/three/materials.ts`)

The mesh is `public/models/logo.draco.glb` — 53.7 KB Draco, **19,704 triangles**, produced by SVG → `ExtrudeGeometry` (depth 9% of width, bevel 1.1%/1.0%, curveSegments 5). It is a single flat extruded plate, not pre-fractured.

Toolchain: three.js `^0.185.1`, Next.js `~15.4.11`, GSAP `^3.15.0`.

So "a rotating logo" is **already shipped**. This spec adds only the shatter.

## 3. Research: what trionn actually does

Read from trionn.com's source bundle (`1233qowaitufq.js`) on 2026-08-08.

**Provenance caveat:** the symbol could not be observed *rendering*. It mounts behind an intro sequence that requires a genuinely foregrounded page load, and every automated navigation backgrounds the tab (`document.hidden: true`), leaving `#trionn-symbol-canvas-wrap` empty. Every value below is read from source, so the numbers are exact, but the motion was never watched. Treat the *feel* as unverified; the *mechanics* as reliable.

### 3.1 Rendering architecture

One `WebGLRenderer` (`powerPreference: "high-performance"`, `ACESFilmicToneMapping`, exposure `1.1`, clear colour `789516` = `#0C0C0C`), driving **two scenes**:

- a perspective scene holding the symbol
- an **orthographic full-screen plane** whose texture is an ordinary 2D canvas (`getContext('2d')`), where the interactive "lines" are drawn each frame, composited on top at `renderOrder: 1e4`

Responsive camera: `fov/z` = `42/6` (>1440px), `40/6.28` (≥1024), `38/7.55` (≥768), `36/9.35` (below). Device pixel ratio capped at `1` on mobile, `1.5` on desktop. `prefers-reduced-motion` is checked.

No `.glb`/`.gltf`/`.svg` is fetched — the symbol geometry is built procedurally in code.

### 3.2 Rotation

Two separate systems. Smoothed pointer parallax on the whole symbol:

```
rotation.x += (rotX + 0.22 * pointer.y - current.x) * k
rotation.y += (rotY + 0.22 * pointer.x - current.y) * k
```

and, per fragment during the blast:

```
rotation.{x,y,z} = spinAxis.{x,y,z} * spinSpeed * n * PI
```

Each fragment carries its own `spinAxis` (a `Vector3`) and `spinSpeed`, so every piece tumbles differently. **This second formula is what we reproduce.**

### 3.3 Charge/blast state machine

`mousedown` inside the hero — excluding `<a>`, `<button>`, the sound toggle, and the keyfacts section, and only while `scrollProgress < 0.15` — starts the charge:

| Variable | Behaviour |
|---|---|
| `holdTime` | `+= 1/60` per frame while held |
| `clickBurst` | charges toward `1` (`Math.min(1, …)`), decays toward `0` (`Math.max(0, …)`) |
| `vibrateAmt` | set to `1` on press, then `*= 0.88` per frame |
| `vibratePhase` | `+= 1.1` per frame — drives the shake oscillator |
| `scrollProgress` | smoothed: `+= (target - current) * k` |

On release, fragments return with `transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)`. If `clickBurst >= 0.98` at release, a "join" sound plays.

The whole system suspends past 80% scroll progress.

**Not being ported:** the sound design (vibrate/explode/join/woosh), the 2D-canvas line layer, `mix-blend-difference` headline treatment, and the near-black palette. Those belong to trionn's dark aesthetic, which TT deliberately does not share.

## 4. Architecture

Four new files under `src/lib/three/shatter/`, plus wiring in `LogoEngine`:

| File | Responsibility |
|---|---|
| `types.ts` | Shared types and tuning constants |
| `partition.ts` | CPU, once: de-index geometry, assign triangles to shard cells, write attributes |
| `shatterMaterial.ts` | `onBeforeCompile` patch and the shared uniform object |
| `ShatterController.ts` | Charge/blast/reform state machine; owns `uBlast`; emits events |

Data flows one direction:

```
pointerdown ─► ShatterController (JS state) ─► uBlast uniform ─► vertex shader ─► pixels
                     │
                     └─► blast/reform/idle events ─► (no subscribers yet)
```

The state machine lives entirely in JS; the GPU only renders a number it is handed. This is deliberate — it is what keeps the feature verifiable despite the displacement happening in a shader (§8).

## 5. Shard generation

Runs once, after `loadLogo()` resolves, for each of the two meshes.

1. **`toNonIndexed()`.** Required so that each triangle belongs to exactly one shard. With shared vertices, triangles spanning two cells stretch between them like taffy instead of breaking cleanly. Cost: 19,704 triangles → **59,112 vertices**.
2. Scatter **40 Voronoi seeds** in the XY plane across the mesh bounding box. The logo is a flat extrusion, so planar cells read as genuine cracks through the plate.
3. Assign each triangle to the nearest seed by centroid. 19,704 × 40 ≈ 788k distance comparisons — a few milliseconds, once.
4. Write three attributes per vertex:

| Attribute | Type | Meaning |
|---|---|---|
| `aOrigin` | `vec3` | shard centroid — the pivot it tumbles around |
| `aAxis` | `vec3` | normalised random spin axis |
| `aParams` | `vec2` | `x` = spin speed (random within `SPIN_RANGE`), `y` = stagger delay (random within `0 – STAGGER_MAX`) |

Outward direction is **derived** in the shader as `normalize(aOrigin - uCenter)` rather than stored, saving a `vec3` per vertex.

Attribute memory: 8 floats × 59,112 × 4 bytes ≈ **1.9 MB** on the GPU. The 53.7 KB download is unchanged.

`aParams.y` (stagger) is what prevents all 40 shards moving as one rigid cloud — they break in a ripple rather than in lockstep.

## 6. Shader patch

One shared patch applied to both material slots via `onBeforeCompile`. Helpers injected by replacing `#include <common>` (which also already defines `PI`):

```glsl
uniform float uBlast;    // 0..1
uniform vec3  uCenter;   // logo centre, shared by both meshes
uniform float uSpread;   // max outward travel

attribute vec3 aOrigin;
attribute vec3 aAxis;
attribute vec2 aParams;  // x = spin speed, y = stagger delay

vec3 rotAxis(vec3 v, vec3 axis, float a){
  float c = cos(a), s = sin(a);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

float shardT(){
  return clamp((uBlast - aParams.y) / max(1e-4, 1.0 - aParams.y), 0.0, 1.0);
}
```

Injected after `#include <beginnormal_vertex>` — **this is the step that keeps the matcap lighting correct.** `MeshMatcapMaterial` derives its lookup from the view-space normal, so a shard whose vertices rotate but whose normals do not will light as though it never moved:

```glsl
objectNormal = rotAxis(objectNormal, aAxis, aParams.x * shardT() * PI);
```

Injected after `#include <begin_vertex>`:

```glsl
float t = shardT();
vec3 local = rotAxis(transformed - aOrigin, aAxis, aParams.x * t * PI);
transformed = aOrigin + local + normalize(aOrigin - uCenter + 1e-5) * (uSpread * t);
```

The rotation term reproduces trionn's `spinAxis * spinSpeed * n * PI` exactly.

Both materials share **one uniform object**, so a single JS write per frame drives the whole effect: one uniform update, one draw call per material, no per-frame CPU geometry work.

`uCenter` is computed once from the **combined** bounding box of both meshes and is identical for both materials. Using each mesh's own centre instead would make the black and red halves fly apart in different directions.

## 7. Interaction

### 7.1 Drag vs. hold

`LogoEngine.onDown` already sets `dragging = true`, and hold-to-charge also begins on `pointerdown`. Trionn resolves the same collision by carrying both `r.dragging` and `r.holding`. Our rule:

```
pointerdown            → begin charging; record start x/y
moved > 6px            → reclassify as a drag: cancel charge, hand off to existing drag+inertia
released before full   → reform
charge reaches 1.0     → shattered; held open while the pointer stays down
release                → reform
```

Existing drag, inertia, cursor deflection and keyboard rotation are unchanged.

### 7.2 Tuning constants

Starting values. These are expected to be tuned live with the owner.

| Constant | Value | Source |
|---|---|---|
| `CHARGE_MS` | 900 | hold ≈ 0.9 s to fully break |
| `REFORM_MS` | 600 | trionn's `0.6s` |
| `REFORM_EASE` | `cubic-bezier(.25,.46,.45,.94)` | trionn's exact curve |
| `DRAG_THRESHOLD_PX` | 6 | drag-vs-hold discrimination |
| `SPIN_RANGE` | 0.6 – 1.2 | per-shard `aParams.x`, in multiples of π radians at full blast |
| `SPREAD` | 0.35 × logo height | outward travel |
| `SHARD_COUNT` | 40 | Voronoi cells |
| `STAGGER_MAX` | 0.35 | max per-shard stagger delay |
| `VIBRATE_MAX` | 0.006 × logo height | peak shake amplitude at full charge |
| `VIBRATE_PHASE_STEP` | 1.1 | trionn's `vibratePhase += 1.1` |

`REFORM_EASE` is evaluated **in JS** with a cubic-bézier solver (Newton–Raphson on the x axis), not as a CSS transition — the reform drives a uniform, not a DOM property. Trionn could use a CSS transition because its fragments were DOM elements; ours are vertices.

### 7.3 Vibration

Stays in JS, not the shader: amplitude `VIBRATE_MAX * charge`, phase advancing `VIBRATE_PHASE_STEP` radians per frame, applied to `group.position`. Keeping it CPU-side means the shake is readable and tunable without recompiling a shader.

### 7.4 Public interface

```ts
engine.onShatter(cb: (e: 'blast' | 'reform' | 'idle') => void): () => void
engine.getCharge(): number   // 0..1
```

Discrete transitions are events; the continuous charge value is **pulled**, not pushed, so no event object is allocated per frame.

**Nothing subscribes to this today.** It exists so the orbiting-planets sub-project (§9) can react to the shatter without the shatter knowing anything about it. This is the decoupling that lets sub-project 1 ship before the constellation is replaced.

## 8. Fallbacks, edge cases, verification

### 8.1 Fallbacks

- **`prefers-reduced-motion`** — shatter never engages, and partitioning is **skipped entirely**, avoiding both the 1.9 MB and the setup cost. `LogoCanvas` already computes this and calls `setInteractive(false)`.
- **Not armed until the mesh is live.** Gated on the existing `LogoStage` ready signal so it cannot fire during the sketch-draw video.
- **Scrolled away.** Charging is refused once the hero has scrolled more than 15% of viewport height, mirroring trionn's `scrollProgress < 0.15` gate. A blast already in flight still reforms normally rather than freezing mid-break.
- **Header/nav/links are safe.** `onDown` is bound to the canvas, not `window`, so clicks elsewhere never reach it.
- **`pointercancel` and window `blur` reform**, so a blast can never get stuck open.
- **Mobile stays enabled.** The work is per-vertex in a single draw call, cheap even on weak GPUs. `MOBILE_HEIGHT_FRAC` already shrinks the logo; `SPREAD` scales off logo height so the blast scales with it.
- **WebGL failure** — unchanged. `LogoStage`'s existing 4 s fallback still forces the video→mesh handoff; the shatter simply never engages.

### 8.2 Verification

Shard positions live on the GPU and cannot be read back from JS, so verification is layered. Layers 2 and 3 exist specifically to cover that.

1. **JS state assertions** — charge value, event ordering, drag-vs-hold discrimination, timings. Asserted inside a single atomic in-page script, which is this project's documented-reliable pattern (cross-tool-call DOM checks after a synthetic click are known unreliable here).
2. **Shader compile check** — assert the patched program links and that the uniform and attributes bind. Without this, a silent shader failure renders a perfectly normal-looking logo that simply never shatters, which is easy to mistake for "not triggered".
3. **`gl.readPixels` at the logo centre** — graphite at `uBlast = 0`, paper at `uBlast = 1`. Direct, screenshot-free proof that vertices actually moved. This is the check that catches "normals rotated but geometry didn't", and vice versa.
4. **Typecheck, plus SSR curl on both locales**, per project convention.

The browser pane on this project is unreliable for visual confirmation, so final aesthetic sign-off is the owner eyeballing it live — as with every previous hero change.

## 9. Out of scope

This spec covers the shatter only. Two further sub-projects were agreed on 2026-08-08, each to get its own spec, plan and implementation cycle:

- **Electrical sketch→3D transition** — an electrical effect on the `SketchIntro` video → `LogoStage` mesh handoff. Blocked on the owner's reference video.
- **Orbiting glowing planets** — replaces `ConstellationField.tsx` (628 lines) with glowing planets carrying the CMS-fed words, orbiting the logo. Will subscribe to the §7.4 interface. Blocked on the owner's reference video.

Also explicitly not in scope: sound design, the 2D-canvas line layer, `mix-blend-difference` headline treatment, and any move toward trionn's dark palette.

`ConstellationField` is **not modified** by this work. Its existing hover-gather and `spiralBurst` behaviour is left exactly as-is, precisely because it is scheduled for replacement.

## 10. Files touched

New:
- `src/lib/three/shatter/types.ts`
- `src/lib/three/shatter/partition.ts`
- `src/lib/three/shatter/shatterMaterial.ts`
- `src/lib/three/shatter/ShatterController.ts`

Modified:
- `src/lib/three/LogoEngine.ts` — instantiate the controller, apply the material patch, resolve drag-vs-hold in `onDown`/`onMove`/`onUp`, advance charge in `tick`, expose `onShatter`/`getCharge`
- `src/components/three/LogoCanvas.tsx` — arm the shatter once ready; pass the reduced-motion flag through
- `src/components/hero/LogoStage.tsx` — forward the live signal that arms the shatter

Unchanged: `materials.ts` (the patch is applied by `shatterMaterial.ts`, the matcap itself is untouched), `calibration.ts`, `loadLogo.ts`, `ConstellationField.tsx`, `SketchIntro.tsx`, all CMS collections and seed data.
