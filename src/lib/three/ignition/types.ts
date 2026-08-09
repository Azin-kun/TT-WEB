import type * as THREE from 'three'

/**
 * Default tuning for the electrical wireframe ignition.
 * Spec: docs/superpowers/specs/2026-08-09-hero-ignition-design.md §3, §4.6
 *
 * Frozen. Live values come from the `hero-effects` Payload global and are
 * merged over these by resolveIgnition(); the dev bench at
 * /[locale]/dev/ignition keeps its own mutable copy for tuning and can write
 * approved values back to that global.
 *
 * Phase boundaries are FRACTIONS of IGNITION_MS, never absolute milliseconds:
 * one duration retimes the whole sequence, and the phases cannot be driven
 * into an inconsistent state the way three independent ms values could.
 */
export type IgnitionConfig = {
  ENABLED: boolean
  IGNITION_MS: number
  SEED_END: number
  FRONT_END: number
  CUE_FRAC: number
  SEED_OFFSET_X: number
  SEED_OFFSET_Y: number
  SEED_OFFSET_Z: number
  FRONT_SOFTNESS: number
  WAKE_LAG: number
  CAGE_DENSITY: number
  CAGE_DENSITY_MOBILE: number
  CAGE_OPACITY: number
  CAGE_SEED: number
  COLD_COLOR: number
  WARM_COLOR: number
  HOT_COLOR: number
  CREST_COLOR: number
  CORE_STRENGTH: number
  CORE_RADIUS: number
  DARK_MASS_OPACITY: number
  GLOW_DECAY: number
}

export const DEFAULT_IGNITION: Readonly<IgnitionConfig> = Object.freeze({
  ENABLED: true,
  /** total duration of the bridge, ms. The single pacing control. */
  IGNITION_MS: 2000,
  /** fraction at which the seed bloom ends and the front starts expanding */
  SEED_END: 0.12,
  /** fraction at which the charge front finishes crossing the geometry */
  FRONT_END: 0.78,
  /**
   * Fraction at which `cue` fires. Sub-project 3's orbs enter here, and
   * ConstellationField's entrance (onLive) moves here too — it lands just as
   * the front finishes, so the energy disperses INTO the orbiting bodies.
   */
  CUE_FRAC: 0.8,
  /** seed position offset from the logo's centre, as fractions of logo height */
  SEED_OFFSET_X: 0,
  SEED_OFFSET_Y: 0,
  SEED_OFFSET_Z: 0,
  /** crest half-width, as a fraction of logo height */
  FRONT_SOFTNESS: 0.18,
  /** how far behind the crest the skin materializes, as a fraction of logo height */
  WAKE_LAG: 0.1,
  /**
   * Fraction of wireframe segments kept. A PARTIAL wireframe reads as scribble
   * where a complete one reads as CAD.
   *
   * This is a LOOK control, not a budget control. THREE.WireframeGeometry
   * deduplicates shared edges, so the whole logo is only 29,557 segments
   * (19,704 tris, closed manifold => ~3T/2) — measured, not estimated. Even at
   * density 1 that is one cheap draw call, so density buys appearance only.
   *
   * 0.55 (~16.3k segments) is a provisional starting point. The right value is
   * a visual call to be settled on the bench at /[locale]/dev/ignition.
   */
  CAGE_DENSITY: 0.55,
  /** same, below 640px */
  CAGE_DENSITY_MOBILE: 0.3,
  CAGE_OPACITY: 0.9,
  /** mulberry32 seed, so the subsample is identical on every load */
  CAGE_SEED: 1337,
  /** cold cage — identical to the ghost wireframe ink and to the video's pencil */
  COLD_COLOR: 0x2b2a27,
  /** red-pencil token */
  WARM_COLOR: 0x8e1114,
  HOT_COLOR: 0xc8341a,
  /** already the SHINE_BRIGHT token. Kept small and brief. */
  CREST_COLOR: 0xfff8e0,
  CORE_STRENGTH: 1,
  /** hot-core radius as a fraction of logo height */
  CORE_RADIUS: 0.22,
  /**
   * Inner-body surface opacity DURING IGNITION ONLY. A 1px red line on
   * #F6F1E7 paper reads as a line, not as glow — glow needs contrast the paper
   * does not provide. OPTIMIND's struts read against soft dark mesh behind
   * them; this is that dark mass. See spec §3.3.
   */
  DARK_MASS_OPACITY: 0.12,
  /** exponential decay rate for residual glow during settle; higher = faster */
  GLOW_DECAY: 2.4,
})

/** Discrete transitions. The continuous progress value is pulled via getProgress(). */
export type IgnitionEvent = 'seed' | 'cue' | 'done'

export type IgnitionUniforms = {
  /** current front radius, in logo-local units */
  uFront: { value: number }
  uSeed: { value: THREE.Vector3 }
  uSoftness: { value: number }
  uCoreRadius: { value: number }
  uCoreStrength: { value: number }
  /** 1 while the core is alive, decaying to 0 through settle */
  uCoreLive: { value: number }
  /** whole-cage fade, 1 through seed+front, 0 by the end of settle */
  uGlobalFade: { value: number }
  uWakeLag: { value: number }
  /** 1 while ignition owns the skin's alpha, 0 once it is handed back */
  uWakeActive: { value: number }
  uCold: { value: THREE.Color }
  uWarm: { value: THREE.Color }
  uHot: { value: THREE.Color }
  uCrest: { value: THREE.Color }
  uCageOpacity: { value: number }
}
