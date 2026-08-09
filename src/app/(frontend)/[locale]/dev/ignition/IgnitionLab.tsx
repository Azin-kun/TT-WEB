'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LogoEngine } from '@/lib/three/LogoEngine'
import { toIgnitionPayload } from '@/lib/three/ignition/resolveIgnition'
import type { IgnitionConfig } from '@/lib/three/ignition/types'
import type { SeparationConfig } from '@/lib/three/shatter/types'

/**
 * Dev-only tuning bench for the electrical wireframe ignition.
 * Spec: docs/superpowers/specs/2026-08-09-hero-ignition-design.md
 *
 * Uses the real LogoEngine, so what gets approved here is the shipping code
 * path — not a mock. Ignition is one-shot, unlike the hold-triggered
 * separation, so every change remounts the engine and replays the sequence.
 */

type NumKey = {
  [K in keyof IgnitionConfig]: IgnitionConfig[K] extends number ? K : never
}[keyof IgnitionConfig]

type ColorKey = 'COLD_COLOR' | 'WARM_COLOR' | 'HOT_COLOR' | 'CREST_COLOR'
type BoolKey = 'ENABLED' | 'OVERLAY_ENABLED' | 'PULSE_ENABLED' | 'EMBER_ENABLED'

type Row = { key: Exclude<NumKey, ColorKey>; label: string; min: number; max: number; step: number }

// Ranges mirror the Payload min/max in src/globals/HeroEffects.ts exactly. A
// bench that can produce values the CMS rejects is worse than no bench.
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'timing',
    rows: [
      { key: 'IGNITION_MS', label: 'Total (ms)', min: 600, max: 4000, step: 50 },
      { key: 'SEED_END', label: 'Seed ends', min: 0, max: 0.5, step: 0.01 },
      { key: 'FRONT_END', label: 'Front ends', min: 0.2, max: 1, step: 0.01 },
      { key: 'CUE_FRAC', label: 'Words cue', min: 0.1, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'shape',
    rows: [
      { key: 'SEED_OFFSET_X', label: 'Seed X', min: -1, max: 1, step: 0.05 },
      { key: 'SEED_OFFSET_Y', label: 'Seed Y', min: -1, max: 1, step: 0.05 },
      { key: 'SEED_OFFSET_Z', label: 'Seed Z', min: -1, max: 1, step: 0.05 },
      { key: 'FRONT_SOFTNESS', label: 'Crest width', min: 0.02, max: 1, step: 0.01 },
      { key: 'WAKE_LAG', label: 'Wake lag', min: 0, max: 0.6, step: 0.01 },
      { key: 'CORE_RADIUS', label: 'Core radius', min: 0, max: 1, step: 0.01 },
      { key: 'CORE_STRENGTH', label: 'Core strength', min: 0, max: 2, step: 0.05 },
    ],
  },
  {
    title: 'overlay cage',
    rows: [
      { key: 'OVERLAY_LEAD_MS', label: 'Lead before end (ms)', min: 200, max: 4000, step: 50 },
      { key: 'SPHERE_SCALE', label: 'Sphere start × logo', min: 1, max: 3, step: 0.05 },
      { key: 'BLOOM_SCALE', label: 'Total bloomed × logo', min: 1, max: 3, step: 0.05 },
      { key: 'POLY_SIDES', label: 'Sides (8 = octagon)', min: 3, max: 16, step: 1 },
      { key: 'BLOOM_START', label: 'Bloom starts', min: 0, max: 1, step: 0.01 },
      { key: 'BLOOM_END', label: 'Bloom ends', min: 0, max: 1, step: 0.01 },
      { key: 'MORPH_START', label: 'Morph starts', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'cage',
    rows: [
      { key: 'CAGE_DENSITY', label: 'Density', min: 0.05, max: 1, step: 0.01 },
      { key: 'CAGE_DENSITY_MOBILE', label: 'Density (mobile)', min: 0.05, max: 1, step: 0.01 },
      { key: 'CAGE_OPACITY', label: 'Opacity', min: 0, max: 1, step: 0.02 },
      { key: 'CAGE_SEED', label: 'Seed', min: 0, max: 9999, step: 1 },
    ],
  },
  {
    title: 'wires & sparks',
    rows: [
      { key: 'WIRE_JITTER', label: 'Writhe amount', min: 0, max: 0.3, step: 0.005 },
      { key: 'WIRE_SPEED', label: 'Writhe speed', min: 0, max: 6, step: 0.05 },
      { key: 'SPARK_STAGGER', label: 'Front raggedness', min: 0, max: 0.5, step: 0.005 },
      { key: 'SPARK_RATE', label: 'Spark rate', min: 0, max: 10, step: 0.1 },
      { key: 'SPARK_DENSITY', label: 'Sparks lit at once', min: 0, max: 0.9, step: 0.01 },
      { key: 'SPARK_IDLE', label: 'Spark while cold', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'embers',
    rows: [
      { key: 'EMBER_DENSITY', label: 'Density', min: 0, max: 1, step: 0.01 },
      { key: 'EMBER_SIZE', label: 'Size (px)', min: 0.5, max: 20, step: 0.5 },
      { key: 'EMBER_TWINKLE', label: 'Twinkle', min: 0, max: 12, step: 0.1 },
      { key: 'EMBER_OPACITY', label: 'Opacity', min: 0, max: 1, step: 0.02 },
    ],
  },
  {
    title: 'colour & pulses',
    rows: [
      { key: 'DARK_MASS_OPACITY', label: 'Dark mass', min: 0, max: 0.6, step: 0.01 },
      { key: 'GLOW_DECAY', label: 'Glow decay', min: 0.2, max: 8, step: 0.1 },
      { key: 'PULSE_MS', label: 'Pulse (ms)', min: 200, max: 3000, step: 50 },
    ],
  },
]

const COLORS: [ColorKey, string][] = [
  ['COLD_COLOR', 'Cold cage'],
  ['WARM_COLOR', 'Warm'],
  ['HOT_COLOR', 'Hot'],
  ['CREST_COLOR', 'Crest'],
]

const BOOLS: [BoolKey, string][] = [
  ['ENABLED', 'Ignition'],
  ['OVERLAY_ENABLED', 'Overlay cage'],
  ['PULSE_ENABLED', 'Hold pulses'],
  ['EMBER_ENABLED', 'Ember dots'],
]

const hex = (v: number) => `#${v.toString(16).padStart(6, '0')}`

export default function IgnitionLab({
  initial,
  separation,
}: {
  initial: IgnitionConfig
  separation: SeparationConfig
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cfgRef = useRef<IgnitionConfig>({ ...initial })
  const engineRef = useRef<LogoEngine | null>(null)
  const [, force] = useState(0)
  const [nonce, setNonce] = useState(0)
  const [withOverlay, setWithOverlay] = useState(true)
  const [status, setStatus] = useState('loading…')
  const [events, setEvents] = useState<string[]>([])
  const [saveState, setSaveState] = useState('')

  const saveToCms = useCallback(async () => {
    setSaveState('saving…')
    try {
      // Only the ignition slice is sent. Verified 2026-08-09 that Payload MERGES
      // partial global updates, so this cannot wipe the separation groups.
      const res = await fetch('/api/globals/hero-effects', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toIgnitionPayload(cfgRef.current)),
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
    const cfg = cfgRef.current
    const engine = new LogoEngine(canvas, separation, cfg)
    engineRef.current = engine
    engine.setInteractive(true)
    setEvents([])

    let bridgeTimer: ReturnType<typeof setTimeout> | undefined
    engine.onIgnition((e) =>
      setEvents((prev) => [`${new Date().toLocaleTimeString()}  ${e}`, ...prev].slice(0, 8)),
    )

    engine
      .load()
      .then(() => {
        ;(window as unknown as { __ttIgnition?: LogoEngine }).__ttIgnition = engine
        if (withOverlay && cfg.OVERLAY_ENABLED) {
          setStatus('overlay running — sphere → bloom → morph → charge')
          engine.startOverlay()
          // Stands in for the video's own end, which is what triggers this on
          // the real hero.
          bridgeTimer = setTimeout(() => engine.startIgnition(), cfg.OVERLAY_LEAD_MS)
        } else {
          setStatus('bridge only — no overlay')
          engine.startIgnition()
        }
      })
      .catch((err) => setStatus(`load failed: ${String(err)}`))

    const onResize = () => engine.resize()
    window.addEventListener('resize', onResize)
    return () => {
      if (bridgeTimer) clearTimeout(bridgeTimer)
      window.removeEventListener('resize', onResize)
      delete (window as unknown as { __ttIgnition?: LogoEngine }).__ttIgnition
      // Safe to release the context: the canvas this engine used is being
      // discarded with it (see the key on <canvas>). Without releasing, each
      // rebuild leaks a context and the browser's ~16 limit is hit in seconds.
      engine.dispose(true)
      engineRef.current = null
    }
  }, [separation, withOverlay])

  useEffect(() => mount(), [mount, nonce])

  const replay = () => setNonce((n) => n + 1)

  // Dragging a slider fires onChange per pixel of travel. Remounting on each of
  // those builds a WebGL context per tick, and browsers cap live contexts at
  // ~16 — which is how this bench originally exhausted them in seconds. The
  // engine now releases its context properly, but coalescing the rebuilds is
  // still the difference between a usable bench and a slideshow.
  const replayTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const replaySoon = useCallback(() => {
    if (replayTimer.current) clearTimeout(replayTimer.current)
    replayTimer.current = setTimeout(() => setNonce((n) => n + 1), 220)
  }, [])
  useEffect(() => () => clearTimeout(replayTimer.current), [])

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg, #F6F1E7)', position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {/* Keyed on nonce so every rebuild gets a FRESH canvas element. The old
            engine releases its WebGL context on dispose, which permanently
            poisons the canvas it was using — reusing one element would mean the
            second rebuild could never create a context again. */}
        <canvas
          key={nonce}
          ref={canvasRef}
          aria-label="Ignition tuning bench"
          role="img"
          style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
        />
      </div>

      <aside
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          width: 300,
          padding: '14px 16px',
          background: 'rgba(246,241,231,0.94)',
          border: '1px solid rgba(43,42,39,0.25)',
          borderRadius: 4,
          font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
          color: '#2B2A27',
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
        }}
      >
        <strong style={{ display: 'block', marginBottom: 8 }}>IGNITION — tuning bench</strong>
        <div style={{ marginBottom: 10, opacity: 0.75 }}>{status}</div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button type="button" onClick={replay} style={btn('#8E1114')}>
            replay
          </button>
          <button
            type="button"
            onClick={() => engineRef.current?.pulseIgnition()}
            style={btn('rgba(43,42,39,0.5)')}
          >
            fire pulse
          </button>
        </div>

        <label style={{ display: 'flex', gap: 6, marginBottom: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={withOverlay}
            onChange={(e) => setWithOverlay(e.target.checked)}
          />
          <span>replay with overlay</span>
        </label>

        {BOOLS.map(([key, label]) => (
          <label key={key} style={{ display: 'flex', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              defaultChecked={cfgRef.current[key]}
              onChange={(e) => {
                cfgRef.current[key] = e.target.checked
                force((n) => n + 1)
                replay()
              }}
            />
            <span>{label}</span>
          </label>
        ))}

        {GROUPS.map((g) => (
          <div key={g.title} style={{ marginTop: 12 }}>
            <div style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {g.title}
            </div>
            {g.rows.map((r) => (
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
                    replaySoon()
                  }}
                />
              </label>
            ))}
          </div>
        ))}

        <div style={{ marginTop: 12 }}>
          <div style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            colours
          </div>
          {COLORS.map(([key, label]) => (
            <label
              key={key}
              style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}
            >
              <span>{label}</span>
              <input
                type="color"
                defaultValue={hex(cfgRef.current[key])}
                onChange={(e) => {
                  cfgRef.current[key] = parseInt(e.target.value.slice(1), 16)
                  replaySoon()
                }}
              />
            </label>
          ))}
        </div>

        <button type="button" onClick={saveToCms} style={{ ...btn('#8E1114'), marginTop: 10 }}>
          save to CMS
        </button>
        {saveState ? <div style={{ marginTop: 6, opacity: 0.8 }}>{saveState}</div> : null}

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

function btn(colour: string): React.CSSProperties {
  return {
    flex: 1,
    padding: '6px 8px',
    cursor: 'pointer',
    border: `1px solid ${colour}`,
    background: 'transparent',
    color: colour,
    font: 'inherit',
  }
}
