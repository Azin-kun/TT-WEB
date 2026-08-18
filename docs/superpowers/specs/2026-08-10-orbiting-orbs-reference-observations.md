# Sub-project 3 — orbiting orbs: reference observations

**Date:** 2026-08-10 · **Status:** analysis only, nothing specced or built yet
**Source:** `_ASSETS/video/Orbiting-orbs-sample.mp4`
**Method:** all 52 frames extracted and examined individually, plus zoomed crops of the
orbit region and per-pixel `lighten` / `motion` composites. Scripts: `orb-analyse.mjs`
(kept in `docs/superpowers/verification/`).

## Read this first: the reference is weak, and the owner's brief is the real spec

The owner supplied this clip as a **mood sample, not a target to reproduce** — their words:
"just a sample so you can get the picture about what I imagine." That framing matters,
because the clip cannot support close reproduction even if we wanted it to:

| Property | Value |
|---|---|
| Resolution | **368 × 368** |
| Duration | 2.169 s |
| Frames | 52, at ~23.98 fps |
| Bitrate | ~994 kbps, h264, heavy compression artifacts |

It is a **social-media post of a laptop mockup** of an unrelated coffee brand's site.
The orbit system occupies maybe 90 × 60 px of an already tiny frame. There is also an
Instagram-style UI chrome (heart / comment / share icons, a `620` like count) composited
over the right edge.

**The page SCROLLS during the clip** (the hero gives way to a second section, "THE FIRST
SIP TO RITUAL", around frames 30–34). This defeats composite analysis: both the `lighten`
and `motion` composites smear, because the entire composition translates between frames.
The technique that cracked trionn for sub-project 1 does not transfer here — there, the
subject was static and only the effect moved.

So: treat everything below as **direction, not measurement.** Nothing here is a number to
implement against. Contrast this with the sub-project 2 reference doc, where measurements
(median radius 68px → 119px, 1.75×) were trustworthy because the source was clean.

## What IS established from the frames

1. **Composition — a single glowing focal object, orbited.** A coffee bean, lit warm
   amber from within, held by a chrome robotic hand, on a near-black background. The bean
   is the anchor; everything orbits it. **This maps directly onto the owner's brief: the
   bean stands in for the TT logo.**

2. **Orbits are ELLIPSES in screen space, at several distinct tilts.** At least 2–3
   separate elliptical trails are distinguishable around the bean, crossing each other at
   different angles. They are strongly foreshortened — wide and flat — meaning the orbital
   planes sit close to edge-on relative to the camera rather than face-on. A face-on
   (circular) orbit would read as a flat halo and lose the sense of depth entirely.

3. **The trails are drawn, and persist.** The orbit paths are visible as continuous thin
   warm-gold lines, not merely implied by the orbs' motion. This confirms the owner's
   earlier request (2026-08-08) for the orbit **trace lines** to be part of the effect.
   The lines are thin, low-opacity, and the same warm hue family as the orbs.

4. **An orb reads as a small RING, not a filled dot.** The clearest single finding, and
   the one the `lighten` composite did establish despite the smearing: on the right side
   of the bean, one orb appears as a chain of ~5–6 small **circular outlines** traced along
   a smooth arc across successive frames. It is a bright-rimmed circle with a darker
   centre, not a solid disc and not a soft blob. Visible directly in frames 21–29 at the
   lower-right of the bean.

5. **The orbs are small relative to the focal object** — on the order of a tenth of the
   bean's long axis, possibly less. They are accents, not co-stars.

6. **Colour is a single warm family.** Amber/gold, at varying intensity, against near-black.
   There is no second hue in the orbit system.

## What is NOT established, and must not be guessed

- **Orb count.** Not countable at this resolution. The owner says "many".
- **Angular speed, or whether orbs share one.** The clip is 2.17 s and the page scrolls
  through most of it; no orb can be tracked through a full revolution.
- **Whether orbs pass BEHIND the focal object**, and how occlusion is handled. This is the
  single most important unknown for the 3D approach, and the reference cannot answer it.
- **Trail length / decay.** Whether the trace is a full persistent ellipse or a decaying
  comet tail behind each orb. The stills suggest full persistent ellipses, but compression
  smear makes this genuinely ambiguous.
- **Any interaction behaviour.** The clip is a passive scroll recording; there is no cursor.

## The owner's brief (2026-08-10) — this is the actual requirement

Recorded verbatim in substance, because it is more authoritative than the video:

- The coffee bean **represents the TT logo**, orbited by glowing orbs.
- The orbiting glowing orbs **replace the constellation text** (`ConstellationField`).
- There are **many orbs**.
- Orbs sit at **varying Y positions** — some sharing a Y, some not.
- **When two orbs share the same Y, their orbit radii must differ.**

That last rule is the interesting one, and it is a *visual* constraint rather than a
physical one: two orbs at the same height on the same radius would trace the same ellipse
and read as one path with two beads on it. Different radii at the same height keeps every
orbit legible as its own ring. Worth confirming the intent at spec time — it may also be
a collision-avoidance instinct, which would suggest a different implementation (phase
offset) than a purely visual one (radius separation).

## Open questions for the owner, before any spec

1. **What happens to the CMS words?** `ConstellationField` currently renders owner-editable
   `floatingWords` (12 of them, localized EN/ID) as DOM elements. Do the orbs **carry**
   those words (label attached to each orb), or do the words disappear entirely and the
   orbs become purely decorative? This changes everything: content, accessibility, and
   whether the orb count is CMS-driven or free.
2. **Does the existing hold-to-separate interaction feed the orbs?** Sub-project 1
   deliberately shipped `engine.onShatter()` and `engine.getCharge()` with **nothing
   subscribed**, specifically so sub-project 3's orbs could hook in. Should holding the
   logo scatter / accelerate / gather the orbs?
3. **Orbits in 3D or 2D?** The logo is a real three.js mesh that spins. Orbs as true 3D
   objects in the same scene would occlude correctly behind the mark and inherit its tilt
   for free — but they'd also need to survive the ignition and separation effects.
   `ConstellationField` today is a separate 2D canvas overlay.
4. **Reduced motion**, and whether orbs persist after the hero scrolls away.

## Recommended next step

**Do not spec from this document alone.** Run `superpowers:brainstorming` with the owner
against the four questions above first — the video has been mined for everything it can
give, and the remaining decisions are all product decisions, not observations.
