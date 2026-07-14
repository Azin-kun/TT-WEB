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
// Lines mask-reveal on load (<=0.9s); the scroll cue fades permanently on
// the visitor's first scroll.
export function HeroBlock({
  line1,
  line2,
  locationLine,
  scrollCue,
  constellationEnabled = true,
  floatingWords = [],
}: Props) {
  const line1Ref = useRef<HTMLDivElement>(null)
  const line2Ref = useRef<HTMLDivElement>(null)
  const metaRef = useRef<HTMLDivElement>(null)
  const cueRef = useRef<HTMLSpanElement>(null)
  const [stageLive, setStageLive] = useState(false)
  const onStageLive = useCallback(() => setStageLive(true), [])

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
      <LogoStage onLive={onStageLive} />
      <ConstellationField words={floatingWords} enabled={constellationEnabled} active={stageLive} />
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
            data-constellation-avoid
            style={{
              fontSize: 'var(--text-h1)',
              lineHeight: 'var(--leading-display)',
              margin: 0,
              maxWidth: 'min(16ch, 30vw)',
            }}
          >
            {line1}
          </h1>
        </div>
        {line2 ? (
          <div style={{ overflow: 'hidden', marginTop: '0.4em' }}>
            <p
              ref={line2Ref}
              data-constellation-avoid
              style={{
                fontSize: 'var(--text-manifesto)',
                lineHeight: 'var(--leading-manifesto)',
                color: 'var(--muted)',
                maxWidth: 'min(20ch, 27vw)',
                margin: 0,
              }}
            >
              {line2}
            </p>
          </div>
        ) : null}
        <div
          ref={metaRef}
          data-constellation-avoid
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '2rem' }}
        >
          <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>{locationLine}</span>
          <span ref={cueRef} style={{ fontSize: '0.8125rem', color: 'var(--accent)' }}>
            ↓ {scrollCue}
          </span>
        </div>
      </div>
    </section>
  )
}
