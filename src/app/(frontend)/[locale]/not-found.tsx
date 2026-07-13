'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMagneticHover } from '../../../lib/useMagneticHover'
import { isLocale } from '../../../lib/i18n'

// not-found.tsx boundaries don't receive route params as props in the App
// Router, so the locale is read from the matched URL segment client-side.
export default function NotFound() {
  const params = useParams<{ locale?: string }>()
  const locale = isLocale(params?.locale || '') ? (params!.locale as string) : 'en'
  const linkRef = useRef<HTMLAnchorElement>(null)
  useMagneticHover(linkRef)

  const copy =
    locale === 'id'
      ? { title: 'Halaman ini tersesat dalam terjemahan.', cta: 'Kembali ke beranda' }
      : { title: 'This page got lost in translation.', cta: 'Back home' }

  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        padding: 'var(--gutter)',
      }}
    >
      <div>
        <p style={{ fontSize: '0.875rem', color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: '0.5em' }}>404</p>
        <h1 className="tt-display" style={{ fontSize: 'clamp(1.75rem, 5vw, 3.5rem)', maxWidth: '18ch', marginInline: 'auto' }}>
          {copy.title}
        </h1>
        <Link
          ref={linkRef}
          href={`/${locale}`}
          className="tt-display"
          style={{
            display: 'inline-block',
            marginTop: '2em',
            fontSize: 'clamp(1.125rem, 2.5vw, 1.5rem)',
            textDecoration: 'underline',
            textDecorationColor: 'var(--accent)',
            textUnderlineOffset: '0.12em',
            color: 'var(--fg)',
          }}
        >
          {copy.cta}
        </Link>
      </div>
    </div>
  )
}
