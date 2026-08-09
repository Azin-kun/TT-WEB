'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LogoEngine } from '@/lib/three/LogoEngine'
import { toHeroEffectsPayload } from '@/lib/three/shatter/resolveSeparation'
import type { SeparationConfig } from '@/lib/three/shatter/types'

/**
 * Dev-only tuning bench for the hold-to-separate effect.
 * Spec: docs/superpowers/specs/2026-08-08-hero-logo-shatter-design.md
 *
 * Uses the real LogoEngine, so what gets approved here is the shipping code
 * path — not a mock. Sliders write straight into the bench's mutable config
 * copy and remount the engine so the change takes effect.
 */

type Row = {
  key: Exclude<keyof SeparationConfig, 'ENABLED' | 'SHINE_WARM' | 'SHINE_BRIGHT'>
  label: string
  min: number
  max: number
  step: number
}

const ROWS: Row[] = [
  { key: 'CHARGE_MS', label: 'Charge time (ms)', min: 300, max: 4000, step: 50 },
  { key: 'REFORM_MS', label: 'Reform time (ms)', min: 100, max: 2500, step: 50 },
  { key: 'SEPARATE_START', label: 'Light-before-move', min: 0, max: 0.9, step: 0.05 },
  { key: 'STAGGER_MAX', label: 'Panel stagger', min: 0, max: 0.5, step: 0.02 },
  { key: 'SPREAD_FRAC', label: 'Drift distance', min: 0, max: 2, step: 0.05 },
  { key: 'SPREAD_VAR', label: 'Drift variation ±', min: 0, max: 0.9, step: 0.05 },
  { key: 'LATERAL_DRIFT', label: 'Sideways drift', min: 0, max: 1.5, step: 0.05 },
  { key: 'SPIN_MIN', label: 'Turn min (× PI)', min: 0, max: 1, step: 0.01 },
  { key: 'SPIN_MAX', label: 'Turn max (× PI)', min: 0, max: 1.5, step: 0.01 },
  { key: 'CAP_NORMAL_MIN', label: 'Face vs wall cutoff', min: 0.5, max: 0.99, step: 0.01 },
  { key: 'NORMAL_FOLLOW', label: 'Normal follow', min: 0, max: 1, step: 0.05 },
  { key: 'HATCH_STRENGTH', label: 'Pencil hatch', min: 0, max: 1, step: 0.05 },
  { key: 'HATCH_SCALE', label: 'Hatch coarseness', min: 0.5, max: 4, step: 0.1 },
  { key: 'SHINE_STRENGTH', label: 'Shine strength', min: 0, max: 1, step: 0.05 },
  { key: 'SHINE_WIDTH', label: 'Shine width', min: 0.05, max: 1, step: 0.05 },
  { key: 'SHINE_SPEED', label: 'Shine speed', min: 0, max: 3, step: 0.1 },
  { key: 'SHINE_CHARGE_BOOST', label: 'Shine flare on charge', min: 0, max: 4, step: 0.1 },
  { key: 'SKIN_OPACITY', label: 'Skin opacity', min: 0.05, max: 1, step: 0.05 },
  { key: 'BODY_OPACITY', label: 'Inner body opacity', min: 0, max: 1, step: 0.02 },
  { key: 'BODY_EDGE_OPACITY', label: 'Inner body edges', min: 0, max: 1, step: 0.05 },
  { key: 'BODY_EDGE_ANGLE', label: 'Edge angle (deg)', min: 1, max: 60, step: 1 },
  { key: 'VIBRATE_FRAC', label: 'Shake amount', min: 0, max: 0.05, step: 0.001 },
  { key: 'VIBRATE_PHASE_STEP', label: 'Shake speed', min: 0, max: 3, step: 0.05 },
]

const COLORS = [['SHINE_WARM', 'Shine warm'], ['SHINE_BRIGHT', 'Shine hot']] as const

export default function ShatterLab({ initial }: { initial: SeparationConfig }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // The bench owns a mutable copy; nothing global is mutated any more.
  const cfgRef = useRef<SeparationConfig>({ ...initial })
  const [, force] = useState(0)
  const [charge, setCharge] = useState(0)
  const [events, setEvents] = useState<string[]>([])
  const [status, setStatus] = useState('loading…')
  const [nonce, setNonce] = useState(0)
  const [saveState, setSaveState] = useState<string>('')

  const saveToCms = useCallback(async () => {
    setSaveState('saving…')
    try {
      const res = await fetch('/api/globals/hero-effects', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toHeroEffectsPayload(cfgRef.current)),
      })
      if (res.status === 401 || res.status === 403) {
        setSaveState('not signed in — log in at /admin first')
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setSaveState(`rejected: ${body?.errors?.[0]?.message ?? res.status}`)
        return
      }
      setSaveState('saved — homepage picks it up on next load')
    } catch (e) {
      setSaveState(`failed: ${String(e).slice(0, 80)}`)
    }
  }, [])

  const mount = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const engine = new LogoEngine(canvas, cfgRef.current)
    engine.setInteractive(true)

    let raf = 0
    engine
      .load()
      .then(() => {
        engine.setShatterArmed(true)
        // Dev-only handle for tuning and automated checks. This page is
        // notFound() in production, so it never reaches a shipped build.
        ;(window as unknown as { __ttShatter?: LogoEngine }).__ttShatter = engine
        setStatus('ready — press and hold on the logo')
        engine.onShatter((e) =>
          setEvents((prev) => [`${new Date().toLocaleTimeString()}  ${e}`, ...prev].slice(0, 8)),
        )
        const poll = () => {
          setCharge(engine.getCharge())
          raf = requestAnimationFrame(poll)
        }
        raf = requestAnimationFrame(poll)
      })
      .catch((err) => setStatus(`load failed: ${String(err)}`))

    const onResize = () => engine.resize()
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      delete (window as unknown as { __ttShatter?: LogoEngine }).__ttShatter
      // Safe to release the context: the canvas is discarded with the engine.
      engine.dispose(true)
    }
  }, [])

  useEffect(() => mount(), [mount, nonce])

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg, #F6F1E7)', position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {/* Keyed on nonce so every rebuild gets a FRESH canvas element — the
            engine releases its WebGL context on dispose, which permanently
            poisons the canvas it was using. */}
        <canvas
          key={nonce}
          ref={canvasRef}
          aria-label="Separation tuning bench"
          role="img"
          style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
        />
      </div>

      <aside
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          width: 290,
          padding: '14px 16px',
          background: 'rgba(246,241,231,0.93)',
          border: '1px solid rgba(43,42,39,0.25)',
          borderRadius: 4,
          font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
          color: '#2B2A27',
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
        }}
      >
        <strong style={{ display: 'block', marginBottom: 8 }}>SEPARATION — tuning bench</strong>
        <div style={{ marginBottom: 10, opacity: 0.75 }}>{status}</div>

        <div style={{ marginBottom: 10 }}>
          charge&nbsp;
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{charge.toFixed(3)}</span>
          <div style={{ height: 5, background: 'rgba(43,42,39,0.15)', marginTop: 4 }}>
            <div style={{ height: '100%', width: `${charge * 100}%`, background: '#8E1114' }} />
          </div>
        </div>

        {ROWS.map((r) => (
          <label key={r.key} style={{ display: 'block', marginBottom: 8 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{r.label}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{cfgRef.current[r.key]}</span>
            </span>
            <input
              type="range"
              min={r.min}
              max={r.max}
              step={r.step}
              defaultValue={cfgRef.current[r.key]}
              style={{ width: '100%' }}
              onChange={(e) => {
                cfgRef.current[r.key] = parseFloat(e.target.value)
                force((n) => n + 1)
                setNonce((n) => n + 1)
              }}
            />
          </label>
        ))}

        {COLORS.map(([key, label]) => (
          <label
            key={key}
            style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}
          >
            <span>{label}</span>
            <input
              type="color"
              defaultValue={`#${cfgRef.current[key].toString(16).padStart(6, '0')}`}
              onChange={(e) => {
                cfgRef.current[key] = parseInt(e.target.value.slice(1), 16)
                setNonce((n) => n + 1)
              }}
            />
          </label>
        ))}

        <button
          type="button"
          onClick={saveToCms}
          style={{
            width: '100%',
            marginTop: 4,
            padding: '6px 8px',
            cursor: 'pointer',
            border: '1px solid #8E1114',
            background: 'transparent',
            color: '#8E1114',
            font: 'inherit',
          }}
        >
          save to CMS
        </button>
        {saveState ? <div style={{ marginTop: 6, opacity: 0.8 }}>{saveState}</div> : null}

        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          style={{
            width: '100%',
            marginTop: 4,
            padding: '6px 8px',
            cursor: 'pointer',
            border: '1px solid rgba(43,42,39,0.4)',
            background: 'transparent',
            font: 'inherit',
          }}
        >
          rebuild
        </button>

        <div style={{ marginTop: 12, opacity: 0.75 }}>
          <strong>events</strong>
          {events.length === 0 ? (
            <div>— none yet —</div>
          ) : (
            events.map((e, i) => <div key={i}>{e}</div>)
          )}
        </div>
      </aside>
    </div>
  )
}
