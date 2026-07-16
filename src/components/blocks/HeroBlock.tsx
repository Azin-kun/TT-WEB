'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { LogoStage } from '../hero/LogoStage'
import { ConstellationField } from '../hero/ConstellationField'

type Props = {
  line1: string
  line2?: string | null
  locationLine?: string | null
  scrollCue?: string | null
  constellationEnabled?: boolean
  floatingWords?: string[]
}

// No preloader — the hero IS the arrival moment (spec base §1.2/§3.2).
// Sequence: headline blur-reveals (CSS only — see .hero-text1/.hero-text2
// keyframes below) *while* the sketch-draw video plays concurrently → video
// ends and crossfades to the rotating 3D logo → constellation floating
// words activate. The headline dissolves the moment the logo goes live,
// freeing its space for the constellation. Nothing is gated behind a
// "seen this session" flag, so the whole sequence replays every time the
// hero remounts (e.g. navigating back from Manifesto/Archive).
export function HeroBlock({
  line1,
  line2,
  locationLine,
  scrollCue,
  constellationEnabled = true,
  floatingWords = [],
}: Props) {
  const metaRef = useRef<HTMLDivElement>(null)
  const cueRef = useRef<HTMLSpanElement>(null)
  const [stageLive, setStageLive] = useState(false)
  const onStageLive = useCallback(() => setStageLive(true), [])

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      gsap.set(metaRef.current, { clearProps: 'all' })
      return
    }
    gsap.set(metaRef.current, { yPercent: 100 })
    gsap.to(metaRef.current, { yPercent: 0, duration: 0.75, ease: 'power3.out', delay: 0.1 })
  }, [])

  useEffect(() => {
    if (!stageLive) return
    // headline is dissolving (CSS transition below) — once it's clear of the
    // layout, let the constellation reclaim the freed space
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 650)
    return () => clearTimeout(t)
  }, [stageLive])

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
      <LogoStage onLive={onStageLive} />
      <ConstellationField words={floatingWords} enabled={constellationEnabled} active={stageLive} />

      <div
        className="hero-headline-overlay"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          opacity: stageLive ? 0 : 1,
          visibility: stageLive ? 'hidden' : 'visible',
          transition: 'opacity 0.6s ease',
        }}
      >
        <div className="tt-container" style={{ position: 'relative', height: '100%' }}>
          <h1
            className="tt-display hero-text1"
            data-constellation-avoid
            style={{
              position: 'absolute',
              top: 'clamp(96px, 14vh, 140px)',
              left: 0,
              margin: 0,
              whiteSpace: 'nowrap',
              color: '#333333',
              fontSize: 'clamp(1.5rem, 4.2vw, var(--text-h1))',
              lineHeight: 'var(--leading-display)',
            }}
          >
            {line1}
          </h1>
          {line2 ? (
            <p
              className="hero-text2"
              data-constellation-avoid
              style={{
                position: 'absolute',
                bottom: 'calc(8vh + 4.5rem)',
                right: 0,
                margin: 0,
                whiteSpace: 'nowrap',
                textAlign: 'right',
                color: 'var(--accent)',
                fontSize: 'clamp(1.1rem, 2.6vw, var(--text-manifesto))',
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
        @keyframes heroBlurIn {
          from { opacity: 0; filter: blur(14px); transform: translateY(10px); }
          to { opacity: 1; filter: blur(0); transform: translateY(0); }
        }
        .hero-text1, .hero-text2 {
          animation: heroBlurIn 1.1s ease both;
        }
        .hero-text2 { animation-delay: 0.15s; }
        @media (prefers-reduced-motion: reduce) {
          .hero-text1, .hero-text2 { animation: none; }
        }
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
            text-align: center !important;
            font-size: clamp(1.1rem, 6.5vw, 2rem) !important;
          }
        }
      `}</style>
    </section>
  )
}
