'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

type ServiceItem = { id: number; name: string; capabilities: string[] }

// Numbered 01-04 rows; each row's capability list cascades in on first view;
// hover warms the row background slightly (spec base §1.2/§3.5).
export function ServicesRows({ heading, services }: { heading?: string | null; services: ServiceItem[] }) {
  const listRefs = useRef<(HTMLUListElement | null)[]>([])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const triggers = listRefs.current
      .filter((el): el is HTMLUListElement => !!el)
      .map((list) => {
        const items = list.querySelectorAll('li')
        gsap.set(items, { opacity: 0, y: 14 })
        return ScrollTrigger.create({
          trigger: list,
          start: 'top 80%',
          once: true,
          onEnter: () => gsap.to(items, { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: 'power2.out' }),
        })
      })
    return () => triggers.forEach((t) => t.kill())
  }, [services])

  if (services.length === 0) return null

  return (
    <section style={{ paddingBlock: 'var(--section-gap)' }}>
      <div className="tt-container">
        {heading ? (
          <h2 className="tt-display" style={{ fontSize: 'var(--text-manifesto)', marginBottom: 'clamp(40px, 6vw, 96px)' }}>
            {heading}
          </h2>
        ) : null}
        {services.map((service, i) => (
          <div
            key={service.id}
            className="tt-service-row"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(80px, 200px) 1fr',
              gap: 'clamp(20px, 4vw, 48px)',
              padding: 'clamp(20px, 3vw, 36px) var(--gutter)',
              marginInline: 'calc(-1 * var(--gutter))',
              borderTop: '1px solid var(--line)',
              borderRadius: 2,
              transition: 'background-color 0.3s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6em' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="tt-display" style={{ fontSize: 'clamp(1.1rem, 2vw, 1.5rem)' }}>
                {service.name}
              </span>
            </div>
            <ul
              ref={(el) => {
                listRefs.current[i] = el
              }}
              style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em 1.5em', listStyle: 'none', margin: 0, padding: 0 }}
            >
              {service.capabilities.map((cap, ci) => (
                <li key={ci} style={{ fontSize: '0.9375rem', color: 'var(--muted)' }}>
                  {cap}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <style>{`
        .tt-service-row:hover { background-color: color-mix(in srgb, var(--accent) 4%, transparent); }
      `}</style>
    </section>
  )
}
