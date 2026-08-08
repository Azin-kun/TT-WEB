'use client'

import { useEffect, useRef } from 'react'
import { LogoEngine } from '../../lib/three/LogoEngine'
import { DEFAULT_SEPARATION, type SeparationConfig } from '../../lib/three/shatter/types'

// Heavy client component — import it via next/dynamic(ssr:false) so three.js
// stays out of the base bundle (Global Constraint: three lazy).
export default function LogoCanvas({
  onReady,
  config = DEFAULT_SEPARATION,
  armed = false,
}: {
  onReady?: () => void
  config?: SeparationConfig
  armed?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<LogoEngine | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new LogoEngine(canvas, config)
    engineRef.current = engine

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    engine.setInteractive(!reduced)

    engine.load().then(() => onReady?.()).catch((err) => console.error('LogoEngine load failed', err))

    const onResize = () => engine.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      engine.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Armed only once the 3D mesh has taken over from the sketch-draw video, so a
  // press during the intro cannot trigger the separation.
  useEffect(() => {
    engineRef.current?.setShatterArmed(armed)
  }, [armed])

  return (
    <canvas
      ref={canvasRef}
      aria-label="Rotating TAMPA TARUNO logo"
      role="img"
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
    />
  )
}
