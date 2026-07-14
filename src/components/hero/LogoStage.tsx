'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { SketchIntro } from './SketchIntro'

// next/dynamic(ssr:false) keeps three.js out of the base bundle.
const LogoCanvas = dynamic(() => import('../three/LogoCanvas'), {
  ssr: false,
  loading: () => null,
})

/**
 * Composes the hero logo: the 3D canvas underneath, the sketch-draw video on
 * top. The video crossfades out (opacity in SketchIntro) once it ends; the
 * canvas fades in once its mesh is ready, so the handoff is seamless (spec §7).
 */
export function LogoStage({ onLive }: { onLive?: () => void }) {
  const [introDone, setIntroDone] = useState(false)
  const [canvasReady, setCanvasReady] = useState(false)

  // signal consumers (constellation entrance) once the 3D logo is truly on screen
  useEffect(() => {
    if (introDone && canvasReady) onLive?.()
  }, [introDone, canvasReady, onLive])

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: introDone && canvasReady ? 1 : introDone ? 0.001 : 0,
          transition: 'opacity 0.6s ease',
        }}
      >
        <LogoCanvas onReady={() => setCanvasReady(true)} />
      </div>
      <SketchIntro onDone={() => setIntroDone(true)} />
    </div>
  )
}
