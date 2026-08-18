# Task 9 — hero ignition browser verification, results

**Date:** 2026-08-10 · **Branch:** `feat/hero-ignition` · **Plan:** [2026-08-09-hero-ignition.md](../plans/2026-08-09-hero-ignition.md) Task 9

Headless Chrome via `puppeteer-core`, software rasterisation, viewport 900×700,
dev server on `localhost:3000`. All three steps pass.

## Step 1 — contact sheet of the transition

152 frames over 4.5 s (~30 ms apart), captured via CDP screencast starting 2 s
before the video ends so the overlay phase is included. `page.screenshot()` was
tried first and abandoned: ~360 ms per frame against this scene, far too coarse
to read a 2 s transition.

Visual assertions, all confirmed on the tiled sheet:

- a cold graphite cage is present at the start — blooms as a dark writhing oval
  around the mark while the video is still up
- the cage contracts onto the logo, red embers appearing at its rim
- a red charge front sweeps and solid surfaces materialize in its wake
- the cage is gone by the end; the mark settles solid

Quantified from the same frames (`t9-ring-profile.mjs`), core ink over the run:

| Phase | Core ink |
|---|---|
| video playing | 0.234 → 0.285 |
| **cage ignites** | 0.312 → **0.512** |
| cage held | ~0.50 |
| teardown / logo materialising | 0.394 → 0.218 |
| settled logo | 0.297 (±9% with the idle spin) |

The cage is therefore a **1.73×** densification of the centre — the number the
reduced-motion test's threshold is calibrated against.

## Step 2 — the draco stall regression test

Reproduces, for ignition, the class of bug the 2026-08-09 review found in the
separation: a signal arriving **before `load()` resolves** must not be dropped.

`logo.draco.glb` stalled by 14 s via request interception (**only** the `.glb` —
stalling the Draco worker scripts is a documented test artifact). Observed
timeline in the passing run:

```
+10498ms  sketch video ends            -> introDone
+14590ms  LogoStage forces canvasReady -> `live`, startIgnition() with NO controller yet
+21591ms  floating words enter         -> `cue` fired
          hold -> logo separates       -> `done` fired, so `armed` was set
```

The test **refuses to pass unless it can prove the race was exercised**:
LogoStage's forced-handoff `console.error` is asserted, not assumed. If the
stall is too short to force that path, the run fails rather than passing
vacuously.

| Assertion | Result |
|---|---|
| the `.glb` request was actually intercepted | ok |
| the slow-load race was exercised (fallback path taken) | ok — +14590 ms |
| `cue` fired despite the slow load (words entered) | ok — 3/12 lit |
| `done` fired despite the slow load (the hold **separates** the logo) | ok — ring ink peak **0.1146** vs idle-spin control **0.0004** |
| no unexpected console errors | ok |
| the scene actually settled before measuring | ok — after 3781 ms |

`cue` is observed **directly**, not inferred: the floating words are real DOM
elements whose inline opacity stays 0 until `ConstellationField`'s `active` prop
goes true, and that prop is driven by `LogoStage`'s `onLive`, which fires on the
ignition's `cue` and nothing else.

The separation measurement carries an in-run control: the cursor is parked on
the logo **before** the control window, so the only difference between the two
windows is the button being down. Ring ink across the hold window traced
`0.0005 → 0.0004 → 0.0057 → 0.1146 → 0.1012` — the panels visibly sweeping
outward — against a control that never left 0.0003–0.0004.

## Step 3 — reduced motion

`prefers-reduced-motion: reduce` emulated before navigation, so the first
`matchMedia` read in `LogoCanvas` sees it.

| Assertion | Result |
|---|---|
| reduced motion actually emulated | ok |
| logo canvas exists with a real backing store | ok — 900×700 |
| the sketch video is skipped entirely | ok — `paused`, `currentTime` 0 |
| `cue` fired early, via the immediate path | ok — **12/12** words lit at opacity 0.85 by +4981 ms |
| nothing ignites — no cage is ever drawn | ok — core swing **1.08×** vs 1.73× for a real cage |
| no transition burst in the bridge window | ok — max frame delta 11.48 |
| no console errors | ok |

All 12 words reach full opacity within 5 s with no video and no bridge, which is
the signature of `finishIgnitionNow()` emitting `seed`/`cue`/`done` in one
synchronous pass at mount — the guarantee that `armed` and the floating words
can never be stranded behind a transition that never runs.

## Observations for the owner — not fixed here

1. **The paper tone shifts visibly at the video's fade-out.** Around the
   handoff the warm paper of the video gives way to the site's cooler, lighter
   background. The bridge hides the *cut*, but not this tonal step. Pre-existing
   (the two video generations' paper tones already differed) and cosmetic.

2. **The logo keeps idle-spinning under `prefers-reduced-motion: reduce`.**
   `setInteractive(false)` disables the interactive path — separation, ignition,
   cage — but not the continuous idle rotation, which measured a 0.083 → 0.273
   core-ink swing over one sampling window. Pre-existing and outside this
   branch's scope, but a genuine accessibility gap worth a decision.

## Deviation from the plan

The plan says to keep these scripts in the session scratchpad, "never inside the
app". The scripts are now committed under `docs/superpowers/verification/`
instead. The constraint's actual purpose — keeping `puppeteer-core` and
`ffmpeg-static` out of the app's dependencies — is preserved: nothing here is
imported by `src/`, referenced by any `npm` script, or added to `package.json`.
The handoff has twice recorded the cost of recreating this harness from scratch.

Contact sheets are **not** committed; multi-megabyte PNGs earn little in a git
history, and the measurements above are the reviewable artifact.
