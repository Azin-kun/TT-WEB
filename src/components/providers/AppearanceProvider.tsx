'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { useLogoApiRef } from './LogoApi'

export type Appearance = 'atelier' | 'obsidian'

type Ctx = {
  appearance: Appearance
  request: (target: Appearance) => void
  locked: boolean
  transitionEnabled: boolean
}

const AppearanceContext = createContext<Ctx | null>(null)

export const useAppearance = (): Ctx => {
  const ctx = useContext(AppearanceContext)
  if (!ctx) throw new Error('useAppearance outside AppearanceProvider')
  return ctx
}

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function AppearanceProvider({
  transitionEnabled,
  children,
}: {
  transitionEnabled: boolean
  children: React.ReactNode
}) {
  // SSR renders atelier; reconcile with the pre-paint DOM state after hydration.
  const [appearance, setAppearance] = useState<Appearance>('atelier')
  const [locked, setLocked] = useState(false)
  const appearanceRef = useRef<Appearance>('atelier')
  const logoApi = useLogoApiRef()
  const overlayRef = useRef<HTMLDivElement>(null)
  const burstRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const domMode =
      document.documentElement.dataset.appearance === 'obsidian' ? 'obsidian' : 'atelier'
    appearanceRef.current = domMode
    setAppearance((prev) => (prev === domMode ? prev : domMode))
  }, [])

  const apply = useCallback((target: Appearance) => {
    document.documentElement.dataset.appearance = target
    appearanceRef.current = target
    try {
      sessionStorage.setItem('tt-appearance', target)
    } catch {}
    logoApi.current?.setMaterialMode(target)
    setAppearance(target)
  }, [logoApi])

  const request = useCallback(
    (target: Appearance) => {
      if (locked || target === appearanceRef.current) return
      setLocked(true)

      // Reduced-motion or owner kill-switch → plain 0.4s crossfade (tokens
      // transition via CSS); no burst, no scroll lock beyond a tick.
      if (reducedMotion() || !transitionEnabled) {
        apply(target)
        window.setTimeout(() => setLocked(false), 400)
        return
      }

      const overlay = overlayRef.current
      const burst = burstRef.current
      const scrollY = window.scrollY
      const lockScroll = () => {
        document.body.style.overflow = 'hidden'
      }
      const unlock = () => {
        document.body.style.overflow = ''
        setLocked(false)
      }
      lockScroll()

      if (target === 'obsidian') {
        // A → O · ~1.8s (spec §8)
        const tl = gsap.timeline({ onComplete: unlock })
        tl.set(overlay, { background: '#060607', opacity: 0, display: 'block' })
        tl.set(burst, {
          opacity: 0,
          scale: 0,
          display: 'block',
          background:
            'radial-gradient(circle, rgba(244,244,246,0.9) 0%, rgba(232,35,43,0.85) 28%, rgba(131,4,1,0) 70%)',
        })
        tl.to(overlay, { opacity: 1, duration: 0.25, ease: 'power2.in' }, 0) // P1 blackout
        tl.to(burst, { opacity: 1, scale: 1.6, duration: 0.5, ease: 'power2.out' }, 0.25) // P2 rays
        tl.to(burst, { opacity: 0, scale: 2.6, duration: 0.65, ease: 'power1.out' }, 0.6)
        tl.add(() => apply('obsidian'), 0.85) // P3 material swap at burst peak
        tl.to(overlay, { opacity: 0, duration: 0.65, ease: 'power2.out' }, 0.95) // P4 bg rises
        tl.set([overlay, burst], { display: 'none' }, 1.75) // P5
        tl.to({}, { duration: 0.05 }, 1.75)
        void scrollY
      } else {
        // O → A · ~0.9s (white flash → paper)
        const tl = gsap.timeline({ onComplete: unlock })
        tl.set(overlay, { background: '#FFFFFF', opacity: 0, display: 'block' })
        tl.to(overlay, { opacity: 1, duration: 0.15, ease: 'power2.in' }, 0)
        tl.add(() => apply('atelier'), 0.15)
        tl.to(overlay, { opacity: 0, duration: 0.45, ease: 'power2.out' }, 0.3)
        tl.set(overlay, { display: 'none' }, 0.85)
      }
    },
    [locked, transitionEnabled, apply],
  )

  return (
    <AppearanceContext.Provider value={{ appearance, request, locked, transitionEnabled }}>
      {children}
      <div
        ref={overlayRef}
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          opacity: 0,
          display: 'none',
          pointerEvents: 'none',
        }}
      />
      <div
        ref={burstRef}
        aria-hidden
        style={{
          position: 'fixed',
          top: '47%',
          left: '50%',
          width: '90vmax',
          height: '90vmax',
          marginLeft: '-45vmax',
          marginTop: '-45vmax',
          borderRadius: '50%',
          zIndex: 101,
          opacity: 0,
          display: 'none',
          pointerEvents: 'none',
          mixBlendMode: 'screen',
        }}
      />
    </AppearanceContext.Provider>
  )
}
