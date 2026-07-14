import Link from 'next/link'
import type { SiteSetting } from '../../payload-types'
import type { Locale } from '../../lib/i18n'
import { LocaleToggle } from './LocaleToggle'
import { MobileNav } from './MobileNav'

export function Header({ locale, settings }: { locale: Locale; settings: SiteSetting }) {
  const nav = [
    { num: '001', label: settings.navLabels?.home || 'Homepage', href: `/${locale}` },
    { num: '002', label: settings.navLabels?.manifesto || 'Manifesto', href: `/${locale}/manifesto` },
    { num: '003', label: settings.navLabels?.archive || 'Archive', href: `/${locale}/archive` },
  ]

  return (
    <header
      style={{
        position: 'fixed',
        insetInline: 0,
        top: 0,
        zIndex: 'var(--z-header)' as never,
      }}
    >
      <div
        className="tt-container tt-header-row"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBlock: 18, gap: 8 }}
      >
        <Link href={`/${locale}`} aria-label={settings.siteName || 'TAMPA TARUNO'} style={{ flexShrink: 0 }}>
          <span className="tt-logo" style={{ width: 36, height: 34 }} />
        </Link>

        <nav aria-label="Primary" className="tt-header-nav">
          <ol style={{ display: 'flex', gap: 'clamp(10px, 3vw, 34px)', listStyle: 'none', margin: 0, padding: 0 }}>
            {nav.map((item) => (
              <li key={item.num}>
                <Link className="tt-navlink" href={item.href}>
                  <span className="num">{item.num}</span>
                  <span className="label">{item.label}</span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px, 2vw, 22px)', flexShrink: 0 }}>
          <LocaleToggle locale={locale} />
        </div>
      </div>

      <MobileNav nav={nav} />

      <style>{`
        @media (max-width: 560px) {
          .tt-header-nav .label { display: none; }
        }
        @media (max-width: 420px) {
          .tt-header-nav { display: none; }
        }
      `}</style>
    </header>
  )
}
