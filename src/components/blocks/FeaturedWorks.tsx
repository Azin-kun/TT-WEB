'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { PlaceholderFrame } from './PlaceholderFrame'

gsap.registerPlugin(ScrollTrigger)

type WorkItem = { id: number; title: string; slug: string; category: string; year: number }

// Alternating 60/40 tiles with slow parallax (spec base §1.2/§3.4). Covers are
// placeholders until real work imagery (H4) exists; title italicizes on hover.
export function FeaturedWorks({
  heading,
  works,
  locale,
}: {
  heading?: string | null
  works: WorkItem[]
  locale: string
}) {
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const triggers = rowRefs.current
      .filter((el): el is HTMLDivElement => !!el)
      .map((row) => {
        const media = row.querySelector<HTMLElement>('[data-media]')
        if (!media) return null
        return ScrollTrigger.create({
          trigger: row,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.6,
          onUpdate: (self) => gsap.set(media, { yPercent: (self.progress - 0.5) * 10 }),
        })
      })
    return () => triggers.forEach((t) => t?.kill())
  }, [works])

  if (works.length === 0) return null

  return (
    <section style={{ paddingBlock: 'var(--section-gap)' }}>
      <div className="tt-container">
        {heading ? (
          <h2 className="tt-display" style={{ fontSize: 'var(--text-manifesto)', marginBottom: 'clamp(48px, 8vw, 120px)' }}>
            {heading}
          </h2>
        ) : null}
        {works.map((work, i) => {
          const reverse = i % 2 === 1
          return (
            <div
              key={work.id}
              ref={(el) => {
                rowRefs.current[i] = el
              }}
              className="tt-work-row"
              style={{
                display: 'grid',
                gridTemplateColumns: reverse ? '2fr 3fr' : '3fr 2fr',
                gap: 'clamp(20px, 4vw, 56px)',
                alignItems: 'center',
                marginBottom: 'clamp(56px, 10vw, 140px)',
              }}
            >
              <Link
                href={`/${locale}/work/${work.slug}`}
                data-cursor="view"
                style={{ order: reverse ? 2 : 1, textDecoration: 'none', overflow: 'hidden', borderRadius: 2 }}
              >
                <div data-media style={{ willChange: 'transform' }}>
                  <PlaceholderFrame label={work.category} />
                </div>
              </Link>
              <div style={{ order: reverse ? 1 : 2 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--accent)', letterSpacing: '0.06em' }}>
                  {String(i + 1).padStart(2, '0')} — {work.year}
                </span>
                <Link
                  href={`/${locale}/work/${work.slug}`}
                  className="tt-work-title tt-display"
                  style={{
                    display: 'block',
                    fontSize: 'clamp(1.5rem, 3.4vw, 2.75rem)',
                    marginTop: '0.3em',
                    color: 'var(--fg)',
                    textDecoration: 'none',
                  }}
                >
                  {work.title}
                </Link>
              </div>
            </div>
          )
        })}
      </div>
      <style>{`
        .tt-work-row:hover .tt-work-title { font-style: italic; }
        @media (max-width: 640px) {
          .tt-work-row { grid-template-columns: 1fr !important; }
          .tt-work-row > * { order: unset !important; }
        }
      `}</style>
    </section>
  )
}
