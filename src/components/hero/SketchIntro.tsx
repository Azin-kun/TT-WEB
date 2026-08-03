'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { sketchLayerCss } from './sketchLayout'

/**
 * The hero intro: the original hand-drawn sketch, animated by code instead of
 * played as a video.
 *
 * The artwork is not redrawn procedurally — it is the real graphite, cut out of
 * the original clip's own frames. That is the only way to keep what makes it a
 * drawing: the construction circle struck before the first committed line, the
 * doubled strokes where the hand went back over an edge, the eraser smudge
 * under the lower left. Those are photographed, not simulated.
 *
 * Each layer is a MULTIPLY layer whose pixels are frame ÷ clean-paper, so white
 * means "no graphite here". Over the paper photo behind it, paper × ratio
 * reproduces the original frame; the animation is then only how much of each
 * layer is let through, which is all the video was doing.
 *
 * Beats, read off the original (7.67s, 24fps, recoverable from git at
 * 31c4a57:public/media/sketch-draw-16x9.mp4):
 *   0.3–2.0s  the outline surfaces on the paper
 *   1.95s     red pencil sweeps in first
 *   2.4s      graphite follows, one beat behind
 *   4.0s      handoff — LogoEngine.startEntrance() grows the extrusion out of
 *             flat, which is what the video's third act showed
 *
 * The construction marks and smudge are NOT in here: they stay on the sheet for
 * the whole clip, so HeroBlock renders them and they survive the handoff.
 *
 * Assets come from scripts/make-sketch-assets.py, run against the video
 * frames. If the artwork changes, rerun it rather than hand-editing.
 */

const OUTLINE_AT_MS = 300
const OUTLINE_MS = 1700
const RED_AT_MS = 1950
const GRAPHITE_AT_MS = 2400
const SWEEP_MS = 900
const DONE_AT_MS = 4000

export function SketchIntro({
  onDone,
  onPlayStart,
}: {
  onDone: () => void
  onPlayStart?: () => void
}) {
  const [run, setRun] = useState(false)
  const [hidden, setHidden] = useState(false)
  const doneRef = useRef(false)
  const startedRef = useRef(false)

  // Callers pass inline arrows, so these identities change every render. Held in
  // refs to keep the effect below stable.
  const onDoneRef = useRef(onDone)
  const onPlayStartRef = useRef(onPlayStart)
  onDoneRef.current = onDone
  onPlayStartRef.current = onPlayStart

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

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish()
      return
    }
    setRun(true)
    signalStart()
    const t = setTimeout(finish, DONE_AT_MS)
    return () => clearTimeout(t)
  }, [finish, signalStart])

  return (
    <div
      aria-hidden
      className={`si-stage${run ? ' si-run' : ''}`}
      style={{
        position: 'absolute',
        inset: 0,
        opacity: hidden ? 0 : 1,
        transition: 'opacity 0.5s ease',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      {/* The sheet has to live inside this element, not behind it: .si-stage is
          positioned with a z-index, which makes it a stacking context, and a
          multiply layer only blends with a backdrop inside its own. Same image
          and framing as HeroBlock's, so the crossfade at handoff is invisible. */}
      <div className="si-paper" />
      <div className="si-anchor">
        {/* eslint-disable @next/next/no-img-element */}
        <img className="si-layer si-outline" src="/media/sketch-outline.webp" alt="" />
        <img className="si-layer si-red" src="/media/sketch-red.webp" alt="" />
        <img className="si-layer si-graphite" src="/media/sketch-graphite.webp" alt="" />
        {/* eslint-enable @next/next/no-img-element */}
      </div>

      <style>{`
        .si-paper {
          position: absolute;
          inset: 0;
          background: url('/media/paper-hero-full.webp') center / cover no-repeat;
          -webkit-mask-image: linear-gradient(to bottom, black 88%, transparent 100%);
          mask-image: linear-gradient(to bottom, black 88%, transparent 100%);
        }

        ${sketchLayerCss('.si-anchor', '.si-layer')}

        .si-outline { opacity: 0; }
        /* Colour sweeps in on a soft diagonal, the way it was filled in by hand
           rather than fading up all at once. */
        .si-red, .si-graphite {
          -webkit-mask-image: linear-gradient(105deg, #000 30%, rgba(0,0,0,0.35) 45%, transparent 60%);
          mask-image: linear-gradient(105deg, #000 30%, rgba(0,0,0,0.35) 45%, transparent 60%);
          -webkit-mask-size: 300% 300%;
          mask-size: 300% 300%;
          -webkit-mask-position: 100% 0%;
          mask-position: 100% 0%;
        }

        .si-run .si-outline {
          animation: siOutline ${OUTLINE_MS}ms ease-out ${OUTLINE_AT_MS}ms both;
        }
        .si-run .si-red {
          animation: siSweep ${SWEEP_MS}ms cubic-bezier(0.2, 0.6, 0.35, 1) ${RED_AT_MS}ms both;
        }
        .si-run .si-graphite {
          animation: siSweep ${SWEEP_MS}ms cubic-bezier(0.2, 0.6, 0.35, 1) ${GRAPHITE_AT_MS}ms both;
        }

        @keyframes siOutline {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes siSweep {
          from { -webkit-mask-position: 100% 0%; mask-position: 100% 0%; }
          to   { -webkit-mask-position: 0% 100%; mask-position: 0% 100%; }
        }

        @media (prefers-reduced-motion: reduce) {
          .si-stage { display: none; }
        }
      `}</style>
    </div>
  )
}
