'use client'

import { useEffect, useRef, useState, type MouseEventHandler } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { SiteSetting } from '../../payload-types'
import type { Locale } from '../../lib/i18n'
import { LocaleToggle } from './LocaleToggle'

const REVEAL_PX = 64 // cursor within this many px of the top edge shows the bar
const HIDE_PX = 140 // cursor past this hides it again (gap avoids flicker at the edge)
const INITIAL_HIDE_MS = 1400 // hides shortly after load if the cursor never approaches the top
const HIDE_DELAY_MS = 900 // grace period before actually hiding, so a quick pass-through doesn't flash it away

// Owner request 2026-07-17: the bar auto-hides and reappears when the
// cursor approaches the top of the screen — fine-pointer/hover devices
// only (touch has no hover to detect, so it just stays put there; the
// separate MobileNav sidebar — rendered by the layout as a SIBLING of this
// component, not nested inside it, see layout.tsx — is the real mobile nav
// anyway).
export function Header({ locale, settings }: { locale: Locale; settings: SiteSetting }) {
  const pathname = usePathname() || `/${locale}`
  const headerRef = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(true)

  const nav = [
    { num: '001', label: settings.navLabels?.home || 'Homepage', href: `/${locale}` },
    { num: '002', label: settings.navLabels?.manifesto || 'Manifesto', href: `/${locale}/manifesto` },
    { num: '003', label: settings.navLabels?.archive || 'Archive', href: `/${locale}/archive` },
  ]

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

    let hideTimer: ReturnType<typeof setTimeout> | null = null
    const clearHideTimer = () => {
      if (hideTimer) {
        clearTimeout(hideTimer)
        hideTimer = null
      }
    }
    const scheduleHide = () => {
      if (hideTimer) return
      hideTimer = setTimeout(() => {
        hideTimer = null
        if (headerRef.current?.contains(document.activeElement)) return
        setVisible(false)
      }, HIDE_DELAY_MS)
    }
    const onMove = (e: MouseEvent) => {
      if (e.clientY <= REVEAL_PX) {
        clearHideTimer()
        setVisible(true)
      } else if (e.clientY > HIDE_PX) {
        scheduleHide()
      }
    }
    const onFocusIn = () => {
      clearHideTimer()
      setVisible(true)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('focusin', onFocusIn)
    const initialHide = setTimeout(() => setVisible(false), INITIAL_HIDE_MS)

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('focusin', onFocusIn)
      clearHideTimer()
      clearTimeout(initialHide)
    }
  }, [])

  const onLogoClick: MouseEventHandler = (e) => {
    if (pathname !== `/${locale}`) return // let Link navigate home normally
    e.preventDefault()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
  }

  return (
    <header
      ref={headerRef}
      style={{
        position: 'fixed',
        insetInline: 0,
        top: 0,
        zIndex: 'var(--z-header)' as never,
        transform: visible ? 'translateY(0)' : 'translateY(-100%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.3s ease, opacity 0.3s ease',
      }}
    >
      <div
        className="tt-container tt-header-row"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBlock: 18, gap: 8 }}
      >
        <Link
          href={`/${locale}`}
          aria-label={settings.siteName || 'TAMPA TARUNO'}
          onClick={onLogoClick}
          style={{ flexShrink: 0 }}
        >
          <img src="/media/logo-full-color.svg" alt="" width={36} height={34} style={{ display: 'block' }} />
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
