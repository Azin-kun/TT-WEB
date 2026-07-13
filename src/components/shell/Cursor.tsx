'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Dot cursor companion — fine pointers only (spec base §3.8). Grows into a
 * labeled pill over any element carrying `data-cursor="View"`/`"Drag"`/etc.
 */
export function Cursor() {
  const ref = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = ref.current
    if (!el) return

    let x = -100,
      y = -100,
      tx = -100,
      ty = -100,
      raf = 0
    const onMove = (e: PointerEvent) => {
      tx = e.clientX
      ty = e.clientY
      el.style.opacity = '1'
      const target = (e.target as HTMLElement)?.closest?.('[data-cursor]')
      setLabel(target ? target.getAttribute('data-cursor') : null)
    }
    const onLeave = () => {
      el.style.opacity = '0'
    }
    const tick = () => {
      x += (tx - x) * 0.22
      y += (ty - y) * 0.22
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`
      raf = requestAnimationFrame(tick)
    }
    window.addEventListener('pointermove', onMove)
    document.documentElement.addEventListener('pointerleave', onLeave)
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 9999,
        opacity: 0,
        transition: 'opacity 0.3s ease',
        display: 'flex',
        alignItems: 'center',
        transform: 'translate3d(-100px,-100px,0)',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          marginLeft: -4,
          marginTop: -4,
          borderRadius: 999,
          background: 'var(--accent)',
          display: label ? 'none' : 'block',
        }}
      />
      <span
        ref={labelRef}
        style={{
          display: label ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 56,
          height: 56,
          marginLeft: -28,
          marginTop: -28,
          borderRadius: 999,
          background: 'var(--fg)',
          color: 'var(--bg)',
          fontSize: '0.75rem',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
    </div>
  )
}
