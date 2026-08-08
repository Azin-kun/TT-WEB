import { DEFAULT_SEPARATION, type SeparationConfig } from './types'

/**
 * Structural shape of the `hero-effects` global. Written by hand rather than
 * imported from payload-types so this module compiles before the global exists
 * and does not break if generated types are stale. Every field is optional and
 * nullable because Payload returns nulls for never-saved fields.
 */
export type HeroEffectsInput = {
  separationEnabled?: boolean | null
  timing?: {
    chargeMs?: number | null
    reformMs?: number | null
    separateStart?: number | null
    staggerMax?: number | null
  } | null
  motion?: {
    spreadFrac?: number | null
    spreadVar?: number | null
    lateralDrift?: number | null
    spinMin?: number | null
    spinMax?: number | null
    capNormalMin?: number | null
  } | null
  material?: {
    normalFollow?: number | null
    hatchStrength?: number | null
    hatchScale?: number | null
    shineStrength?: number | null
    shineWidth?: number | null
    shineSpeed?: number | null
    shineChargeBoost?: number | null
    shineWarm?: string | null
    shineBright?: string | null
  } | null
  body?: {
    skinOpacity?: number | null
    bodyOpacity?: number | null
    bodyEdgeOpacity?: number | null
    bodyEdgeAngle?: number | null
  } | null
  feel?: {
    vibrateFrac?: number | null
    vibratePhaseStep?: number | null
    dragThresholdPx?: number | null
  } | null
}

const HEX = /^#[0-9a-fA-F]{6}$/

const num = (v: number | null | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const hexToInt = (v: string | null | undefined, fallback: number): number =>
  typeof v === 'string' && HEX.test(v) ? parseInt(v.slice(1), 16) : fallback

const intToHex = (v: number): string => `#${v.toString(16).padStart(6, '0').toUpperCase()}`

/**
 * Merges CMS values over the frozen defaults. Anything null/undefined — a
 * never-saved global, or a field added in a later release — falls back.
 */
export function resolveSeparation(cms: HeroEffectsInput | null | undefined): SeparationConfig {
  const d = DEFAULT_SEPARATION
  const t = cms?.timing ?? {}
  const m = cms?.motion ?? {}
  const mat = cms?.material ?? {}
  const b = cms?.body ?? {}
  const f = cms?.feel ?? {}

  let spinMin = num(m.spinMin, d.SPIN_MIN)
  let spinMax = num(m.spinMax, d.SPIN_MAX)
  // The bench makes it easy to drag min above max; the range is arithmetically
  // identical either way, but store it so the field names stay honest.
  if (spinMin > spinMax) [spinMin, spinMax] = [spinMax, spinMin]

  return {
    ENABLED: typeof cms?.separationEnabled === 'boolean' ? cms.separationEnabled : d.ENABLED,
    CHARGE_MS: num(t.chargeMs, d.CHARGE_MS),
    REFORM_MS: num(t.reformMs, d.REFORM_MS),
    SEPARATE_START: num(t.separateStart, d.SEPARATE_START),
    STAGGER_MAX: num(t.staggerMax, d.STAGGER_MAX),
    SPREAD_FRAC: num(m.spreadFrac, d.SPREAD_FRAC),
    SPREAD_VAR: num(m.spreadVar, d.SPREAD_VAR),
    LATERAL_DRIFT: num(m.lateralDrift, d.LATERAL_DRIFT),
    SPIN_MIN: spinMin,
    SPIN_MAX: spinMax,
    CAP_NORMAL_MIN: num(m.capNormalMin, d.CAP_NORMAL_MIN),
    NORMAL_FOLLOW: num(mat.normalFollow, d.NORMAL_FOLLOW),
    HATCH_STRENGTH: num(mat.hatchStrength, d.HATCH_STRENGTH),
    HATCH_SCALE: num(mat.hatchScale, d.HATCH_SCALE),
    SHINE_STRENGTH: num(mat.shineStrength, d.SHINE_STRENGTH),
    SHINE_WIDTH: num(mat.shineWidth, d.SHINE_WIDTH),
    SHINE_SPEED: num(mat.shineSpeed, d.SHINE_SPEED),
    SHINE_CHARGE_BOOST: num(mat.shineChargeBoost, d.SHINE_CHARGE_BOOST),
    SHINE_WARM: hexToInt(mat.shineWarm, d.SHINE_WARM),
    SHINE_BRIGHT: hexToInt(mat.shineBright, d.SHINE_BRIGHT),
    SKIN_OPACITY: num(b.skinOpacity, d.SKIN_OPACITY),
    BODY_OPACITY: num(b.bodyOpacity, d.BODY_OPACITY),
    BODY_EDGE_OPACITY: num(b.bodyEdgeOpacity, d.BODY_EDGE_OPACITY),
    BODY_EDGE_ANGLE: num(b.bodyEdgeAngle, d.BODY_EDGE_ANGLE),
    VIBRATE_FRAC: num(f.vibrateFrac, d.VIBRATE_FRAC),
    VIBRATE_PHASE_STEP: num(f.vibratePhaseStep, d.VIBRATE_PHASE_STEP),
    DRAG_THRESHOLD_PX: num(f.dragThresholdPx, d.DRAG_THRESHOLD_PX),
    SCROLL_DISARM_FRAC: d.SCROLL_DISARM_FRAC,
  }
}

/** Inverse mapping, used by the dev bench's Save to CMS button. */
export function toHeroEffectsPayload(c: SeparationConfig): HeroEffectsInput {
  return {
    separationEnabled: c.ENABLED,
    timing: {
      chargeMs: c.CHARGE_MS,
      reformMs: c.REFORM_MS,
      separateStart: c.SEPARATE_START,
      staggerMax: c.STAGGER_MAX,
    },
    motion: {
      spreadFrac: c.SPREAD_FRAC,
      spreadVar: c.SPREAD_VAR,
      lateralDrift: c.LATERAL_DRIFT,
      spinMin: c.SPIN_MIN,
      spinMax: c.SPIN_MAX,
      capNormalMin: c.CAP_NORMAL_MIN,
    },
    material: {
      normalFollow: c.NORMAL_FOLLOW,
      hatchStrength: c.HATCH_STRENGTH,
      hatchScale: c.HATCH_SCALE,
      shineStrength: c.SHINE_STRENGTH,
      shineWidth: c.SHINE_WIDTH,
      shineSpeed: c.SHINE_SPEED,
      shineChargeBoost: c.SHINE_CHARGE_BOOST,
      shineWarm: intToHex(c.SHINE_WARM),
      shineBright: intToHex(c.SHINE_BRIGHT),
    },
    body: {
      skinOpacity: c.SKIN_OPACITY,
      bodyOpacity: c.BODY_OPACITY,
      bodyEdgeOpacity: c.BODY_EDGE_OPACITY,
      bodyEdgeAngle: c.BODY_EDGE_ANGLE,
    },
    feel: {
      vibrateFrac: c.VIBRATE_FRAC,
      vibratePhaseStep: c.VIBRATE_PHASE_STEP,
      dragThresholdPx: c.DRAG_THRESHOLD_PX,
    },
  }
}
