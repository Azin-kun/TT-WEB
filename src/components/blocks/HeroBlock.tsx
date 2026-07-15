'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { LogoStage } from '../hero/LogoStage'
import { ConstellationField } from '../hero/ConstellationField'

gsap.registerPlugin(SplitText)

type Props = {
  line1: string
  line2?: string | null
  locationLine?: string | null
  scrollCue?: string | null
  constellationEnabled?: boolean
  floatingWords?: string[]
}

// No preloader — the hero IS the arrival moment (spec base §1.2/§3.2).
// The two headline lines reveal word-by-word, hold, then dissolve entirely
// so the constellation can roam the freed space once they're gone (spec:
// SYNAPSER plan §10 revision, 2026-07-14).
export function HeroBlock({
  line1,
  line2,
  locationLine,
  scrollCue,
  constellationEnabled = true,
  floatingWords = [],
}: Props) {
  const line1Ref = useRef<HTMLHeadingElement>(null)
  const line2Ref = useRef<HTMLParagraphElement>(null)
  const metaRef = useRef<HTMLDivElement>(null)
  const cueRef = useRef<HTMLSpanElement>(null)
  const [stageLive, setStageLive] = useState(false)
  const onStageLive = useCallback(() => setStageLive(true), [])
  // The sketch video/3D logo/constellation stay hidden until both headline
  // lines finish dissolving (desktop and mobile alike). Starts true (matches
  // server render — avoids a hydration mismatch) and is closed inside the
  // entrance effect below, within the same tick as mount.
  const [videoGate, setVideoGate] = useState(true)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    gsap.set(metaRef.current, { yPercent: 100 })
    gsap.to(metaRef.current, { yPercent: 0, duration: 0.75, ease: 'power3.out', delay: 0.1 })

    if (reduced) {
      gsap.set([line1Ref.current, line2Ref.current], { clearProps: 'all' })
      setVideoGate(true) // no disappear event will fire — don't leave mobile gated shut
      return
    }

    // Desktop: 3s to fully reveal, hold, dissolve starting at 6s.
    // Mobile: 2.2s to fully reveal, hold 3s, dissolve starting at 5.2s.
    const isMobile = window.innerWidth < 640
    setVideoGate(false)
    const revealDur = isMobile ? 2.2 : 3.0
    const holdDur = 3.0
    const disappearAt = revealDur + holdDur

    const splits = ([line1Ref.current, line2Ref.current].filter((el) => el !== null) as (
      | HTMLHeadingElement
      | HTMLParagraphElement
    )[]).map((el) => new SplitText(el, { type: 'chars' }))

    gsap.set(splits.flatMap((s) => s.chars), { opacity: 0, yPercent: 70 })

    const tl = gsap.timeline()
    splits.forEach((s) => {
      tl.to(
        s.chars,
        {
          opacity: 1,
          yPercent: 0,
          duration: 0.35,
          ease: 'power2.out',
          stagger: { amount: Math.max(0.15, revealDur - 0.35) },
        },
        0,
      )
    })
    tl.to(
      [line1Ref.current, line2Ref.current].filter(Boolean),
      {
        opacity: 0,
        duration: 0.9,
        ease: 'power2.out',
        onComplete: () => {
          ;[line1Ref.current, line2Ref.current].forEach((el) => {
            if (el) el.style.display = 'none'
          })
          // headline no longer occupies space — let the constellation reclaim it
          window.dispatchEvent(new Event('resize'))
          // only now let the sketch video / logo / constellation appear
          setVideoGate(true)
        },
      },
      disappearAt,
    )

    return () => {
      tl.kill()
      splits.forEach((s) => s.revert())
    }
  }, [])

  useEffect(() => {
    const onScroll = () => {
      gsap.to(cueRef.current, { opacity: 0, duration: 0.4, ease: 'power1.out' })
      window.removeEventListener('scroll', onScroll)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <section style={{ position: 'relative', minHeight: '100svh', overflow: 'hidden' }}>
      <LogoStage onLive={onStageLive} allowPlay={videoGate} />
      <ConstellationField words={floatingWords} enabled={constellationEnabled} active={stageLive} />

      <div
        className="hero-headline-overlay"
        style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
      >
        <div className="tt-container" style={{ position: 'relative', height: '100%' }}>
          <h1
            ref={line1Ref}
            className="tt-display hero-text1"
            data-constellation-avoid
            style={{
              position: 'absolute',
              top: 'clamp(96px, 14vh, 140px)',
              left: 0,
              margin: 0,
              maxWidth: 'min(16ch, 30vw)',
              color: '#333333',
              fontSize: 'var(--text-h1)',
              lineHeight: 'var(--leading-display)',
            }}
          >
            {line1}
          </h1>
          {line2 ? (
            <p
              ref={line2Ref}
              className="hero-text2"
              data-constellation-avoid
              style={{
                position: 'absolute',
                bottom: 'calc(8vh + 4.5rem)',
                right: 0,
                margin: 0,
                maxWidth: 'min(20ch, 27vw)',
                textAlign: 'right',
                color: 'var(--accent)',
                fontSize: 'var(--text-manifesto)',
                lineHeight: 'var(--leading-manifesto)',
              }}
            >
              {line2}
            </p>
          ) : null}
        </div>
      </div>

      <div
        className="tt-container"
        style={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100svh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          paddingBottom: '8vh',
          pointerEvents: 'none',
        }}
      >
        <div
          ref={metaRef}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
        >
          <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>{locationLine}</span>
          <span ref={cueRef} style={{ fontSize: '0.8125rem', color: 'var(--accent)' }}>
            ↓ {scrollCue}
          </span>
        </div>
      </div>

      <style>{`
        @media (max-width: 639px) {
          .hero-headline-overlay .tt-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.75em;
            text-align: center;
          }
          .hero-text1,
          .hero-text2 {
            position: static !important;
            max-width: 80vw !important;
            text-align: center !important;
          }
        }
      `}</style>
    </section>
  )
}
