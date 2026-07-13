'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Locale } from '../../lib/i18n'
import { switchLocalePath } from '../../lib/i18n'

export function LocaleToggle({ locale }: { locale: Locale }) {
  const pathname = usePathname() || `/${locale}`
  const other: Locale = locale === 'en' ? 'id' : 'en'

  return (
    <Link
      href={switchLocalePath(pathname, other)}
      onClick={() => {
        document.cookie = `NEXT_LOCALE=${other};path=/;max-age=${60 * 60 * 24 * 365}`
      }}
      aria-label={other === 'id' ? 'Ganti ke Bahasa Indonesia' : 'Switch to English'}
      style={{
        fontSize: '0.75rem',
        letterSpacing: '0.08em',
        color: 'var(--muted)',
        textDecoration: 'none',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span style={{ color: locale === 'en' ? 'var(--fg)' : undefined }}>EN</span>
      {' / '}
      <span style={{ color: locale === 'id' ? 'var(--fg)' : undefined }}>ID</span>
    </Link>
  )
}
