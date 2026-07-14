'use client'

import { useEffect, useRef, useState } from 'react'
import { CALIB } from '../../lib/three/calibration'

/**
 * "Margin notes" constellation (spec: _PLAN/SYNAPSER-STYLE-WEBSITE-PLAN.md §10):
 * CMS-fed words drift around the hero, each tethered to the 3D logo by a
 * graphite string drawn on a canvas. Words bounce off the viewport, the logo
 * box (plucking the string — it flashes red-pencil), and the headline/header.
 * Hovering a word freezes it and re-wires nearby strings to it; leaving
 * scatters. Hovering the logo zone gathers everything; leaving bursts it
 * outward in a spiral. Idle auto-pulse demos the effect until the visitor's
 * first interaction. Everything runs in ONE rAF loop writing styles
 * imperatively — React renders once.
 */

const LOGO_ASPECT = 1532 / 1427 // from _ASSETS/logo/logo-bbox.json
const LOGO_PAD = 8 // tight — strings should read as touching the logo, not orbiting a phantom margin

// Reference-site physics constants (plan §10.3–10.4)
const ATTRACT_R = 380
const REPEL_R = 95
const SEP_R = 58
const GATHER_SEP_R = 75
const FLASH_MS = 240
const LEAVE_DEBOUNCE_MS = 70
const PULSE_FIRST_MS = 2000
const PULSE_EVERY_MS = 6500
const PULSE_HOLD_MS = 1500
const ENTRANCE_STAGGER_MS = 1500
const ENTRANCE_DUR_MS = 2000
const MOBILE_MAX_WORDS = 8

type WordState = {
  el: HTMLDivElement
  x: number
  y: number
  vx: number
  vy: number
  delay: number // entrance stagger offset (ms)
  alpha: number // entrance/scroll-driven 0..1
  flashUntil: number
  centerLine: number // eased alpha of the logo string (re-wiring)
  hw: number // half word width
  hh: number
  visible: boolean
}

type Rect = { cx: number; cy: number; hw: number; hh: number; isLogo?: boolean }

const seeded = (i: number) => {
  // deterministic pseudo-random per index (reduced-motion + stagger)
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function ConstellationField({
  words,
  enabled,
  active,
}: {
  words: string[]
  enabled: boolean
  active: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wordRefs = useRef<(HTMLDivElement | null)[]>([])
  const activeRef = useRef(active)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    if (!enabled || words.length === 0) return
    const root = rootRef.current
    const canvas = canvasRef.current
    const section = root?.parentElement
    if (!root || !canvas || !section) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0
    let H = 0
    let logoRect: Rect = { cx: 0, cy: 0, hw: 0, hh: 0, isLogo: true }
    let avoidRects: Rect[] = []
    let mobile = false

    const states: WordState[] = wordRefs.current
      .filter((el): el is HTMLDivElement => !!el)
      .map((el, i) => ({
        el,
        x: 0,
        y: 0,
        vx: (seeded(i * 2 + 1) - 0.5) * 0.5,
        vy: (seeded(i * 2 + 2) - 0.5) * 0.5,
        delay: seeded(i * 3 + 7) * ENTRANCE_STAGGER_MS,
        alpha: 0,
        flashUntil: 0,
        centerLine: 1,
        hw: 40,
        hh: 12,
        visible: true,
      }))
    if (states.length === 0) return

    const insideRect = (x: number, y: number, r: Rect, pad = 0) =>
      Math.abs(x - r.cx) < r.hw + pad && Math.abs(y - r.cy) < r.hh + pad

    const measure = () => {
      W = section.clientWidth
      H = section.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      mobile = window.innerWidth < 640
      // mirror LogoEngine's mobile-vs-desktop scale so the string-anchor box
      // matches the 3D logo's ACTUAL rendered size, not the desktop one
      const heightFrac = mobile ? CALIB.MOBILE_HEIGHT_FRAC : CALIB.HEIGHT_FRAC
      const lh = heightFrac * H
      logoRect = {
        cx: CALIB.CENTER_X * W,
        cy: CALIB.CENTER_Y * H,
        hw: (lh * LOGO_ASPECT) / 2 + LOGO_PAD,
        hh: lh / 2 + LOGO_PAD,
        isLogo: true,
      }

      const sec = section.getBoundingClientRect()
      avoidRects = []
      section.querySelectorAll('[data-constellation-avoid]').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return
        avoidRects.push({
          cx: r.left - sec.left + r.width / 2,
          cy: r.top - sec.top + r.height / 2,
          hw: r.width / 2 + 8,
          hh: r.height / 2 + 8,
        })
      })
      const header = document.querySelector('header')
      if (header) {
        const r = header.getBoundingClientRect()
        avoidRects.push({ cx: W / 2, cy: (r.height - sec.top) / 2, hw: W / 2, hh: Math.max(r.bottom - sec.top, 0) / 2 + 8 })
      }

      const maxWords = mobile ? MOBILE_MAX_WORDS : states.length
      states.forEach((s, i) => {
        s.visible = i < maxWords
        s.el.style.display = s.visible ? '' : 'none'
        if (s.visible) {
          const r = s.el.getBoundingClientRect()
          s.hw = r.width / 2 || 40
          s.hh = r.height / 2 || 12
        }
      })
    }

    const place = () => {
      // initial scatter avoiding the logo + copy rects (deterministic-ish);
      // also enforce a minimum radial clearance from the logo so every
      // word's tether string reads as a visible line, not a stub touching
      // the logo's edge (the logo box itself can dominate a big chunk of
      // the hero — HEIGHT_FRAC 0.453 — so plain rect-avoidance alone still
      // let some words land right at its boundary).
      const minRadius = Math.max(logoRect.hw, logoRect.hh) * 1.35
      states.forEach((s, i) => {
        let x = 0
        let y = 0
        let best = { x: 0, y: 0, score: -Infinity }
        for (let attempt = 0; attempt < 24; attempt++) {
          x = (0.06 + 0.88 * seeded(i * 5 + attempt * 13 + 1)) * W
          y = (0.08 + 0.84 * seeded(i * 5 + attempt * 13 + 2)) * H
          const bad =
            insideRect(x, y, logoRect, 20) || avoidRects.some((r) => insideRect(x, y, r, 12))
          const dist = Math.sqrt((x - logoRect.cx) ** 2 + (y - logoRect.cy) ** 2)
          if (!bad && dist >= minRadius) break
          if (!bad && dist > best.score) best = { x, y, score: dist }
        }
        const dist = Math.sqrt((x - logoRect.cx) ** 2 + (y - logoRect.cy) ** 2)
        const useBest = dist < minRadius && best.score > -Infinity
        s.x = useBest ? best.x : x
        s.y = useBest ? best.y : y
      })
    }

    measure()
    place()

    // ---------- interaction state ----------
    let hover: number | 'logo' | null = null
    let autoPulse = false
    let userInteracted = false
    let leaveTimer: ReturnType<typeof setTimeout> | null = null
    let entranceStart: number | null = null
    let nextPulseAt = Infinity
    let pulseEndAt = 0
    let inLogoZone = false
    let raf = 0

    const scatterFrom = (idx: number) => {
      const from = states[idx]
      if (!from) return
      states.forEach((s) => {
        const dx = s.x - from.x
        const dy = s.y - from.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        s.vx += (dx / d) * 2.2
        s.vy += (dy / d) * 2.2
      })
      const a = Math.random() * Math.PI * 2
      const sp = 1.2 + 0.5 * Math.random()
      from.vx = Math.cos(a) * sp
      from.vy = Math.sin(a) * sp
    }

    const spiralBurst = () => {
      states.forEach((s) => {
        const dx = s.x - logoRect.cx
        const dy = s.y - logoRect.cy
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const rot = (Math.random() - 0.5) * 1.5
        const cos = Math.cos(rot)
        const sin = Math.sin(rot)
        const m = 7 * (0.8 + 0.8 * Math.random())
        s.vx += ((dx / d) * cos - (dy / d) * sin) * m
        s.vy += ((dx / d) * sin + (dy / d) * cos) * m
      })
    }

    const onWordEnter = (idx: number) => {
      userInteracted = true
      autoPulse = false
      if (states[idx].alpha < 0.95) return
      if (leaveTimer) {
        clearTimeout(leaveTimer)
        leaveTimer = null
      }
      hover = idx
    }

    const onWordLeave = (idx: number) => {
      if (hover !== idx) return
      if (leaveTimer) clearTimeout(leaveTimer)
      leaveTimer = setTimeout(() => {
        if (hover === idx) {
          hover = null
          scatterFrom(idx)
        }
        leaveTimer = null
      }, LEAVE_DEBOUNCE_MS)
    }

    const onPointerMove = (e: PointerEvent) => {
      const sec = section.getBoundingClientRect()
      const x = e.clientX - sec.left
      const y = e.clientY - sec.top
      const inZone = insideRect(x, y, logoRect, -LOGO_PAD)
      if (inZone && !inLogoZone && (hover === null || hover === 'logo')) {
        userInteracted = true
        autoPulse = false
        if (leaveTimer) {
          clearTimeout(leaveTimer)
          leaveTimer = null
        }
        hover = 'logo'
      } else if (!inZone && inLogoZone && hover === 'logo') {
        if (leaveTimer) clearTimeout(leaveTimer)
        leaveTimer = setTimeout(() => {
          if (hover === 'logo') {
            hover = null
            spiralBurst()
          }
          leaveTimer = null
        }, LEAVE_DEBOUNCE_MS)
      }
      inLogoZone = inZone
    }

    states.forEach((s, i) => {
      s.el.onmouseenter = () => onWordEnter(i)
      s.el.onmouseleave = () => onWordLeave(i)
      s.el.ontouchstart = () => onWordEnter(i)
    })

    // ---------- string drawing ----------
    const boxExitFrac = (dx: number, dy: number, hw: number, hh: number) =>
      Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6))

    const drawString = (
      x1: number,
      y1: number,
      r1: { hw: number; hh: number },
      x2: number,
      y2: number,
      r2: { hw: number; hh: number },
      alpha: number,
      progress: number,
      flash: number,
    ) => {
      if (alpha < 0.02 || progress < 0.01) return
      const dx = x2 - x1
      const dy = y2 - y1
      const t1 = Math.min(boxExitFrac(dx, dy, r1.hw, r1.hh), 1)
      const t2 = Math.min(boxExitFrac(dx, dy, r2.hw, r2.hh), 1)
      if (t1 + t2 >= 1) return // boxes overlap — no visible string
      const sx = x1 + dx * t1
      const sy = y1 + dy * t1
      const ex = x2 - dx * t2
      const ey = y2 - dy * t2
      if ((ex - sx) ** 2 + (ey - sy) ** 2 < 100) return
      if (flash > 0) {
        // pluck: graphite → red-pencil (--accent #8E1114), thicker
        ctx.strokeStyle = `rgba(142, 17, 20, ${(0.7 + 0.3 * flash) * alpha})`
        ctx.lineWidth = 0.5 + 0.7 * flash
      } else {
        ctx.strokeStyle = `rgba(43, 42, 39, ${0.5 * alpha})`
        ctx.lineWidth = 0.5
      }
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx + (ex - sx) * progress, sy + (ey - sy) * progress)
      ctx.stroke()
    }

    // ---------- static mode (reduced motion): draw once, no loop ----------
    const drawStatic = () => {
      ctx.clearRect(0, 0, W, H)
      states.forEach((s) => {
        if (!s.visible) return
        s.el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) translate(-50%, -50%)`
        s.el.style.opacity = '0.85'
        drawString(logoRect.cx, logoRect.cy, logoRect, s.x, s.y, s, 1, 1, 0)
      })
    }

    if (reduced) {
      drawStatic()
      const onResize = () => {
        measure()
        place()
        drawStatic()
      }
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
    }

    // ---------- live mode ----------
    const tick = () => {
      const now = performance.now()

      // entrance begins when the sketch-intro → 3D handoff completes
      if (entranceStart === null && activeRef.current) {
        entranceStart = now
        nextPulseAt = now + ENTRANCE_STAGGER_MS + ENTRANCE_DUR_MS + PULSE_FIRST_MS
      }

      // scroll dissolve over the first 60% of the viewport (no pin)
      const fade = 1 - clamp01(window.scrollY / (H * 0.6))

      // idle auto-pulse
      if (!userInteracted && entranceStart !== null) {
        if (!autoPulse && hover === null && now >= nextPulseAt) {
          const candidates = states.filter((s) => s.visible && s.alpha >= 0.95)
          if (candidates.length > 0) {
            const pick = states.indexOf(candidates[Math.floor(Math.random() * candidates.length)])
            hover = pick
            autoPulse = true
            pulseEndAt = now + PULSE_HOLD_MS
          } else {
            nextPulseAt = now + 1500
          }
        } else if (autoPulse && typeof hover === 'number' && now >= pulseEndAt) {
          const idx = hover
          hover = null
          autoPulse = false
          nextPulseAt = now + PULSE_EVERY_MS
          scatterFrom(idx)
        }
      }

      ctx.clearRect(0, 0, W, H)
      const hoveredWord = typeof hover === 'number' ? states[hover] : null

      states.forEach((s, i) => {
        if (!s.visible) return

        // entrance alpha (staggered)
        if (entranceStart !== null) {
          s.alpha = clamp01((now - entranceStart - s.delay) / ENTRANCE_DUR_MS)
        }

        const isHovered = hover === i
        let { x, y, vx, vy } = s

        if (isHovered) {
          vx *= 0.55
          vy *= 0.55
        } else if (hoveredWord) {
          // cluster toward the hovered word
          const dx = hoveredWord.x - x
          const dy = hoveredWord.y - y
          const d = Math.sqrt(dx * dx + dy * dy) || 1
          if (d < ATTRACT_R) {
            if (d > REPEL_R) {
              const f = 0.022 * Math.min(1, (ATTRACT_R - d) / 200)
              vx += (dx / d) * f
              vy += (dy / d) * f
            } else {
              const f = 0.05 * (1 - d / REPEL_R)
              vx -= (dx / d) * f
              vy -= (dy / d) * f
            }
          }
          states.forEach((o, oi) => {
            if (oi === i || oi === hover || !o.visible) return
            const rx = x - o.x
            const ry = y - o.y
            const q = rx * rx + ry * ry
            if (q < SEP_R * SEP_R && q > 1) {
              const d2 = Math.sqrt(q)
              const f = 0.05 * (1 - d2 / SEP_R)
              vx += (rx / d2) * f
              vy += (ry / d2) * f
            }
          })
        } else if (hover === 'logo') {
          // gather around the logo
          const dx = logoRect.cx - x
          const dy = logoRect.cy - y
          const d = Math.sqrt(dx * dx + dy * dy) || 1
          vx += (dx / d) * 0.04
          vy += (dy / d) * 0.04
          states.forEach((o, oi) => {
            if (oi === i || !o.visible) return
            const rx = x - o.x
            const ry = y - o.y
            const q = rx * rx + ry * ry
            if (q < GATHER_SEP_R * GATHER_SEP_R && q > 1) {
              const d2 = Math.sqrt(q)
              const f = 0.08 * (1 - d2 / GATHER_SEP_R)
              vx += (rx / d2) * f
              vy += (ry / d2) * f
            }
          })
        }

        // damping above cruise speed
        if (Math.abs(vx) > 0.3) vx *= 0.98
        if (Math.abs(vy) > 0.3) vy *= 0.98
        x += vx
        y += vy

        // bounce off logo + copy/header rects (logo bounces pluck the string)
        for (const r of [logoRect, ...avoidRects]) {
          const px = r.hw + s.hw
          const py = r.hh + s.hh
          const dx = x - r.cx
          const dy = y - r.cy
          if (Math.abs(dx) < px && Math.abs(dy) < py) {
            const ox = px - Math.abs(dx)
            const oy = py - Math.abs(dy)
            if (ox < oy) {
              x += dx > 0 ? ox : -ox
              vx = dx > 0 ? Math.abs(vx) : -Math.abs(vx)
            } else {
              y += dy > 0 ? oy : -oy
              vy = dy > 0 ? Math.abs(vy) : -Math.abs(vy)
            }
            if (r.isLogo && now > s.flashUntil + 120) s.flashUntil = now + FLASH_MS
          }
        }

        // viewport walls
        {
          const minX = s.hw + 20
          const maxX = W - s.hw - 20
          const minY = s.hh + 20
          const maxY = H - s.hh - 20
          if (minX <= maxX) {
            if (x <= minX) {
              x = minX
              vx = Math.max(Math.abs(vx), 0.2)
            } else if (x >= maxX) {
              x = maxX
              vx = -Math.max(Math.abs(vx), 0.2)
            }
          }
          if (minY <= maxY) {
            if (y <= minY) {
              y = minY
              vy = Math.max(Math.abs(vy), 0.2)
            } else if (y >= maxY) {
              y = maxY
              vy = -Math.max(Math.abs(vy), 0.2)
            }
          }
        }

        s.x = x
        s.y = y
        s.vx = vx
        s.vy = vy

        // render (hovered word trembles)
        let rx = x
        let ry = y
        if (isHovered) {
          rx += (Math.random() - 0.5) * 1.6
          ry += (Math.random() - 0.5) * 1.6
        }
        const opacity = s.alpha * fade
        s.el.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%)`
        s.el.style.opacity = String(opacity * 0.85)

        // logo string, fading out near a hovered word (re-wiring)
        let target = 1
        if (hoveredWord && !isHovered) {
          const dx = x - hoveredWord.x
          const dy = y - hoveredWord.y
          const d = Math.sqrt(dx * dx + dy * dy)
          target = d <= 320 ? 0 : d < ATTRACT_R ? (d - 320) / 60 : 1
        }
        s.centerLine += (target - s.centerLine) * 0.06

        const flashLeft = Math.max(0, s.flashUntil - now)
        const flash = flashLeft > 0 ? (flashLeft / FLASH_MS) ** 2 : 0
        drawString(
          logoRect.cx,
          logoRect.cy,
          logoRect,
          x,
          y,
          s,
          opacity * s.centerLine,
          s.alpha,
          flash,
        )
      })

      // direct word→word strings from the hovered word to its cluster
      if (hoveredWord) {
        states.forEach((o) => {
          if (o === hoveredWord || !o.visible) return
          const dx = o.x - hoveredWord.x
          const dy = o.y - hoveredWord.y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d >= ATTRACT_R) return
          const a =
            (d > 320 ? (ATTRACT_R - d) / 60 : 1) * o.alpha * hoveredWord.alpha * fade * 0.6
          drawString(hoveredWord.x, hoveredWord.y, hoveredWord, o.x, o.y, o, a, 1, 0)
        })
      }

      raf = requestAnimationFrame(tick)
    }

    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      if (leaveTimer) clearTimeout(leaveTimer)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointerMove)
      states.forEach((s) => {
        s.el.onmouseenter = null
        s.el.onmouseleave = null
        s.el.ontouchstart = null
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words.join(' '), enabled, reduced])

  if (!enabled || words.length === 0) return null

  return (
    <div ref={rootRef} aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      {words.map((text, i) => (
        <div
          key={`${i}-${text}`}
          ref={(el) => {
            wordRefs.current[i] = el
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            opacity: 0,
            fontStyle: 'italic',
            fontSize: 'clamp(0.9rem, 1.4vw, 1.25rem)',
            color: 'var(--muted)',
            whiteSpace: 'nowrap',
            cursor: 'default',
            userSelect: 'none',
            pointerEvents: 'auto',
            willChange: 'transform, opacity',
          }}
        >
          {text}
        </div>
      ))}
    </div>
  )
}
