'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { LogoStage } from '../hero/LogoStage'

type Props = {
  line1: string
  line2?: string | null
  locationLine?: string | null
  scrollCue?: string | null
}

// No preloader — the hero IS the arrival moment (spec base §1.2/§3.2).
// Lines mask-reveal on load (<=0.9s); the scroll cue fades permanently on
// the visitor's first scroll.
export function HeroBlock({ line1, line2, locationLine, scrollCue }: Props) {
  const line1Ref = useRef<HTMLDivElement>(null)
  const line2Ref = useRef<HTMLDivElement>(null)
  const metaRef = useRef<HTMLDivElement>(null)
  const cueRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const targets = [line1Ref.current, line2Ref.current, metaRef.current].filter(Boolean)
    if (reduced) {
      gsap.set(targets, { clearProps: 'all' })
    } else {
      gsap.set(targets, { yPercent: 100 })
      gsap.to(targets, {
        yPercent: 0,
        duration: 0.75,
        stagger: 0.08,
        ease: 'power3.out',
        delay: 0.1,
      })
    }

    const onScroll = () => {
      gsap.to(cueRef.current, { opacity: 0, duration: 0.4, ease: 'power1.out' })
      window.removeEventListener('scroll', onScroll)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <section style={{ position: 'relative', minHeight: '100svh', overflow: 'hidden' }}>
      <LogoStage />
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
        <div style={{ overflow: 'hidden' }}>
          <h1
            ref={line1Ref}
            className="tt-display"
            style={{ fontSize: 'var(--text-h1)', lineHeight: 'var(--leading-display)', margin: 0, maxWidth: '16ch' }}
          >
            {line1}
          </h1>
        </div>
        {line2 ? (
          <div style={{ overflow: 'hidden', marginTop: '0.4em' }}>
            <p
              ref={line2Ref}
              style={{ fontSize: 'var(--text-manifesto)', lineHeight: 'var(--leading-manifesto)', color: 'var(--muted)', maxWidth: '22ch', margin: 0 }}
            >
              {line2}
            </p>
          </div>
        ) : null}
        <div ref={metaRef} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '2rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>{locationLine}</span>
          <span ref={cueRef} style={{ fontSize: '0.8125rem', color: 'var(--accent)' }}>
            ↓ {scrollCue}
          </span>
        </div>
      </div>
    </section>
  )
}
