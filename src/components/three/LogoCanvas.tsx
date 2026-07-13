'use client'

import { useEffect, useRef } from 'react'
import { LogoEngine } from '../../lib/three/LogoEngine'
import { useAppearance } from '../providers/AppearanceProvider'
import { useLogoApiRef } from '../providers/LogoApi'

// Heavy client component — import it via next/dynamic(ssr:false) so three.js
// stays out of the base bundle (Global Constraint: three lazy).
export default function LogoCanvas({ onReady }: { onReady?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<LogoEngine | null>(null)
  const { appearance } = useAppearance()
  const apiRef = useLogoApiRef()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new LogoEngine(canvas)
    engineRef.current = engine

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    engine.setInteractive(!reduced)

    engine
      .load(document.documentElement.dataset.appearance === 'obsidian' ? 'obsidian' : 'atelier')
      .then(() => onReady?.())
      .catch((err) => console.error('LogoEngine load failed', err))

    apiRef.current = {
      setMaterialMode: (mode) => engine.setMaterialMode(mode),
      getMesh: () => engine.getMesh(),
    }

    const onResize = () => engine.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      apiRef.current = null
      engine.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // keep material in sync when appearance flips (Phase-4 transition also drives this)
  useEffect(() => {
    engineRef.current?.setMaterialMode(appearance)
  }, [appearance])

  return (
    <canvas
      ref={canvasRef}
      aria-label="Rotating TAMPA TARUNO logo"
      role="img"
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
    />
  )
}
