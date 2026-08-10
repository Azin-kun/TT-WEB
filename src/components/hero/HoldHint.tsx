'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * "Click & Hold" bubble that appears at the cursor while it is over the mark.
 *
 * The separation and ignition effects are completely undiscoverable otherwise —
 * nothing about a slowly rotating logo suggests you can press and hold it.
 *
 * Owner 2026-08-10.
 */

/**
 * Wait before showing. Owner 2026-08-10: none — it appears as soon as the
 * cursor is on the logo. Kept as a knob rather than deleted, since this is the
 * first thing likely to be re-tuned.
 */
export const HINT_DELAY_MS = 0
/**
 * Grace period before hiding. NOT symmetric with the show delay, on purpose:
 * the mark is a knot, so a cursor sliding across it passes over holes, and it
 * also rotates underneath a still cursor. Hiding instantly would make the
 * bubble blink in both cases.
 */
const HINT_HIDE_MS = 200
/** Pop-in duration. */
const HINT_POP_MS = 260
/** Rendered width in px; the art is 804x660, so height follows at ~0.82x. */
const HINT_W = 98
const HINT_ASPECT = 660 / 804
/**
 * Where the speech tail's point sits inside the artwork, as fractions of its
 * box. Measured off the source PNG: the white tail spike tips at about
 * (250, 537) of 804x660 — NOT the bubble's centre, and not its bottom edge.
 * Anchoring here is what puts the tail on the cursor instead of near it.
 */
const TAIL_X = 0.31
const TAIL_Y = 0.81
/** Clearance between the tail's point and the cursor's arrow tip. */
const HINT_GAP = 2
const HINT_SRC = '/media/hint-click-hold.webp'

/**
 * Once someone has actually held the logo they have learned the interaction, so
 * the hint stops offering itself for the rest of the visit. Module scope rather
 * than state: it must survive the hero remounting when you navigate back.
 */
let hasHeldThisVisit = false

/**
 * Places the speech TAIL's point just above the cursor's arrow tip, rather than
 * centring the whole bubble on it (owner 2026-08-10). The tail sits left of
 * centre and well above the bottom edge, so anchoring to it shifts the bubble
 * right and down compared with centring.
 *
 * clientX/clientY IS the arrow tip in every browser — the default pointer's
 * hotspot is its point, not its centre — so no correction is needed for that.
 */
const offsetFor = (p: { x: number; y: number }) =>
  `translate3d(${p.x - HINT_W * TAIL_X}px, ${p.y - HINT_W * HINT_ASPECT * TAIL_Y - HINT_GAP}px, 0)`

export function HoldHint({
  active,
  delayMs = HINT_DELAY_MS,
}: {
  /** true while the cursor is over the mark */
  active: boolean
  delayMs?: number
}) {
  const [shown, setShown] = useState(false)
  const [reduced, setReduced] = useState(false)
  const elRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  // Written by the pointer listener, read by the rAF loop — never through state,
  // so cursor tracking cannot trigger a React render per mouse move.
  const pos = useRef({ x: 0, y: 0 })

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    // Warm the bitmap well before first hover. Without this the very first
    // appearance renders an empty box for a beat while the file downloads —
    // measured, not theoretical. There is ample time: the hint cannot show
    // until the ignition has finished, roughly ten seconds into the visit.
    const pre = new Image()
    pre.src = HINT_SRC
  }, [])

  // Show immediately (or after delayMs, if one is ever set); hide on a short
  // grace period so crossing the knot's holes does not flicker it.
  useEffect(() => {
    if (hasHeldThisVisit) {
      setShown(false)
      return
    }
    if (active) {
      if (delayMs <= 0) {
        setShown(true)
        return
      }
      const t = setTimeout(() => setShown(true), delayMs)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setShown(false), HINT_HIDE_MS)
    return () => clearTimeout(t)
  }, [active, delayMs])

  // Hide the moment a press begins — at that point the visitor is already doing
  // it, and the bubble would sit on top of the effect it was advertising.
  useEffect(() => {
    const onDown = () => {
      hasHeldThisVisit = true
      setShown(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [])

  // Track the cursor ALWAYS, not only while the bubble is up. If tracking only
  // started on show, the first frame would use a stale {0,0} and the bubble
  // would flash in the top-left corner before snapping to the cursor.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pos.current.x = e.clientX
      pos.current.y = e.clientY
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  // Follow the cursor in a rAF loop off the ref, so movement never costs a
  // React render.
  useEffect(() => {
    if (!shown) return
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick)
      const el = elRef.current
      if (el) el.style.transform = offsetFor(pos.current)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [shown])

  if (!shown) return null

  return (
    <div
      ref={elRef}
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 40,
        pointerEvents: 'none',
        width: HINT_W,
        // Seeded on the very first paint. The rAF loop takes over from the next
        // frame, but without this the initial render would land at 0,0.
        transform: offsetFor(pos.current),
        // The tail's point — the one spot pinned to the cursor — so the bubble
        // grows out of the arrow tip and stays anchored there through the pop.
        transformOrigin: `${TAIL_X * 100}% ${TAIL_Y * 100}%`,
        // ease-out-quart: decelerates hard, so it lands as a pop without the
        // dated rubber-band overshoot.
        animation: reduced
          ? undefined
          : `tt-hint-pop ${HINT_POP_MS}ms cubic-bezier(0.25, 1, 0.5, 1) both`,
        willChange: 'transform',
      }}
    >
      <img
        src={HINT_SRC}
        alt=""
        width={804}
        height={660}
        draggable={false}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      />
      <style>{`
        @keyframes tt-hint-pop {
          from { opacity: 0; scale: 0.55; }
          to   { opacity: 1; scale: 1; }
        }
      `}</style>
    </div>
  )
}
