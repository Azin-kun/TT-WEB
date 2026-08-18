# Hero Orbiting Orbs — Design

**Date:** 2026-08-10 · **Sub-project 3 of 3** of the hero-effects upgrade
**Status:** design approved in brainstorming; no implementation yet
**Observations:** [2026-08-10-orbiting-orbs-reference-observations.md](./2026-08-10-orbiting-orbs-reference-observations.md)

Replaces `ConstellationField` with glowing orbs orbiting the 3D logo, each carrying one
CMS word revealed on hover.

## 1. Goal

The hero logo is currently surrounded by floating words tethered by graphite strings
(`ConstellationField`). That component is deleted and replaced by a system of small glowing
rings orbiting the mark in true 3D, with the orbit paths drawn as faint trace lines.

The reference clip (`_ASSETS/video/Orbiting-orbs-sample.mp4`) is **mood, not target** — it
is 368×368, 2.17s, and its page scrolls throughout, so nothing in it is measurable. See the
observations doc. The owner's brief below is the authoritative requirement.

## 2. Owner's decisions (2026-08-10)

| Decision | Value |
|---|---|
| Words | Kept, revealed on hover. Orbs are pure light at rest. |
| Orb count | **Follows the CMS word list** — one orb per word. Add a word, get an orb. |
| Starting count | **8** (word list trimmed from 12; owner adjusts in the CMS afterwards) |
| Mobile | **Same count as desktop.** No mobile cap. |
| Size | Orbs and labels deliberately **small**, so the hero does not read as busy. |
| Orbit planes | **3 distinct tilt angles.** Heights vary freely per orb. |
| Hold coupling | **Continuous** — orbs respond to the separation's rising charge. |
| Architecture | **True 3D**, in the logo's own scene. |
| Degradation | Reduced motion → static. Scroll → dissolve over first 60vh. |

## 3. Architecture

New module `src/lib/three/orbs/`, a **parallel** sibling of `shatter/` and `ignition/` —
not an extension of either. That pattern was explicitly validated by the 2026-08-10
whole-branch review: the three modules share only `mulberry32` and `CALIB`, and meet at
narrow, tested seams.

```
src/lib/three/orbs/
  types.ts              OrbsConfig + frozen DEFAULT_ORBS, OrbUniforms
  resolveOrbs.ts        CMS <-> engine mapping        (+ .check.ts)
  orbField.ts           deterministic orbit assignment (+ .check.ts)
  orbMaterial.ts        ring shader + trail material
  OrbsController.ts     state, charge response, entrance (+ .check.ts)
```

Driven by `LogoEngine`, exactly as `ignition/` is. All four check scripts join
`npm run verify:config`, taking it from 5 suites to **9**.

### 3.1 Orbit geometry

Each orb `i` carries:

| Field | Meaning |
|---|---|
| `y` | height of its orbit's centre, along the logo's vertical axis |
| `radius` | orbit radius |
| `tiltIndex` | which of the **3** tilt angles this orbit's plane uses |
| `phase` | starting angle |
| `speed` | angular velocity |

Position at time `t`:

```
centre  = logoCentre + (0, y, 0)
local   = (radius·cos(θ), 0, radius·sin(θ))        θ = phase + speed·t
world   = centre + R(tilt[tiltIndex]) · local
```

Rotating the circle out of the XZ plane is what produces a **foreshortened ellipse** on
screen. The observations doc is explicit that the reference's orbits are near edge-on, not
face-on — a face-on orbit reads as a flat halo and destroys the sense of depth. The three
tilt angles default to distinct, mostly-shallow inclinations.

### 3.2 The separation rule — the one real constraint

The owner's original rule was: *orbs may share a height, and when they do their radii must
differ.* Heights now vary freely, which makes exact height collisions rare — so the rule is
implemented in its robust generalisation:

> **No two orbs may sit close in BOTH height and radius.**

Two orbs alike in both trace effectively the same ellipse, and read as one path with two
beads on it rather than as two orbits. `orbField.ts` enforces a minimum separation in
`(y, radius)` space: candidates are generated from a seeded PRNG and rejected/retried until
each is far enough from every already-placed orb, with a bounded retry count that falls back
to nudging the radius outward so generation can never fail to terminate.

**Units:** `y` and `radius` are both expressed as **fractions of the logo's height**, so the
separation threshold is a single scale-free number and the whole field rescales with the mark
(which itself now rescales with the viewport — see `videoCoverScale` in `calibration.ts`).
Two orbs conflict only when they are within the threshold on **both** axes at once; being
close in height alone, or in radius alone, is fine and expected.

This is the module's most important property and is directly unit-testable without a
browser — see §6.

### 3.3 Occlusion — the one non-obvious technical requirement

Being in the 3D scene does **not** give occlusion for free on this codebase.
`LogoEngine` sets `depthWrite = false` on every logo material — the skin
([LogoEngine.ts:162](../../../src/lib/three/LogoEngine.ts)), the inner body surfaces
(:292) and the body edges (:303). The depth buffer is therefore empty, and orbs would paint
over the mark regardless of where they actually are.

**Fix:** a depth-only pass. A clone of the logo geometry with `colorWrite: false`,
`depthWrite: true`, rendered immediately before the orbs. Orbs then depth-test correctly and
genuinely disappear behind the mark.

**Accepted approximation:** the skin is 60% opaque, so a strictly correct result would show
orbs faintly *through* it. The depth mask hides them completely. This is deliberate — fully
hidden reads more clearly and costs one extra draw of existing geometry rather than a
sorted-transparency system.

### 3.4 Orb appearance

Small **bright-rimmed rings**, not filled dots — the single appearance detail the reference
did establish (a chain of circular outlines traced along an arc in the lighten composite).

Rendered as one `THREE.Points` draw with a ring SDF in the fragment shader.

> ⚠️ **`gl_PointSize` must attenuate against the camera's actual distance to the logo, with
> a hard pixel clamp — never the common `300.0 / -mv.z` idiom.** That idiom assumes a far
> larger world scale than this scene's `CAMERA_Z = 2.4`, and in the ignition it produced
> ~437px points and **5.9 fps**. Reuse the `uPointRef` approach from
> `ignition/ignitionMaterial.ts`, which is the fixed version of exactly this bug in exactly
> this scene.

Default orb size is small by owner instruction, and CMS-tunable.

### 3.5 Trails

One thin line per orbit path — the complete ellipse, low opacity, warm palette. The paths
are static geometry (only the orb moves along one), so trails are built once and never
updated. This delivers the orbit trace lines the owner asked for on 2026-08-08.

`trailOpacity: 0` disables them without removing the orbs.

### 3.6 Word labels

One DOM element per orb, absolutely positioned each frame by projecting the orb's world
position to screen coordinates. Opacity 0 until the cursor is near.

DOM rather than canvas so the words remain real text — readable by screen readers and search
engines, which matters because they are the hero's only body content besides the headline.

Hover resolves to the **nearest orb within a screen-space threshold**, not a raycast.
Raycasting targets this small is unforgiving, and proximity matching is both cheaper and
kinder. Only one label is shown at a time.

### 3.7 Charge coupling

Sub-project 1 shipped `engine.onShatter()` (discrete `blast`/`reform`/`idle`) and
`engine.getCharge()` (continuous 0..1, pull-based) with **nothing subscribed**, specifically
for this. Both are now used:

- **Continuous:** each frame, `getCharge()` scales orbital speed up, eases radius slightly
  inward, and raises brightness — the orbs grow agitated as the logo charges.
- **Discrete:** `blast` flings them outward; `reform` eases them home.

`getCharge()` is pulled rather than pushed precisely to avoid per-frame allocation; the orb
tick must honour that and allocate nothing.

⚠️ The ignition already re-pulses the cage every 2.5s during a hold. Orb reaction is tuned to
stay **subordinate** to that, not to compete with it.

### 3.8 Entrance

Orbs enter on the ignition's **`cue`** event, which `ignition/types.ts` already anticipates
in the comment on `CUE_FRAC` ("Sub-project 3's orbs enter here"). The cue lands as the charge
front finishes, so the ignition's energy disperses *into* the arriving orbs.

`onLive` currently fires at cue and drives `ConstellationField`; the orbs take that signal
unchanged.

### 3.9 Degradation

Mirrors what `ConstellationField` already does, so the hero behaves consistently:

- **`prefers-reduced-motion: reduce`** → orbs are drawn once at their phase-0 positions and
  never animated. No `requestAnimationFrame` loop, no charge coupling, no entrance stagger.
  Trails and labels still render, so no content is lost.
- **Scroll** → the whole orb layer dissolves over the first 60vh, as the constellation does
  today. No scroll pinning.
- **`constellationEnabled: false`** → no orbs, no trails, no labels; the field is not built
  at all.
- **No mobile cap.** Every orb shows on every viewport, per the owner's 2026-08-10 decision.
  This is a deliberate departure from `ConstellationField`, which caps at 8 words below
  640px; orb and label sizes are kept small instead, which is how the hero is kept from
  reading as busy on a phone.

Known adjacent gap, **not** fixed here: the logo mesh keeps idle-rotating under reduced
motion, because `setInteractive(false)` disables only the interactive effects. Measured
2026-08-10. Static orbs beside a still-spinning mark will look slightly inconsistent. It is
pre-existing and out of this sub-project's scope, but it is the natural moment to raise it
with the owner again.

## 4. Replacing ConstellationField

`src/components/hero/ConstellationField.tsx` is **deleted**.

**CMS field names are kept** — `floatingWords` and `constellationEnabled` — with only their
admin labels updated to speak of orbs. Renaming them means a Payload schema change, and this
project hit exactly that friction on 2026-08-10 when a schema push blocked on an
unanswerable interactive prompt. Labels are free; field names are not.

The seed's word list is trimmed 12 → 8 per locale (the first 8 of the existing lists). The
owner adds or removes words in `/admin` afterwards, and the orb count follows.

## 5. Configuration

A new `orbs` group on the existing `hero-effects` Payload global, resolved by
`resolveOrbs()` exactly as `resolveIgnition()` does — frozen defaults, CMS values merged
over them, nulls falling back rather than becoming 0, ranges clamped so an invalid state is
unrepresentable even via the REST API.

Fields: enabled · orb size · orb colour · glow strength · the 3 tilt angles · radius range ·
height range · minimum (y, radius) separation · base speed + variance · trail opacity ·
charge response strength · entrance duration · seed.

Not localized — numbers and hex strings, identical EN/ID.

## 6. Verification

**Unit (`tsx` check scripts, no browser, wired into `verify:config`):**

- `orbField.check.ts` — **the important one.** Asserts the §3.2 rule holds for many seeds and
  counts: no two orbs close in both height and radius; generation is deterministic for a
  given seed; a different seed gives a different arrangement; orb count equals word count;
  only 3 distinct tilt angles are ever used; generation terminates for pathological configs
  (tight ranges, high counts).
- `resolveOrbs.check.ts` — CMS round-trip, including the **perturbed-value-differs-from-
  default guard** added on 2026-08-10 after one ignition assertion silently went tautological
  when a default moved.
- `OrbsController.check.ts` — entrance fires exactly once; charge response is monotonic in
  charge; reduced motion produces no motion; dispose is safe.

**Browser (headless Chrome via `puppeteer-core`, harness in `docs/superpowers/verification/`):**

- Orbs visibly pass **behind** the mark — the depth pass working is the claim most likely to
  be wrong, and it is invisible to unit tests.
- Hovering an orb reveals exactly one word.
- Holding the logo visibly agitates the orbs.
- Reduced motion draws orbs but never animates them.

> ⚠️ The in-app browser pane **cannot** verify any of this: it reports the tab hidden and
> throttles `requestAnimationFrame` to ~1 Hz, which stalls the engine's own clock. Always
> headless Chrome. Tile frames into a contact sheet before judging them.

## 7. Deliberately out of scope

- Orbs carrying anything but a word (icons, images, links).
- Orb-to-orb interaction or collision response.
- Orbs anywhere but the hero.
- Changing the ignition or separation effects. This module only *reads* their signals.
