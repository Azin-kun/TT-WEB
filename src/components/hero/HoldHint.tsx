'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * "Click & Hold" bubble that pops out at the cursor once it has rested on the
 * mark for a moment.
 *
 * The separation and ignition effects are completely undiscoverable otherwise —
 * nothing about a slowly rotating logo suggests you can press and hold it.
 *
 * Owner 2026-08-10.
 */

/** How long the cursor must sit on the mark before the bubble appears. */
export const HINT_DELAY_MS = 700
/** Fade/pop duration. */
const HINT_POP_MS = 220
/**
 * Once someone has actually held the logo they have learned the interaction, so
 * the hint stops offering itself for the rest of the visit. Module scope rather
 * than state: it must survive the hero remounting when you navigate back.
 */
let hasHeldThisVisit = false

/**
 * Offset up and right of the cursor tip, so the bubble reads as pointing back
 * at it rather than sitting under it.
 */
const offsetFor = (p: { x: number; y: number }) =>
  `translate3d(${p.x + 14}px, ${p.y - 96}px, 0)`

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
  }, [])

  // Arm/disarm the delay.
  useEffect(() => {
    if (!active || hasHeldThisVisit) {
      setShown(false)
      return
    }
    const t = setTimeout(() => setShown(true), delayMs)
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
        width: 150,
        // Seeded on the very first paint. The rAF loop takes over from the next
        // frame, but without this the initial render would land at 0,0.
        transform: offsetFor(pos.current),
        transformOrigin: '0 100%',
        // ease-out-quart. A comic bubble invites an overshoot "boing", but a
        // pronounced one reads dated — this decelerates hard instead, which
        // still lands as a pop at 220ms without the rubber.
        animation: reduced ? undefined : `tt-hint-pop ${HINT_POP_MS}ms cubic-bezier(0.25, 1, 0.5, 1) both`,
        willChange: 'transform',
      }}
    >
      {/* Placeholder art — swap for the owner's supplied PNG. Kept as inline SVG
          so the mechanism can be judged before the asset lands. */}
      <svg viewBox="0 0 800 620" style={{ width: '100%', height: 'auto', display: 'block' }}>
        <path
          fill="#E01B22"
          d="M250 120 L215 35 L300 95 L360 20 L395 110 L470 60 L480 150 L560 130 L540 210 L640 215 L575 275 L700 320 L575 365 L640 430 L520 435 L530 510 L440 470 L400 560 L340 480 L255 545 L250 455 L150 470 L185 390 L60 370 L155 305 L35 250 L165 205 L110 140 Z"
        />
        <ellipse cx="415" cy="290" rx="270" ry="150" fill="#F6F1E7" stroke="#111" strokeWidth="14" />
        <text
          x="415"
          y="255"
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontWeight="700"
          fontSize="104"
          fill="#111"
          transform="rotate(-8 415 290)"
        >
          Click
        </text>
        <text
          x="415"
          y="375"
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontWeight="700"
          fontSize="104"
          fill="#111"
          transform="rotate(-8 415 290)"
        >
          &amp; Hold
        </text>
      </svg>
      <style>{`
        @keyframes tt-hint-pop {
          from { opacity: 0; transform-origin: 0 100%; scale: 0.6; }
          to   { opacity: 1; transform-origin: 0 100%; scale: 1; }
        }
      `}</style>
    </div>
  )
}
