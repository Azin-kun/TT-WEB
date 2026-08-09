'use client'

import { useEffect, useRef } from 'react'
import { LogoEngine } from '../../lib/three/LogoEngine'
import { DEFAULT_SEPARATION, type SeparationConfig } from '../../lib/three/shatter/types'
import { DEFAULT_IGNITION, type IgnitionConfig } from '../../lib/three/ignition/types'

// Heavy client component — import it via next/dynamic(ssr:false) so three.js
// stays out of the base bundle (Global Constraint: three lazy).
export default function LogoCanvas({
  onReady,
  config = DEFAULT_SEPARATION,
  ignition = DEFAULT_IGNITION,
  armed = false,
  ignite = false,
  onIgnitionCue,
  onIgnitionDone,
}: {
  onReady?: () => void
  config?: SeparationConfig
  ignition?: IgnitionConfig
  armed?: boolean
  ignite?: boolean
  onIgnitionCue?: () => void
  onIgnitionDone?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<LogoEngine | null>(null)

  // The engine is created once, in a mount-only effect, so the subscription it
  // makes would otherwise capture whatever callback identities existed on the
  // first render. Reading through refs keeps it pointed at the current ones.
  const cueRef = useRef(onIgnitionCue)
  const doneRef = useRef(onIgnitionDone)
  cueRef.current = onIgnitionCue
  doneRef.current = onIgnitionDone

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new LogoEngine(canvas, config, ignition)
    engineRef.current = engine

    const offIgnition = engine.onIgnition((e) => {
      if (e === 'cue') cueRef.current?.()
      else if (e === 'done') doneRef.current?.()
    })

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    engine.setInteractive(!reduced)

    engine
      .load()
      .then(() => onReady?.())
      .catch((err) => {
        console.error('LogoEngine load failed', err)
        // No mesh means no ignition controller will ever exist. `armed` and the
        // floating-words entrance both hang off `done`, so force the sequence
        // rather than leave the hero inert behind a transition that never ends.
        engine.finishIgnitionNow()
      })

    // Reduced motion skips the whole interactive path inside load(), so no
    // controller is built there either — same reasoning as above.
    if (reduced) engine.finishIgnitionNow()

    const onResize = () => engine.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      offIgnition()
      engine.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Starts once the 3D mesh has taken over from the sketch-draw video. Safe to
  // call before load() resolves — the engine records the intent.
  useEffect(() => {
    if (ignite) engineRef.current?.startIgnition()
  }, [ignite])

  // Armed only once the ignition has finished, so a press mid-transition cannot
  // trigger the separation.
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
