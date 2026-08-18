import type * as THREE from 'three'

/**
 * Default tuning for the hold-to-separate effect.
 * Spec: docs/superpowers/specs/2026-08-08-hero-logo-shatter-design.md §7.2
 *
 * Frozen. Live values come from the `hero-effects` Payload global and are
 * merged over these by resolveSeparation(); the dev bench at
 * /[locale]/dev/shatter keeps its own mutable copy for tuning and can write
 * approved values back to that global.
 *
 * Model corrected 2026-08-08 after frame-by-frame observation of trionn.com:
 * faces do NOT fragment. Whole intact panels detach and drift apart slowly —
 * every face of the outer skin sheds, leaving a separate intact body behind.
 */
export type SeparationConfig = {
  ENABLED: boolean
  CHARGE_MS: number
  REFORM_MS: number
  DRAG_THRESHOLD_PX: number
  SEPARATE_START: number
  STAGGER_MAX: number
  CAP_NORMAL_MIN: number
  SPREAD_FRAC: number
  SPREAD_VAR: number
  LATERAL_DRIFT: number
  SPIN_MIN: number
  SPIN_MAX: number
  NORMAL_FOLLOW: number
  HATCH_STRENGTH: number
  HATCH_SCALE: number
  SHINE_STRENGTH: number
  SHINE_WIDTH: number
  SHINE_SPEED: number
  SHINE_CHARGE_BOOST: number
  SHINE_WARM: number
  SHINE_BRIGHT: number
  VIBRATE_FRAC: number
  VIBRATE_PHASE_STEP: number
  SCROLL_DISARM_FRAC: number
  SKIN_OPACITY: number
  BODY_OPACITY: number
  BODY_EDGE_OPACITY: number
  BODY_EDGE_ANGLE: number
}

export const DEFAULT_SEPARATION: Readonly<SeparationConfig> = Object.freeze({
  ENABLED: true,
  /** ms of holding to go from intact to fully separated */
  CHARGE_MS: 950,
  /**
   * ms to reassemble after release. Deliberately far slower than trionn's
   * 600ms — the faces drift back together rather than snapping.
   */
  REFORM_MS: 2500,
  /** px of pointer travel that reclassifies a hold as a drag */
  DRAG_THRESHOLD_PX: 6,

  /**
   * Fraction of the charge that passes BEFORE panels start to move.
   * On trionn the mark stays fully assembled while its faces flare, roughly
   * 0–480ms of a hold; separation only begins after that. The light comes
   * first, the coming-apart second.
   */
  SEPARATE_START: 0.65,
  /** extra per-panel delay on top of SEPARATE_START, so they don't leave in lockstep */
  STAGGER_MAX: 0.2,

  /**
   * A triangle counts as a cap when |normal.z| exceeds this; below it, the
   * triangle belongs to the extruded side band. Every one of those three
   * groups detaches — this only decides WHICH panel a triangle leaves with.
   */
  CAP_NORMAL_MIN: 0.79,

  /** how far a panel drifts, as a fraction of logo height */
  SPREAD_FRAC: 1.6,
  /** per-panel variation in travel distance, as ± fraction of SPREAD */
  SPREAD_VAR: 0.8,
  /**
   * How much of a panel's drift is sideways rather than straight off the face.
   * The camera is near front-on, so pure ±Z motion barely reads — a decent
   * lateral component is what makes the separation legible.
   */
  LATERAL_DRIFT: 0.75,

  /**
   * Panel rotation while drifting, in multiples of PI radians.
   * Kept very low on purpose: the observed motion is a calm, near-linear glide
   * with only a slight turn — an exploded-view diagram, not an explosion.
   */
  SPIN_MIN: 0.18,
  SPIN_MAX: 0.21,

  /** how much of a panel's rotation is applied to its NORMAL (see shatterMaterial) */
  NORMAL_FOLLOW: 0.55,

  /** screen-space pencil hatch */
  HATCH_STRENGTH: 0.65,
  /** hatch spacing multiplier — higher = coarser strokes, lower = denser */
  HATCH_SCALE: 0.5,

  /**
   * Light-wash sweep across the faces — a highlight raking over graphite, not
   * a whitewash. Paired with a very narrow SHINE_WIDTH it reads as a hard
   * specular streak rather than a broad glow, which is what keeps the
   * black-and-red palette and the hatch underneath legible at this strength.
   */
  SHINE_STRENGTH: 0.3,
  /** width of the sweep band, 0..1 — larger is a softer, broader wash */
  SHINE_WIDTH: 0.05,
  /** how fast the light orbits */
  SHINE_SPEED: 0.9,
  /** how much brighter the wash gets at full charge — the flare before the peel */
  SHINE_CHARGE_BOOST: 1,
  /** warm end of the wash */
  SHINE_WARM: 0xb4571c,
  /** hot end of the wash */
  SHINE_BRIGHT: 0xfff8e0,

  /** peak shake amplitude at full charge, as a fraction of logo height */
  VIBRATE_FRAC: 0.006,
  /** shake oscillator step per frame, radians (trionn's `vibratePhase += 1.1`) */
  VIBRATE_PHASE_STEP: 1.1,

  /**
   * Opacity of the OUTER SKIN — the faces that separate. Glassy enough that
   * the body reads through it, solid enough that the black-and-red and the
   * pencil hatch survive against the light paper ground. (Trionn can go far
   * sheerer than this only because their page is near-black.)
   */
  SKIN_OPACITY: 0.6,
  /**
   * Opacity of the intact body left behind. At 0 its surfaces are invisible
   * and ONLY its edges draw — so what remains is a pure wireframe of the logo,
   * which is what trionn's late frames actually show.
   */
  BODY_OPACITY: 0,
  /** opacity of the drawn edges on that body */
  BODY_EDGE_OPACITY: 0.9,
  /**
   * Only edges sharper than this (degrees) get drawn on the inner body.
   * Low values light up every triangle boundary on the curved strokes and turn
   * the body into a mesh of noise; this keeps it to the silhouette.
   */
  BODY_EDGE_ANGLE: 26,

  /** refuse to start charging once scrolled past this fraction of viewport height */
  SCROLL_DISARM_FRAC: 0.15,
})

/** Discrete transitions. The continuous charge value is pulled via getCharge(). */
export type ShatterEvent = 'blast' | 'reform' | 'idle'

export type ShatterUniforms = {
  uBlast: { value: number }
  uCenter: { value: THREE.Vector3 }
  uSpread: { value: number }
  uNormalFollow: { value: number }
  uHatchStrength: { value: number }
  uHatchScale: { value: number }
  uTime: { value: number }
  uShineStrength: { value: number }
  uShineWidth: { value: number }
  uShineSpeed: { value: number }
  uShineBoost: { value: number }
  uShineWarm: { value: THREE.Color }
  uShineBright: { value: THREE.Color }
}

/** Deterministic PRNG so a given seed always produces the same panel motion. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
