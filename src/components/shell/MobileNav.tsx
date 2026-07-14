'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type NavItem = { num: string; label: string; href: string }

// Below 420px the inline header nav disappears entirely (Header.tsx) — this
// is the only way to reach Manifesto/Archive on narrow phones. Collapsed by
// default (an edge tab, not a hamburger buried in the header) but the tab
// itself is deliberately loud: a red-outlined parallelogram, no fill, always
// pinned to the right edge so it reads as "there's more here" at a glance.
export function MobileNav({ nav }: { nav: NavItem[] }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="tt-mobile-nav">
      <button
        type="button"
        className="tt-mobile-nav-tab"
        aria-label={open ? 'Close navigation' : 'Open navigation'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>MENU</span>
      </button>

      <div
        className="tt-mobile-nav-backdrop"
        data-open={open}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      <nav
        aria-label="Primary"
        aria-hidden={!open}
        className="tt-mobile-nav-drawer"
        data-open={open}
      >
        <button
          type="button"
          className="tt-mobile-nav-close"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
        <ol>
          {nav.map((item) => (
            <li key={item.num}>
              <Link href={item.href} onClick={() => setOpen(false)}>
                <span className="num">{item.num}</span>
                <span className="label">{item.label}</span>
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <style>{`
        .tt-mobile-nav { display: none; }

        @media (max-width: 420px) {
          .tt-mobile-nav { display: contents; }

          .tt-mobile-nav-tab {
            position: fixed;
            top: 50%;
            right: 0;
            transform: translateY(-50%);
            width: 34px;
            height: 92px;
            clip-path: polygon(38% 0%, 100% 0%, 62% 100%, 0% 100%);
            background: transparent;
            border: 1.5px solid var(--accent);
            border-right: none;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 0 0 6px;
            cursor: pointer;
            z-index: 50;
          }
          .tt-mobile-nav-tab span {
            writing-mode: vertical-rl;
            transform: rotate(180deg);
            font-size: 0.6875rem;
            letter-spacing: 0.16em;
            color: var(--accent);
            font-family: var(--font-body);
          }

          .tt-mobile-nav-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.25);
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
            z-index: 51;
          }
          .tt-mobile-nav-backdrop[data-open='true'] {
            opacity: 1;
            pointer-events: auto;
          }

          .tt-mobile-nav-drawer {
            position: fixed;
            top: 0;
            right: 0;
            height: 100%;
            width: min(72vw, 300px);
            background: var(--panel);
            border-left: 1.5px solid var(--accent);
            box-shadow: -12px 0 32px rgba(0, 0, 0, 0.12);
            transform: translateX(100%);
            transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
            z-index: 52;
            padding: 28px 24px;
            display: flex;
            flex-direction: column;
          }
          .tt-mobile-nav-drawer[data-open='true'] {
            transform: translateX(0);
          }

          .tt-mobile-nav-close {
            align-self: flex-end;
            background: none;
            border: none;
            color: var(--fg);
            font-size: 1.125rem;
            line-height: 1;
            cursor: pointer;
            padding: 8px;
            margin: -8px -8px 24px 0;
          }

          .tt-mobile-nav-drawer ol {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 22px;
          }
          .tt-mobile-nav-drawer a {
            display: flex;
            align-items: baseline;
            gap: 0.6em;
            text-decoration: none;
            font-size: 1.25rem;
            color: var(--fg);
          }
          .tt-mobile-nav-drawer .num {
            font-size: 0.75rem;
            font-variant-numeric: tabular-nums;
            color: var(--accent);
          }
        }
      `}</style>
    </div>
  )
}
