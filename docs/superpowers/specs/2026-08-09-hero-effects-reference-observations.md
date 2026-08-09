# Reference observations — sub-projects 2 & 3 (electrical wireframe transition + orbiting orbs)

**Date:** 2026-08-09 · **Status:** OBSERVATION ONLY — not a spec. Read before speccing either sub-project.

Method: every frame extracted with a scratchpad `ffmpeg-static` (no system install, nothing added to the
app), tiled into contact sheets, then re-cropped at 4–10× on the regions that mattered. Colours and sizes
below were **sampled/measured** with `System.Drawing`, not eyeballed. This is the same method that cracked
trionn (see HANDOFF) — and it earned its keep again: see "Corrections" at the bottom.

---

## Owner's intended scene (stated 2026-08-09)

```
sketching → extrude to 3D sketch → ELECTRICAL WIREFRAME TRANSITION → rotating 3D logo
                                          └─ orbiting orbs emerge as this ends ─┘
```

- Sub-project 2 (**electrical wireframe**) is a **bridge state**, not a permanent material. It occupies the
  handoff that today is a plain crossfade from the sketch video's last frame to the live mesh.
- Sub-project 3 (**orbiting orbs**) replaces `ConstellationField` and takes over **the same job**: carrying
  the CMS `floatingWords`.
- **Both must be red-ish**, to sit in the TT palette. Neither reference is red — see "The colour problem".

---

## Video 1 — `Transition-3d-sketch-to-3d-rotating.mp4`

**2.562 s · 640×466 · 25 fps · 64 frames · h264+aac**

⚠️ **The filename does not describe the content.** This is a screen recording of a live third-party site —
**OPTIMIND**, headline "WE'RE A FULL-SERVICE AI AUTOMATION AGENCY." — captured in its **steady-state hero
idle**. There is **no sketch→3D transition in it**, and **no lightning/arc** anywhere in the 64 frames
(unlike trionn, which genuinely had a blue arc). It is a reference for a *look*, not for a *sequence*.

### The object

A lumpy, roughly spherical **triangulated wireframe cage** of thin dark lines — hollow, irregular, and
reading very much like a 3D pencil scribble. Constant size (measured — see Corrections).

### The decisive detail (only visible at 4×)

**The glowing "energy bolts" ARE the wireframe edges.** At contact-sheet zoom the bright golden streaks near
the core look like lens-flare spikes. At 4× they resolve into straight struts meeting at triangle junctions —
the identical topology, thickness and straightness as the dark ink lines elsewhere in the cage.

So it is **one wireframe with a light-driven colour ramp**, not a separate arc/lightning system layered on
top. This is the single most important porting insight: we do not need a bolt generator.

### Full recipe

| Layer | Behaviour |
|---|---|
| Line material | ramps graphite → gold → blown white by proximity to a moving light |
| Vertex particles | round glowing dots sit **at the mesh vertices**, same ramp (deep red → orange → white) |
| Bloom | heavy, on the hot regions only |
| Depth of field | **real** — far geometry soft/blurred, near geometry sharp. Carries a lot of the look |
| Motion | slow rotation; a soft bloom sweeps lower-left → centre and tightens into a hot core |

### Measured

| | |
|---|---|
| Hot core (brightest px) | `#FFF9E9` |
| Filament ink (darkest px) | `#191713` |
| Background | neutral grey gradient `#686868` (left) → `#D9D9D9` (right), no colour cast |
| Object width | **constant 265–273 px across all 64 frames** |
| Object size | ≈41 % of frame width |

`#FFF9E9` is within a hair of the `#FFF8E0` already in TT's separation shine ramp (`#B4571C` → `#FFF8E0`).
The warm-white end of this effect is **already in our palette**.

---

## Video 2 — `Orbiting-orbs-sample.mp4`

**2.169 s · 368×368 · 23.976 fps · 52 frames · h264+aac**

Also not what the name implies: it is a **social-media post** (like/comment/share chrome, 620 / 23 / 386)
showing a **laptop mockup of a coffee brand site** — "THE FIRST SIP FEELS LIKE DESIGN", scrolling to "THE
FIRST SIP TO RITUAL". So it is a recording *of a video of a screen*: the orb element is ~10 px at source.
**Detail beyond what is written here is not recoverable from this file.**

### Frames 0–29 — orbs around the hero subject

A robotic hand holds a glowing coffee bean (this is the owner's "coffee bean"). Around it:

- **Thin, bright, continuous elliptical orbit traces**, tilted in 3D. The trace **passes behind the subject
  and reappears in front** — true 3D occlusion, not a 2D overlay.
- The trace is a **persistent full ellipse** of fairly even brightness, ~1 px at source. It is *not* a comet
  tail that fades behind a moving orb.
- Small **orbs ride the traces**. At least 2 ellipses at differing tilts are distinguishable.
- Orbs **change shape with depth**: a sharp dot in some frames, a hollow bright-rimmed ring in others. Same
  orb, different frames → this is **defocus bokeh**, confirming the scene's DOF.

### Frames 30–51 — the trace treatment, close up

The page scrolls to a second section where a long amber trace runs diagonally past a glass cup with one orb
on it, large enough to actually read. The orb is a **translucent glass bead with a bright warm rim
highlight** — semi-transparent body, specular edge. It is **not** an emissive glowing blob.

This is what the owner means by "**shiny** orbs". It also matters for sub-project 3: a glass bead can
plausibly *carry* a CMS word (inside it, or riding with it) in a way a blown-out light blob cannot.

### Measured

| | |
|---|---|
| Trace / orb highlight | `#F3E2CF` (warm cream, not saturated gold) |
| Amber glow pool | `#6C3B0E` |
| Background | `#302922` / `#322D2C` (very dark warm brown-black) |
| Bean body | `#E7C8B4` |

---

## The colour problem (biggest risk for both sub-projects)

**Both references are dark-ground scenes** — OPTIMIND on mid-grey metallic, the coffee site on near-black.
**TT is light warm paper `#F6F1E7`.** Glowing thin lines and bloom read beautifully on dark and wash out on
light. This is exactly the lesson the shatter port already paid for once (HANDOFF, 2026-08-08: "sheer-on-light
doesn't work like sheer-on-dark … at 0.3 opacity on our `#F6F1E7` paper the black-and-red washed out
entirely", forcing skin opacity 0.3 → 0.6).

Compounding it: the owner wants **red**. Additive/screen blending of red over warm paper desaturates toward
orange and then white — red is the *hardest* hue to keep saturated with additive glow on a light ground.

**Observed mitigation, straight from OPTIMIND:** their bright struts do not read against the light background
— they read against the **soft dark DOF-blurred mesh sitting behind them**. The blurred dark geometry *is*
the local dark backdrop that makes the glow pop. TT can reproduce this honestly, because the logo already has
an inner body + wireframe ghost to darken and blur.

Practical consequence to settle during brainstorming: on paper, "electrical red" probably wants the ramp
**graphite → saturated red-pencil (`#8E1114` / `#830401`) → warm white (`#FFF8E0`) only at the very peak**,
with the hot white kept small and brief, plus a local dark/blurred mass behind it. Straight additive red
bloom on bare paper is expected to fail.

---

## Corrections the measurement caught

- **"The cage expands and opens up" — WRONG.** That was my first read off the contact sheet. Per-frame
  bounding-box measurement showed width constant at 265–273 px for all 64 frames. The cage is **rigid**; the
  apparent opening is purely the glow moving off it and revealing mesh that had been blown out.
- **"Star-flare with radiating spikes" — WRONG at low zoom.** At 4× the spikes are lit wireframe struts.

Both errors would have shipped as spec requirements had the sheets not been re-cropped. Do not spec either
effect from a single-zoom look.

---

## Not in either reference (must be invented for TT)

- Any sketch→3D **transition** — video 1 is an idle state only.
- Any **electrical arc / bolt** — the "electricity" is lit wireframe edges.
- **Words on orbs** — the coffee reference has no text on its orbs at all. Carrying `floatingWords` is
  entirely a TT invention, and is the part with no reference to lean on.
- **Red** anything.
