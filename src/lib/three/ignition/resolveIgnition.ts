import { DEFAULT_IGNITION, type IgnitionConfig } from './types'

/**
 * Ignition's slice of the `hero-effects` global. Written by hand rather than
 * imported from payload-types so this module compiles before the fields exist
 * and does not break if generated types are stale. Every field is optional and
 * nullable because Payload returns nulls for never-saved fields.
 */
export type HeroEffectsIgnitionInput = {
  ignitionEnabled?: boolean | null
  ignitionTiming?: {
    ignitionMs?: number | null
    seedEnd?: number | null
    frontEnd?: number | null
    cueFrac?: number | null
  } | null
  ignitionShape?: {
    seedOffsetX?: number | null
    seedOffsetY?: number | null
    seedOffsetZ?: number | null
    frontSoftness?: number | null
    wakeLag?: number | null
    coreRadius?: number | null
    coreStrength?: number | null
  } | null
  ignitionCage?: {
    cageDensity?: number | null
    cageDensityMobile?: number | null
    cageOpacity?: number | null
    cageSeed?: number | null
  } | null
  ignitionColor?: {
    coldColor?: string | null
    warmColor?: string | null
    hotColor?: string | null
    crestColor?: string | null
    darkMassOpacity?: number | null
    glowDecay?: number | null
  } | null
  ignitionOverlay?: {
    overlayEnabled?: boolean | null
    overlayLeadMs?: number | null
    sphereScale?: number | null
    bloomScale?: number | null
    polySides?: number | null
    bloomStart?: number | null
    bloomEnd?: number | null
    morphStart?: number | null
  } | null
  ignitionPulse?: {
    pulseEnabled?: boolean | null
    pulseMs?: number | null
  } | null
  ignitionLife?: {
    wireJitter?: number | null
    wireSpeed?: number | null
    sparkStagger?: number | null
    sparkRate?: number | null
    sparkDensity?: number | null
    sparkIdle?: number | null
  } | null
  ignitionEmbers?: {
    emberEnabled?: boolean | null
    emberDensity?: number | null
    emberSize?: number | null
    emberTwinkle?: number | null
    emberOpacity?: number | null
  } | null
}

const HEX = /^#[0-9a-fA-F]{6}$/

const num = (v: number | null | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const hexToInt = (v: string | null | undefined, fallback: number): number =>
  typeof v === 'string' && HEX.test(v) ? parseInt(v.slice(1), 16) : fallback

const intToHex = (v: number): string => `#${v.toString(16).padStart(6, '0').toUpperCase()}`

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/**
 * Merges CMS values over the frozen defaults. Anything null/undefined — a
 * never-saved global, or a field added in a later release — falls back.
 */
export function resolveIgnition(cms: HeroEffectsIgnitionInput | null | undefined): IgnitionConfig {
  const d = DEFAULT_IGNITION
  const t = cms?.ignitionTiming ?? {}
  const s = cms?.ignitionShape ?? {}
  const g = cms?.ignitionCage ?? {}
  const c = cms?.ignitionColor ?? {}
  const o = cms?.ignitionOverlay ?? {}
  const p = cms?.ignitionPulse ?? {}
  const l = cms?.ignitionLife ?? {}
  const e = cms?.ignitionEmbers ?? {}

  // Overlay phase boundaries obey the same rule as the ignition's own: ordered
  // and inside 0..1, enforced here because the REST API bypasses the admin UI.
  const bloomStart = clamp01(num(o.bloomStart, d.BLOOM_START))
  const bloomEnd = Math.max(bloomStart, clamp01(num(o.bloomEnd, d.BLOOM_END)))
  const morphStart = clamp01(num(o.morphStart, d.MORPH_START))
  // Below 3 sides the polygon radius function degenerates and the cage would
  // collapse to a line.
  const polySides = Math.max(3, Math.round(num(o.polySides, d.POLY_SIDES)))

  // Phase boundaries must stay ordered and inside 0..1. Payload's min/max
  // guards the admin UI, but the REST API can be written to directly.
  const seedEnd = clamp01(num(t.seedEnd, d.SEED_END))
  const frontEnd = Math.max(seedEnd, clamp01(num(t.frontEnd, d.FRONT_END)))
  const cueFrac = clamp01(num(t.cueFrac, d.CUE_FRAC))

  return {
    ENABLED: typeof cms?.ignitionEnabled === 'boolean' ? cms.ignitionEnabled : d.ENABLED,
    IGNITION_MS: num(t.ignitionMs, d.IGNITION_MS),
    SEED_END: seedEnd,
    FRONT_END: frontEnd,
    CUE_FRAC: cueFrac,
    SEED_OFFSET_X: num(s.seedOffsetX, d.SEED_OFFSET_X),
    SEED_OFFSET_Y: num(s.seedOffsetY, d.SEED_OFFSET_Y),
    SEED_OFFSET_Z: num(s.seedOffsetZ, d.SEED_OFFSET_Z),
    FRONT_SOFTNESS: num(s.frontSoftness, d.FRONT_SOFTNESS),
    WAKE_LAG: num(s.wakeLag, d.WAKE_LAG),
    CAGE_DENSITY: num(g.cageDensity, d.CAGE_DENSITY),
    CAGE_DENSITY_MOBILE: num(g.cageDensityMobile, d.CAGE_DENSITY_MOBILE),
    CAGE_OPACITY: num(g.cageOpacity, d.CAGE_OPACITY),
    CAGE_SEED: num(g.cageSeed, d.CAGE_SEED),
    COLD_COLOR: hexToInt(c.coldColor, d.COLD_COLOR),
    WARM_COLOR: hexToInt(c.warmColor, d.WARM_COLOR),
    HOT_COLOR: hexToInt(c.hotColor, d.HOT_COLOR),
    CREST_COLOR: hexToInt(c.crestColor, d.CREST_COLOR),
    CORE_STRENGTH: num(s.coreStrength, d.CORE_STRENGTH),
    CORE_RADIUS: num(s.coreRadius, d.CORE_RADIUS),
    DARK_MASS_OPACITY: num(c.darkMassOpacity, d.DARK_MASS_OPACITY),
    GLOW_DECAY: num(c.glowDecay, d.GLOW_DECAY),
    OVERLAY_ENABLED:
      typeof o.overlayEnabled === 'boolean' ? o.overlayEnabled : d.OVERLAY_ENABLED,
    OVERLAY_LEAD_MS: num(o.overlayLeadMs, d.OVERLAY_LEAD_MS),
    SPHERE_SCALE: num(o.sphereScale, d.SPHERE_SCALE),
    BLOOM_SCALE: num(o.bloomScale, d.BLOOM_SCALE),
    POLY_SIDES: polySides,
    BLOOM_START: bloomStart,
    BLOOM_END: bloomEnd,
    MORPH_START: morphStart,
    PULSE_ENABLED: typeof p.pulseEnabled === 'boolean' ? p.pulseEnabled : d.PULSE_ENABLED,
    PULSE_MS: num(p.pulseMs, d.PULSE_MS),
    WIRE_JITTER: num(l.wireJitter, d.WIRE_JITTER),
    WIRE_SPEED: num(l.wireSpeed, d.WIRE_SPEED),
    SPARK_STAGGER: num(l.sparkStagger, d.SPARK_STAGGER),
    SPARK_RATE: num(l.sparkRate, d.SPARK_RATE),
    // A flare window of 1 would leave every segment permanently lit, which is
    // a white-out rather than sparking.
    SPARK_DENSITY: Math.min(0.9, clamp01(num(l.sparkDensity, d.SPARK_DENSITY))),
    SPARK_IDLE: clamp01(num(l.sparkIdle, d.SPARK_IDLE)),
    EMBER_ENABLED: typeof e.emberEnabled === 'boolean' ? e.emberEnabled : d.EMBER_ENABLED,
    EMBER_DENSITY: clamp01(num(e.emberDensity, d.EMBER_DENSITY)),
    EMBER_SIZE: num(e.emberSize, d.EMBER_SIZE),
    EMBER_TWINKLE: num(e.emberTwinkle, d.EMBER_TWINKLE),
    EMBER_OPACITY: clamp01(num(e.emberOpacity, d.EMBER_OPACITY)),
  }
}

/** Inverse mapping, used by the dev bench's Save to CMS button. */
export function toIgnitionPayload(c: IgnitionConfig): HeroEffectsIgnitionInput {
  return {
    ignitionEnabled: c.ENABLED,
    ignitionTiming: {
      ignitionMs: c.IGNITION_MS,
      seedEnd: c.SEED_END,
      frontEnd: c.FRONT_END,
      cueFrac: c.CUE_FRAC,
    },
    ignitionShape: {
      seedOffsetX: c.SEED_OFFSET_X,
      seedOffsetY: c.SEED_OFFSET_Y,
      seedOffsetZ: c.SEED_OFFSET_Z,
      frontSoftness: c.FRONT_SOFTNESS,
      wakeLag: c.WAKE_LAG,
      coreRadius: c.CORE_RADIUS,
      coreStrength: c.CORE_STRENGTH,
    },
    ignitionCage: {
      cageDensity: c.CAGE_DENSITY,
      cageDensityMobile: c.CAGE_DENSITY_MOBILE,
      cageOpacity: c.CAGE_OPACITY,
      cageSeed: c.CAGE_SEED,
    },
    ignitionColor: {
      coldColor: intToHex(c.COLD_COLOR),
      warmColor: intToHex(c.WARM_COLOR),
      hotColor: intToHex(c.HOT_COLOR),
      crestColor: intToHex(c.CREST_COLOR),
      darkMassOpacity: c.DARK_MASS_OPACITY,
      glowDecay: c.GLOW_DECAY,
    },
    ignitionOverlay: {
      overlayEnabled: c.OVERLAY_ENABLED,
      overlayLeadMs: c.OVERLAY_LEAD_MS,
      sphereScale: c.SPHERE_SCALE,
      bloomScale: c.BLOOM_SCALE,
      polySides: c.POLY_SIDES,
      bloomStart: c.BLOOM_START,
      bloomEnd: c.BLOOM_END,
      morphStart: c.MORPH_START,
    },
    ignitionPulse: {
      pulseEnabled: c.PULSE_ENABLED,
      pulseMs: c.PULSE_MS,
    },
    ignitionLife: {
      wireJitter: c.WIRE_JITTER,
      wireSpeed: c.WIRE_SPEED,
      sparkStagger: c.SPARK_STAGGER,
      sparkRate: c.SPARK_RATE,
      sparkDensity: c.SPARK_DENSITY,
      sparkIdle: c.SPARK_IDLE,
    },
    ignitionEmbers: {
      emberEnabled: c.EMBER_ENABLED,
      emberDensity: c.EMBER_DENSITY,
      emberSize: c.EMBER_SIZE,
      emberTwinkle: c.EMBER_TWINKLE,
      emberOpacity: c.EMBER_OPACITY,
    },
  }
}
