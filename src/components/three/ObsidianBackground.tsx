'use client'

import { useEffect, useRef, useState } from 'react'
import { ObsidianBG } from '../../lib/three/ObsidianBG'
import { useAppearance } from '../providers/AppearanceProvider'

// Fixed full-screen living background, active only in Obsidian. Reduced-motion
// or an FPS-degrade falls back to the static poster (spec §9).
export function ObsidianBackground() {
  const { appearance } = useAppearance()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [reduced, setReduced] = useState(false)
  const [degraded, setDegraded] = useState(false)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  useEffect(() => {
    if (appearance !== 'obsidian' || reduced || degraded) return
    const canvas = canvasRef.current
    if (!canvas) return
    let bg: ObsidianBG | null = null
    try {
      bg = new ObsidianBG(canvas, { onDegrade: () => setDegraded(true) })
    } catch {
      setDegraded(true)
      return
    }
    const onResize = () => bg?.resize()
    const onScroll = () => bg?.setScroll(window.scrollY < window.innerHeight * 0.5 ? 1.0 : 0.45)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll)
      bg?.dispose()
    }
  }, [appearance, reduced, degraded])

  const usePoster = reduced || degraded
  const visible = appearance === 'obsidian'

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s ease',
        pointerEvents: 'none',
      }}
    >
      {usePoster ? (
        visible ? (
          <img
            src="/media/obsidian-poster.webp"
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : null
      ) : (
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      )}
    </div>
  )
}
