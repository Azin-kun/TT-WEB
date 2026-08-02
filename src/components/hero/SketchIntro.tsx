'use client'

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { CALIB } from '../../lib/three/calibration'
import { LOGO_BLACK_D, LOGO_RED_D, LOGO_VIEWBOX } from './logoPaths'

/**
 * The hero intro, drawn in code instead of played from a file.
 *
 * This reproduces the original 7.67s stitched video beat for beat — it is the
 * same animation, only the source changed. Timings below were read off the
 * video's own frames (24fps, 184 frames, recoverable from git history at
 * 31c4a57:public/media/sketch-draw-16x9.mp4):
 *
 *   0.0–0.7s  faint construction geometry goes down first — the circle and
 *             guides an empu strikes before committing a line
 *   0.3–2.0s  the outline draws itself on in pencil
 *   2.2–3.1s  RED fills first, sweeping across rather than fading up
 *   2.6–3.5s  graphite follows, same sweep, one beat behind
 *   4.0s      handoff — LogoEngine.startEntrance() grows the extrusion out of
 *             flat and eases into the idle spin, which is what the video's
 *             third act (4.0–7.67s) showed
 *
 * The pencil outline is never dissolved away; it survives under the fill, which
 * is what keeps the finished mark a drawing rather than flat vector art.
 *
 * The mark is sized the way LogoEngine sizes the mesh — ink-bbox height =
 * HEIGHT_FRAC of the viewport, centred on CENTER_X/CENTER_Y — so the handoff
 * lands on the same pixels. The bbox is measured at runtime because the SVG's
 * viewBox carries padding around the artwork.
 *
 * Plays on every hero mount (no "seen once" skip). Reduced motion hands
 * straight to the mesh.
 */

const GUIDE_MS = 700
const TRACE_AT_MS = 300
const TRACE_MS = 1700
const RED_AT_MS = 1950
const BLACK_AT_MS = 2400
const FILL_MS = 900
const HATCH_AT_MS = 2200
const HATCH_MS = 1000
const DONE_AT_MS = 4000

// Fill tones sampled off the original video's own frames (mean colour of the
// mark at 3.9s, paper excluded): red #7C3C42, graphite #534B47. Do not swap
// these for the flat brand swatches or the matcap bases — the drawn phase is
// coloured pencil on paper, and both of those read too light.
const INK_BLACK = '#534B47'
const INK_RED = '#7C3C42'
// How much of the tracing pencil line survives into the finished mark. Zero
// here is what turns a drawing into flat vector fill — don't. The original
// keeps the ink line clearly darker than the fill it encloses.
const PENCIL_KEPT = 0.92

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
  const clipRedId = `si-clip-red-${uid}`
  const clipBlackId = `si-clip-black-${uid}`
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

  // Fires once, when the drawing actually begins — the headline keys off this
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
  // lands, so nothing is painted at the padded viewBox size. getBBox throws on
  // an unrendered element — fall through to the mesh rather than hang the hero.
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

  // Geometry for the construction pass and the colour sweeps, all derived from
  // the measured bbox so they track the artwork rather than magic numbers.
  const cx = box ? box.x + box.w / 2 : 0
  const cy = box ? box.y + box.h / 2 : 0
  const guideR = box ? box.h * 0.54 : 0
  const guideSpan = box ? box.w * 0.78 : 0
  // Sweep rect: oversized and tilted, so the fill reads as a hand colouring the
  // shape in rather than the whole area fading up at once.
  const sweep = box ? Math.max(box.w, box.h) * 1.5 : 0

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
          overflow: 'visible', // the pencil stroke and construction circle fall outside the ink bbox
          ...(box ? ({ '--si-aspect': String(box.w / box.h) } as CSSProperties) : { opacity: 0 }),
        }}
      >
        <defs>
          {/* The same 45° graphite hatching the 3D matcap paints, so the flat
              mark and the lit mesh read as one pencil surface. */}
          <pattern
            id={hatchId}
            width="14"
            height="14"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="14" stroke="#241F1C" strokeWidth="4.6" opacity="0.42" />
          </pattern>
          <clipPath id={clipRedId}>
            <rect className="si-sweep si-sweep-red" x={cx - sweep} y={cy - sweep} width={sweep * 2} height={sweep * 2} />
          </clipPath>
          <clipPath id={clipBlackId}>
            <rect className="si-sweep si-sweep-black" x={cx - sweep} y={cy - sweep} width={sweep * 2} height={sweep * 2} />
          </clipPath>
        </defs>

        {/* 1. construction — struck before any committed line */}
        <g className="si-guides" fill="none" stroke="var(--line)" strokeWidth="2">
          <circle cx={cx} cy={cy} r={guideR} pathLength="1" />
          <line x1={cx - guideSpan} y1={cy} x2={cx + guideSpan} y2={cy} pathLength="1" />
          <line x1={cx} y1={cy - guideR * 1.25} x2={cx} y2={cy + guideR * 1.25} pathLength="1" />
        </g>

        {/* 3. fill, swept under the outline. Red leads, graphite follows. */}
        <g className="si-fills">
          <g clipPath={`url(#${clipRedId})`}>
            <path d={LOGO_RED_D} fillRule="evenodd" fill={INK_RED} />
            <path d={LOGO_RED_D} fillRule="evenodd" fill={`url(#${hatchId})`} className="si-hatch" />
          </g>
          <g clipPath={`url(#${clipBlackId})`}>
            <path d={LOGO_BLACK_D} fillRule="evenodd" fill={INK_BLACK} />
            <path d={LOGO_BLACK_D} fillRule="evenodd" fill={`url(#${hatchId})`} className="si-hatch" />
          </g>
        </g>

        {/* 2. the traced outline, on top so it survives the fill. This group is
            what gets measured for the viewBox, so it carries the real geometry. */}
        <g ref={inkRef} className="si-ink">
          <path className="si-p si-p-black" d={LOGO_BLACK_D} pathLength="1" fillRule="evenodd" />
          <path className="si-p si-p-red" d={LOGO_RED_D} pathLength="1" fillRule="evenodd" />
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
          --si-stroke: 8;
          height: calc(var(--si-hf) * 100svh);
          width: calc(var(--si-hf) * 100svh * var(--si-aspect));
        }
        /* Narrow viewports use the mesh's smaller MOBILE_HEIGHT_FRAC, matching
           the <640px branch in LogoEngine.load(). The mark is ~2.4x smaller
           there, so the pencil line needs proportionally more user units to
           stay a visible ~1.5px on screen. */
        @media (max-width: 639px) {
          .si-mark { --si-hf: ${CALIB.MOBILE_HEIGHT_FRAC}; --si-stroke: 13; }
        }

        /* Pre-run: nothing drawn, nothing filled. */
        .si-mark .si-p {
          fill: none;
          stroke: #241F1C;
          stroke-width: var(--si-stroke);
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          stroke-opacity: 0.9;
        }
        .si-mark .si-guides { opacity: 0; }
        .si-mark .si-guides * { stroke-dasharray: 1; stroke-dashoffset: 1; }
        /* transform-box makes the sweep scale about the shape's own box rather
           than the whole SVG viewport. */
        .si-mark .si-sweep {
          transform-box: view-box;
          transform-origin: ${cx - sweep}px ${cy}px;
          transform: rotate(-20deg) scaleX(0);
        }

        .si-run .si-guides {
          animation: siGuideFade ${GUIDE_MS}ms ease-out both;
        }
        .si-run .si-guides * {
          animation: siDraw ${GUIDE_MS}ms ease-out both;
        }
        .si-run .si-p-black {
          animation: siDraw ${TRACE_MS}ms ease-in-out ${TRACE_AT_MS}ms both,
                     siPencilSettle 400ms ease-out ${TRACE_AT_MS + TRACE_MS}ms both;
        }
        .si-run .si-p-red {
          animation: siDraw ${TRACE_MS}ms ease-in-out ${TRACE_AT_MS + 180}ms both,
                     siPencilSettle 400ms ease-out ${TRACE_AT_MS + TRACE_MS}ms both;
        }
        .si-run .si-sweep-red {
          animation: siSweep ${FILL_MS}ms cubic-bezier(0.2, 0.6, 0.35, 1) ${RED_AT_MS}ms both;
        }
        .si-run .si-sweep-black {
          animation: siSweep ${FILL_MS}ms cubic-bezier(0.2, 0.6, 0.35, 1) ${BLACK_AT_MS}ms both;
        }
        .si-run .si-hatch {
          animation: siFadeIn ${HATCH_MS}ms ease-out ${HATCH_AT_MS}ms both;
        }

        @keyframes siDraw {
          from { stroke-dashoffset: 1; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes siGuideFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        /* The line eases back once the fill arrives, but never to zero. */
        @keyframes siPencilSettle {
          from { stroke-opacity: 0.9; }
          to   { stroke-opacity: ${PENCIL_KEPT}; }
        }
        @keyframes siSweep {
          from { transform: rotate(-20deg) scaleX(0); }
          to   { transform: rotate(-20deg) scaleX(1); }
        }
        @keyframes siFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .si-mark { display: none; }
        }
      `}</style>
    </div>
  )
}
