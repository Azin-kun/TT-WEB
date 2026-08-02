'use client'

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { CALIB } from '../../lib/three/calibration'
import { LOGO_BLACK_D, LOGO_RED_D, LOGO_VIEWBOX } from './logoPaths'

/**
 * Code-drawn hero intro (replaced the pre-rendered sketch-draw video, 2026-08).
 *
 * Three beats, all CSS keyframes over the real logo outline:
 *   1. trace — both shapes stroke themselves on (stroke-dashoffset)
 *   2. ink   — graphite/red fill floods in as the trace lands, stroke dissolves
 *              into it, pencil hatching settles on top
 *   3. lift  — a soft cast shadow grows under the mark, so the drawing reads as
 *              coming off the paper just before the 3D mesh takes over. It is
 *              deliberately a shadow and not a fake extrusion: LogoEngine's idle
 *              spin has been running behind the intro the whole time, so the
 *              mesh is at an arbitrary angle by the handoff and no flat stand-in
 *              could match its silhouette anyway.
 *
 * The mark is sized the way LogoEngine sizes the mesh — ink-bbox height =
 * HEIGHT_FRAC of the viewport, centred on CENTER_X/CENTER_Y — so the handoff
 * lands on the same pixels. The bbox is measured at runtime rather than
 * hard-coded because the SVG's viewBox carries padding around the artwork.
 *
 * Plays on every hero mount (no "seen once" skip), so navigating back from
 * Manifesto/Archive replays it. Reduced-motion hands straight to the mesh.
 */

// ms. Matched to the sequence the old 7.67s video ran, so HeroBlock's headline
// choreography (types at +0.3s, dissolves at +7.3s) needs no retuning: the mesh
// still takes over just after the headline clears.
const DRAW_MS = 2500
const RED_DELAY_MS = 700
const INK_AT_MS = 2750
const INK_MS = 950
const LIFT_AT_MS = 3800
const LIFT_MS = 2400
const DONE_AT_MS = 7400

// Final fill tones = the matcap base colours from lib/three/materials.ts, not
// the SVG's own #000000/#830401 — the last drawn frame has to match the lit
// mesh, not the flat brand swatch, or the crossfade shows a colour pop.
const INK_BLACK = '#565349'
const INK_RED = '#a8544e'
const SHADOW = '#2B2A27'

type Box = { x: number; y: number; w: number; h: number }

export function SketchIntro({
  onDone,
  onPlayStart,
}: {
  onDone: () => void
  onPlayStart?: () => void
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const hatchId = `si-hatch-${uid}`
  const shadowId = `si-shadow-${uid}`
  const inkRef = useRef<SVGGElement>(null)
  const [box, setBox] = useState<Box | null>(null)
  const [hidden, setHidden] = useState(false)
  const doneRef = useRef(false)
  const startedRef = useRef(false)

  // Callers pass inline arrows, so these identities change every render. Held
  // in refs to keep signalStart/finish — and therefore the measure effect that
  // depends on them — stable; a changing dep there re-measures on every render
  // and setBox spins it into an infinite update loop.
  const onDoneRef = useRef(onDone)
  const onPlayStartRef = useRef(onPlayStart)
  onDoneRef.current = onDone
  onPlayStartRef.current = onPlayStart

  // Fires once, when the trace actually begins — the headline keys off this
  // (it used to be the video's `playing` event) so it can't type over a blank
  // stage while the bbox is still being measured.
  const signalStart = useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true
    onPlayStartRef.current?.()
  }, [])

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    signalStart() // a skipped intro must not strand headline consumers
    setHidden(true)
    onDoneRef.current()
  }, [signalStart])

  // Measure the artwork's true ink bbox. The <svg> stays at opacity 0 until this
  // lands, so nothing is ever painted at the padded viewBox size. getBBox throws
  // on an unrendered element — fall through to the mesh rather than hang the hero.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish()
      return
    }
    try {
      const b = inkRef.current?.getBBox()
      if (!b || !b.width || !b.height) return finish()
      setBox({ x: b.x, y: b.y, w: b.width, h: b.height })
    } catch {
      finish()
    }
  }, [finish])

  useEffect(() => {
    if (!box) return
    signalStart()
    const t = setTimeout(finish, DONE_AT_MS)
    return () => clearTimeout(t)
  }, [box, signalStart, finish])

  // Shadow falls down-left, away from the 3D scene's key light at (1.5, 2, 2.5).
  const shadowDx = box ? box.h * 0.009 : 0
  const shadowDy = box ? box.h * 0.013 : 0
  const shadowBlur = box ? box.h * 0.012 : 0

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        opacity: hidden ? 0 : 1,
        transition: 'opacity 0.5s ease',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <svg
        className={`si-mark${box ? ' si-run' : ''}`}
        viewBox={box ? `${box.x} ${box.y} ${box.w} ${box.h}` : LOGO_VIEWBOX}
        preserveAspectRatio="xMidYMid meet"
        style={{
          overflow: 'visible', // the pencil stroke and the cast shadow fall outside the ink bbox
          ...(box ? ({ '--si-aspect': String(box.w / box.h) } as CSSProperties) : { opacity: 0 }),
        }}
      >
        <defs>
          {/* The same 45° graphite hatching the 3D matcap paints, so the flat
              mark and the lit mesh read as one pencil surface. */}
          <pattern
            id={hatchId}
            width="12"
            height="12"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="12" stroke="#302E2A" strokeWidth="3.4" opacity="0.18" />
          </pattern>
          <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation={shadowBlur} />
          </filter>
        </defs>

        {/* 3. lift */}
        <g className="si-depth" filter={`url(#${shadowId})`}>
          <path d={LOGO_BLACK_D} fillRule="evenodd" />
          <path d={LOGO_RED_D} fillRule="evenodd" />
        </g>

        {/* 1 + 2. the mark itself. This group is what gets measured for the
            viewBox, so it has to carry the real geometry. */}
        <g ref={inkRef} className="si-ink">
          <path className="si-p si-p-black" d={LOGO_BLACK_D} pathLength="1" fillRule="evenodd" />
          <path className="si-p si-p-red" d={LOGO_RED_D} pathLength="1" fillRule="evenodd" />
        </g>

        <g className="si-hatch">
          <path d={LOGO_BLACK_D} fillRule="evenodd" fill={`url(#${hatchId})`} />
          <path d={LOGO_RED_D} fillRule="evenodd" fill={`url(#${hatchId})`} />
        </g>
      </svg>

      <style>{`
        .si-mark {
          position: absolute;
          left: ${CALIB.CENTER_X * 100}%;
          top: ${CALIB.CENTER_Y * 100}%;
          transform: translate(-50%, -50%);
          --si-hf: ${CALIB.HEIGHT_FRAC};
          --si-aspect: 1;
          --si-stroke: 5;
          height: calc(var(--si-hf) * 100svh);
          width: calc(var(--si-hf) * 100svh * var(--si-aspect));
        }
        /* Narrow viewports use the mesh's smaller MOBILE_HEIGHT_FRAC, matching
           the <640px branch in LogoEngine.load(). The mark is ~2.4x smaller
           there, so the pencil line needs proportionally more user units to
           stay a visible ~1.5px on screen. */
        @media (max-width: 639px) {
          .si-mark { --si-hf: ${CALIB.MOBILE_HEIGHT_FRAC}; --si-stroke: 9; }
        }

        /* Pre-run: outline only, nothing drawn yet. */
        .si-mark .si-p {
          fill: transparent;
          stroke: var(--fg);
          stroke-width: var(--si-stroke);
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          opacity: 0.9;
        }
        .si-mark .si-depth path { fill: ${SHADOW}; stroke: none; }
        .si-mark .si-depth, .si-mark .si-hatch { opacity: 0; }

        .si-run .si-p-black {
          animation:
            siDraw ${DRAW_MS}ms ease-in-out both,
            siInkBlack ${INK_MS}ms ease-out ${INK_AT_MS}ms both;
        }
        .si-run .si-p-red {
          animation:
            siDraw ${DRAW_MS}ms ease-in-out ${RED_DELAY_MS}ms both,
            siInkRed ${INK_MS}ms ease-out ${INK_AT_MS}ms both;
        }
        .si-run .si-hatch {
          animation: siFadeIn ${INK_MS}ms ease-out ${INK_AT_MS + 150}ms both;
        }
        .si-run .si-depth {
          animation: siLift ${LIFT_MS}ms cubic-bezier(0.33, 0, 0.2, 1) ${LIFT_AT_MS}ms both;
        }

        @keyframes siDraw {
          from { stroke-dashoffset: 1; }
          to   { stroke-dashoffset: 0; }
        }
        /* Fill floods in while the tracing stroke dissolves into it. Both
           keyframes start from the target colour at zero alpha so the
           interpolation never passes through black. */
        @keyframes siInkBlack {
          from { fill: rgba(86, 83, 73, 0); stroke-opacity: 0.9; }
          to   { fill: ${INK_BLACK}; stroke-opacity: 0; }
        }
        @keyframes siInkRed {
          from { fill: rgba(168, 84, 78, 0); stroke-opacity: 0.9; }
          to   { fill: ${INK_RED}; stroke-opacity: 0; }
        }
        @keyframes siFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes siLift {
          from { opacity: 0; transform: translate(0px, 0px); }
          to   { opacity: 0.28; transform: translate(${-shadowDx}px, ${shadowDy}px); }
        }

        @media (prefers-reduced-motion: reduce) {
          .si-mark { display: none; }
        }
      `}</style>
    </div>
  )
}
