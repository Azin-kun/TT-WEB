'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import { SketchIntro } from './SketchIntro'
import type { SeparationConfig } from '../../lib/three/shatter/types'
import type { IgnitionConfig } from '../../lib/three/ignition/types'

// next/dynamic(ssr:false) keeps three.js out of the base bundle.
const LogoCanvas = dynamic(() => import('../three/LogoCanvas'), {
  ssr: false,
  loading: () => null,
})

// If the 3D canvas never reports ready (WebGL init failure, slow GPU, etc.)
// don't leave the hero permanently blank — force the handoff through anyway.
const CANVAS_READY_FALLBACK_MS = 4000

/**
 * Composes the hero logo: the 3D canvas underneath, the sketch-draw video on
 * top. The video fades out once it ends and the canvas fades in, but the real
 * bridge between them is the electrical wireframe ignition (spec §3.1) — the
 * video's last frame and the cold cage are both dark lines on warm paper, so
 * there is no cut to hide.
 *
 * Signal order (spec §4.4):
 *   introDone && canvasReady -> canvas visible, startIgnition()
 *   ignition 'cue'           -> onLive fires, floating words enter
 *   ignition 'done'          -> separation arms
 */
export function LogoStage({
  onLive,
  onIntroPlayStart,
  separation,
  ignition,
}: {
  onLive?: () => void
  onIntroPlayStart?: () => void
  separation: SeparationConfig
  ignition: IgnitionConfig
}) {
  const [introDone, setIntroDone] = useState(false)
  const [canvasReady, setCanvasReady] = useState(false)
  const [ignited, setIgnited] = useState(false)
  const live = introDone && canvasReady

  // The words enter at the ignition's cue rather than when the canvas appears:
  // the cue lands just as the charge front finishes, so the energy disperses
  // INTO them instead of the two events merely coinciding.
  const onCue = useCallback(() => onLive?.(), [onLive])
  const onDone = useCallback(() => setIgnited(true), [])

  useEffect(() => {
    if (!introDone || canvasReady) return
    const t = setTimeout(() => {
      console.error('LogoStage: 3D canvas never reported ready — forcing handoff')
      setCanvasReady(true)
    }, CANVAS_READY_FALLBACK_MS)
    return () => clearTimeout(t)
  }, [introDone, canvasReady])

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: live ? 1 : introDone ? 0.001 : 0,
          transition: 'opacity 0.6s ease',
        }}
      >
        <LogoCanvas
          onReady={() => setCanvasReady(true)}
          config={separation}
          ignition={ignition}
          armed={ignited}
          ignite={live}
          onIgnitionCue={onCue}
          onIgnitionDone={onDone}
        />
      </div>
      <SketchIntro onDone={() => setIntroDone(true)} onPlayStart={onIntroPlayStart} />
    </div>
  )
}
