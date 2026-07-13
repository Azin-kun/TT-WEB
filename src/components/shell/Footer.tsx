import Link from 'next/link'
import type { SiteSetting } from '../../payload-types'
import type { Locale } from '../../lib/i18n'
import { LocaleToggle } from './LocaleToggle'

export function Footer({ locale, settings }: { locale: Locale; settings: SiteSetting }) {
  const nav = [
    { num: '001', label: settings.navLabels?.home || 'Homepage', href: `/${locale}` },
    { num: '002', label: settings.navLabels?.manifesto || 'Manifesto', href: `/${locale}/manifesto` },
    { num: '003', label: settings.navLabels?.archive || 'Archive', href: `/${locale}/archive` },
  ]

  return (
    <footer style={{ marginTop: 'var(--section-gap)', borderTop: '1px solid var(--line)' }}>
      {/* quiet logo rhythm band (Synapser motif) */}
      <div
        aria-hidden
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 'clamp(28px, 6vw, 72px)',
          padding: '28px 0 0',
          opacity: 0.1,
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="tt-logo" style={{ width: 26, height: 24 }} />
        ))}
      </div>

      <div
        className="tt-container"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          paddingBlock: 28,
        }}
      >
        <ol style={{ display: 'flex', gap: 22, listStyle: 'none', margin: 0, padding: 0 }}>
          {nav.map((item) => (
            <li key={item.num}>
              <Link className="tt-navlink" href={item.href}>
                <span className="num">{item.num}</span>
                <span className="label">{item.label}</span>
              </Link>
            </li>
          ))}
        </ol>

        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {(settings.socials || []).map((s) =>
            s?.url ? (
              <a
                key={s.id || s.label}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="tt-navlink"
              >
                {s.label}
              </a>
            ) : null,
          )}
          <LocaleToggle locale={locale} />
        </div>
      </div>

      <div
        className="tt-container"
        style={{ paddingBottom: 24, fontSize: '0.75rem', color: 'var(--muted)' }}
      >
        © {new Date().getFullYear()} {settings.siteName || 'TAMPA TARUNO'}
      </div>
    </footer>
  )
}
