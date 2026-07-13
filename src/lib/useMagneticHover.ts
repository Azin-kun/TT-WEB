import { useEffect, type RefObject } from 'react'
import { gsap } from 'gsap'

/** Translates `ref`'s element toward the cursor within `radius` px, spring-returns on leave. */
export function useMagneticHover(ref: RefObject<HTMLElement | null>, radius = 90) {
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height / 2)
      const dist = Math.hypot(dx, dy)
      if (dist < radius + r.width / 2) {
        gsap.to(el, { x: dx * 0.25, y: dy * 0.25, duration: 0.4, ease: 'power2.out' })
      }
    }
    const onLeave = () => gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.4)' })

    window.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
    }
  }, [ref, radius])
}
