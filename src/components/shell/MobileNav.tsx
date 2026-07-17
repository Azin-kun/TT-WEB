'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type NavItem = { num: string; label: string; href: string }

const INITIAL_HIDE_MS = 1400 // hides shortly after load, mirrors the desktop header
const REVEAL_HOLD_MS = 2500 // stays visible this long after the last tap
const SLIDE_OUT_X = '150%' // clears the 20px right-edge margin fully off-screen

// Mobile side nav (<420px, where the horizontal header nav is hidden). Nav
// labels run vertically up the right-middle edge in red, framed top and
// bottom by corner-bracket marks, no background — matches the owner's sketch
// (2026-07-14). Auto-hides and reappears on any tap (owner request
// 2026-07-17: touchscreens have no cursor to detect proximity with like the
// desktop header does, so "tap anywhere" stands in for "cursor near the
// edge"), sliding in from the right edge (owner request 2026-07-17) rather
// than a plain fade. No drawer, no toggle button — the reveal is purely
// time-based.
export function MobileNav({ nav }: { nav: NavItem[] }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null
    const clearHideTimer = () => {
      if (hideTimer) {
        clearTimeout(hideTimer)
        hideTimer = null
      }
    }
    const reveal = () => {
      clearHideTimer()
      setVisible(true)
      hideTimer = setTimeout(() => setVisible(false), REVEAL_HOLD_MS)
    }
    // pointerdown (not touchstart) so this also works with a mouse in a
    // resized/emulated mobile viewport, not just real touch devices
    window.addEventListener('pointerdown', reveal, { passive: true })
    const initialHide = setTimeout(() => setVisible(false), INITIAL_HIDE_MS)

    return () => {
      window.removeEventListener('pointerdown', reveal)
      clearHideTimer()
      clearTimeout(initialHide)
    }
  }, [])

  return (
    <div
      className="tt-mobile-nav"
      aria-hidden={false}
      style={{
        opacity: visible ? 1 : 0,
        visibility: visible ? 'visible' : 'hidden',
        // translateY(-50%) keeps it vertically centered (right-middle);
        // translateX slides it in/out from the right edge — "arise" motion
        transform: `translate(${visible ? '0%' : SLIDE_OUT_X}, -50%)`,
        transition: visible
          ? 'transform 0.35s ease-out, opacity 0.3s ease-out'
          : 'transform 0.35s ease-in, opacity 0.3s ease-in, visibility 0s linear 0.35s',
      }}
    >
      <span className="tt-mnav-bracket tt-mnav-bracket-top" aria-hidden />
      <nav aria-label="Primary" className="tt-mnav-text">
        {nav.map((item, i) => (
          <span key={item.num} className="tt-mnav-item">
            {i > 0 ? (
              <span className="tt-mnav-sep" aria-hidden>
                |
              </span>
            ) : null}
            <Link href={item.href}>{item.label}</Link>
          </span>
        ))}
      </nav>
      <span className="tt-mnav-bracket tt-mnav-bracket-bottom" aria-hidden />

      <style>{`
        .tt-mobile-nav { display: none; }

        @media (max-width: 420px) {
          .tt-mobile-nav {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 9px;
            position: fixed;
            right: 20px;
            top: 50%;
            z-index: 50;
            pointer-events: none;
          }

          .tt-mnav-text {
            writing-mode: vertical-rl;
            transform: rotate(180deg);
            display: flex;
            align-items: center;
            gap: 9px;
            pointer-events: auto;
          }
          .tt-mnav-item {
            display: flex;
            align-items: center;
            gap: 9px;
          }
          .tt-mnav-text a {
            text-decoration: none;
            color: var(--accent);
            font-family: var(--font-display);
            font-size: 0.75rem;
            letter-spacing: 0.05em;
          }
          .tt-mnav-text a:active {
            opacity: 0.6;
          }
          .tt-mnav-sep {
            color: var(--accent);
            opacity: 0.55;
            font-size: 0.75rem;
          }

          .tt-mnav-bracket {
            width: 11px;
            height: 8px;
            border: 1.2px solid var(--accent);
          }
          .tt-mnav-bracket-top {
            border-bottom: none;
            border-left: none;
          }
          .tt-mnav-bracket-bottom {
            border-top: none;
            border-left: none;
          }
        }
      `}</style>
    </div>
  )
}
