'use client'

import { useEffect, useRef, useState } from 'react'

// Full-bleed sketch-draw video that plays once per session on first visit,
// then hands off to the 3D mesh (spec §7). Returning visitors / reduced-motion
// see the static poster instead (which is the video's final frame).
// `allowPlay` gates the whole thing (mobile: held closed until the hero
// headline finishes dissolving, spec revision 2026-07-14) — starts `true` by
// default (matching server render) and the parent closes it, within the same
// mount tick, for actual mobile viewports before this component's own effect
// gets a chance to call play(); the safety pause below covers that race.
export function SketchIntro({
  onDone,
  allowPlay = true,
}: {
  onDone: () => void
  allowPlay?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hidden, setHidden] = useState(false)
  const doneRef = useRef(false)
  const startedRef = useRef(false)

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    try {
      sessionStorage.setItem('tt-intro-done', '1')
    } catch {}
    setHidden(true)
    onDone()
  }

  useEffect(() => {
    if (!allowPlay) {
      if (startedRef.current && !doneRef.current) videoRef.current?.pause()
      return
    }
    if (startedRef.current || doneRef.current) return
    startedRef.current = true

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let seen = false
    try {
      seen = sessionStorage.getItem('tt-intro-done') === '1'
    } catch {}

    if (reduced || seen) {
      finish()
      return
    }
    const v = videoRef.current
    if (!v) return
    v.play().catch(() => finish()) // autoplay blocked → skip to mesh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowPlay])

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        opacity: hidden ? 0 : allowPlay ? 1 : 0,
        transition: 'opacity 0.5s ease',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        preload="auto"
        onEnded={finish}
        poster="/media/sketch-poster.webp"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      >
        <source src="/media/sketch-draw-16x9.webm" type="video/webm" />
        <source src="/media/sketch-draw-16x9.mp4" type="video/mp4" />
      </video>
    </div>
  )
}
