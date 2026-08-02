'use client'

import { useEffect, useRef } from 'react'
import { LogoEngine } from '../../lib/three/LogoEngine'

// Heavy client component — import it via next/dynamic(ssr:false) so three.js
// stays out of the base bundle (Global Constraint: three lazy).
export default function LogoCanvas({
  onReady,
  entrance,
}: {
  onReady?: () => void
  /** Flips true when the sketch intro finishes — runs the extrude-from-flat entrance. */
  entrance?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<LogoEngine | null>(null)
  // The intro can finish before the GLB has loaded, so the request is latched
  // here and applied on whichever happens second.
  const entranceRef = useRef(false)

  useEffect(() => {
    if (!entrance) return
    entranceRef.current = true
    engineRef.current?.startEntrance()
  }, [entrance])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new LogoEngine(canvas)
    engineRef.current = engine

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    engine.setInteractive(!reduced)

    engine
      .load()
      .then(() => {
        if (entranceRef.current) engine.startEntrance()
        onReady?.()
      })
      .catch((err) => console.error('LogoEngine load failed', err))

    const onResize = () => engine.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      engine.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-label="Rotating TAMPA TARUNO logo"
      role="img"
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
    />
  )
}
