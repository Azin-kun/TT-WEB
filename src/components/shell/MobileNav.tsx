import Link from 'next/link'

type NavItem = { num: string; label: string; href: string }

// Mobile side nav (<420px, where the horizontal header nav is hidden).
// Always visible — the nav labels run vertically up the right edge in red,
// framed top and bottom by corner-bracket marks, no background. Matches the
// owner's sketch (2026-07-14). No toggle, no drawer, no auto-hide.
export function MobileNav({ nav }: { nav: NavItem[] }) {
  return (
    <div className="tt-mobile-nav" aria-hidden={false}>
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
            gap: 12px;
            position: fixed;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            z-index: 50;
            pointer-events: none;
          }

          .tt-mnav-text {
            writing-mode: vertical-rl;
            transform: rotate(180deg);
            display: flex;
            align-items: center;
            gap: 12px;
            pointer-events: auto;
          }
          .tt-mnav-item {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .tt-mnav-text a {
            text-decoration: none;
            color: var(--accent);
            font-family: var(--font-display);
            font-size: 1rem;
            letter-spacing: 0.05em;
          }
          .tt-mnav-text a:active {
            opacity: 0.6;
          }
          .tt-mnav-sep {
            color: var(--accent);
            opacity: 0.55;
          }

          .tt-mnav-bracket {
            width: 15px;
            height: 11px;
            border: 1.5px solid var(--accent);
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
