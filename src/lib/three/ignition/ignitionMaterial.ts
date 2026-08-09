import * as THREE from 'three'
import type { IgnitionConfig, IgnitionUniforms } from './types'

/**
 * The cage's own shader, plus the one narrow patch ignition makes to the
 * existing skin materials.
 * Spec: docs/superpowers/specs/2026-08-09-hero-ignition-design.md §3.2, §4.1
 *
 * No per-vertex attributes: the charge front is distance from a seed point,
 * which the shader computes straight from `position`.
 */

export function makeIgnitionUniforms(
  config: IgnitionConfig,
  logoHeight: number,
  center: THREE.Vector3,
): IgnitionUniforms {
  const seed = center
    .clone()
    .add(
      new THREE.Vector3(
        config.SEED_OFFSET_X * logoHeight,
        config.SEED_OFFSET_Y * logoHeight,
        config.SEED_OFFSET_Z * logoHeight,
      ),
    )
  return {
    uFront: { value: 0 },
    uSeed: { value: seed },
    uSoftness: { value: Math.max(1e-4, config.FRONT_SOFTNESS * logoHeight) },
    uCoreRadius: { value: Math.max(1e-4, config.CORE_RADIUS * logoHeight) },
    uCoreStrength: { value: config.CORE_STRENGTH },
    uCoreLive: { value: 0 },
    uGlobalFade: { value: 0 },
    uWakeLag: { value: config.WAKE_LAG * logoHeight },
    uWakeActive: { value: 0 },
    uCold: { value: new THREE.Color(config.COLD_COLOR) },
    uWarm: { value: new THREE.Color(config.WARM_COLOR) },
    uHot: { value: new THREE.Color(config.HOT_COLOR) },
    uCrest: { value: new THREE.Color(config.CREST_COLOR) },
    uCageOpacity: { value: config.CAGE_OPACITY },
  }
}

const CAGE_VERT = /* glsl */ `
uniform vec3 uSeed;
varying float vDist;
void main() {
  vDist = distance(position, uSeed);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/**
 * Heat is the max of two sources: the travelling crest, and the hot core that
 * sits at the seed. The ramp walks cold -> warm -> hot -> crest, with the
 * blown-out crest colour confined to the top of the range so it stays a thin
 * bright line rather than a white wash on the paper ground.
 */
const CAGE_FRAG = /* glsl */ `
uniform float uFront;
uniform float uSoftness;
uniform float uCoreRadius;
uniform float uCoreStrength;
uniform float uCoreLive;
uniform float uGlobalFade;
uniform float uCageOpacity;
uniform vec3  uCold;
uniform vec3  uWarm;
uniform vec3  uHot;
uniform vec3  uCrest;
varying float vDist;

void main() {
  float crest = 1.0 - smoothstep(0.0, uSoftness, abs(vDist - uFront));
  float core  = uCoreStrength * uCoreLive * (1.0 - smoothstep(0.0, uCoreRadius, vDist));
  float heat  = clamp(max(crest, core), 0.0, 1.0);

  vec3 c = mix(uCold, uWarm, smoothstep(0.0, 0.40, heat));
  c = mix(c, uHot,   smoothstep(0.40, 0.75, heat));
  c = mix(c, uCrest, smoothstep(0.90, 1.00, heat));

  float a = uCageOpacity * uGlobalFade;
  if (a <= 0.001) discard;
  gl_FragColor = vec4(c, a);
}
`

/**
 * NORMAL blending, deliberately — not additive. The cage spends most of the
 * transition COLD, drawing graphite lines that have to darken the paper behind
 * them. Additive blending would make the cold state invisible and leave only
 * the hot crest, which is the opposite of the intended read.
 */
export function makeCageMaterial(u: IgnitionUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFront: u.uFront,
      uSeed: u.uSeed,
      uSoftness: u.uSoftness,
      uCoreRadius: u.uCoreRadius,
      uCoreStrength: u.uCoreStrength,
      uCoreLive: u.uCoreLive,
      uGlobalFade: u.uGlobalFade,
      uCageOpacity: u.uCageOpacity,
      uCold: u.uCold,
      uWarm: u.uWarm,
      uHot: u.uHot,
      uCrest: u.uCrest,
    },
    vertexShader: CAGE_VERT,
    fragmentShader: CAGE_FRAG,
    transparent: true,
    depthWrite: false,
  })
}

const SKIN_VERT_HELPERS = /* glsl */ `
uniform vec3 uSeed;
varying float vIgnDist;
`

const SKIN_FRAG_HELPERS = /* glsl */ `
uniform float uFront;
uniform float uWakeLag;
uniform float uSoftness;
uniform float uWakeActive;
varying float vIgnDist;

// 0 ahead of the crest, 1 well behind it. Multiplied into the skin's alpha so
// the solid logo materializes in the front's wake.
float tt_ignWake() {
  float w = smoothstep(0.0, max(1e-4, uSoftness), (uFront - uWakeLag) - vIgnDist);
  return mix(1.0, w, uWakeActive);
}
`

/**
 * Throws loudly if a shader anchor is missing. A silently-missed `.replace()`
 * is exactly the failure shape this codebase has already shipped once, and it
 * would present here as "the wake just doesn't work" with no error at all.
 */
function replaceOrThrow(src: string, anchor: string, next: string, where: string): string {
  if (!src.includes(anchor)) {
    throw new Error(`patchSkinForIgnition: anchor "${anchor}" not found in ${where} shader`)
  }
  return src.replace(anchor, next)
}

/**
 * Adds the wake alpha to a skin material.
 *
 * MUST be applied AFTER patchForShatter, and MUST compose rather than assign:
 * three exposes exactly one onBeforeCompile per material, so assigning here
 * would silently drop the screen-space hatch, the light wash and the entire
 * panel displacement, with no error anywhere.
 *
 * Anchors verified against three r185's `matcap` shader: the vertex stage has
 * <common> and <begin_vertex>; the fragment stage has <common> and
 * <alphatest_fragment>, with `diffuseColor` declared before the latter. None of
 * them collide with patchForShatter, which uses <common>, <beginnormal_vertex>,
 * <begin_vertex> and <opaque_fragment>.
 */
export function patchSkinForIgnition(material: THREE.Material, u: IgnitionUniforms) {
  const prev = material.onBeforeCompile

  material.onBeforeCompile = function (shader, renderer) {
    prev?.call(this, shader, renderer)

    Object.assign(shader.uniforms, {
      uFront: u.uFront,
      uSeed: u.uSeed,
      uSoftness: u.uSoftness,
      uWakeLag: u.uWakeLag,
      uWakeActive: u.uWakeActive,
    })

    shader.vertexShader = replaceOrThrow(
      shader.vertexShader,
      '#include <common>',
      `#include <common>\n${SKIN_VERT_HELPERS}`,
      'vertex',
    )
    // `position`, deliberately — not `transformed`, which the shatter patch
    // displaces. The wake follows the logo's real shape, not where its panels
    // have drifted to.
    shader.vertexShader = replaceOrThrow(
      shader.vertexShader,
      '#include <begin_vertex>',
      `#include <begin_vertex>\n  vIgnDist = distance(position, uSeed);`,
      'vertex',
    )

    shader.fragmentShader = replaceOrThrow(
      shader.fragmentShader,
      '#include <common>',
      `#include <common>\n${SKIN_FRAG_HELPERS}`,
      'fragment',
    )
    shader.fragmentShader = replaceOrThrow(
      shader.fragmentShader,
      '#include <alphatest_fragment>',
      `diffuseColor.a *= tt_ignWake();\n  #include <alphatest_fragment>`,
      'fragment',
    )
  }

  // Materials whose compiled program differs MUST NOT share a cache entry.
  // Without this, three can hand the patched program to an unpatched matcap
  // material with otherwise identical parameters — such as the ghost body's
  // surfaces, which Task 6 starts building for the dark mass.
  material.customProgramCacheKey = () => 'tt-ignition-1'
  material.needsUpdate = true
}
