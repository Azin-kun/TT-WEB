import * as THREE from 'three'
import { CALIB } from '../calibration'
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
  logoRadius: number = logoHeight * 0.5,
): IgnitionUniforms {
  const sphereR = logoRadius * config.SPHERE_SCALE
  // BLOOM_SCALE is stated as a multiple of the sphere's DIAMETER, so make the
  // polygon's CORNERS land exactly there. tt_polyR() returns an inradius-relative
  // radius peaking at 1/cos(pi/N) at the corners, so pre-multiply it out.
  const bloomR = sphereR * config.BLOOM_SCALE * Math.cos(Math.PI / config.POLY_SIDES)
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
    uCentre: { value: center.clone() },
    uBloom: { value: 0 },
    // 1 = true logo shape. The bridge without an overlay starts here, which is
    // exactly how the cage behaved before the overlay existed.
    uMorph: { value: 1 },
    uSphereR: { value: sphereR },
    uBloomR: { value: bloomR },
    uPolySides: { value: config.POLY_SIDES },
    uTime: { value: 0 },
    uJitter: { value: config.WIRE_JITTER * logoRadius },
    uJitSpeed: { value: config.WIRE_SPEED },
    uSparkStagger: { value: config.SPARK_STAGGER * logoRadius },
    uSparkRate: { value: config.SPARK_RATE },
    uSparkDensity: { value: config.SPARK_DENSITY },
    uSparkLevel: { value: config.SPARK_IDLE },
    uEmberSize: { value: config.EMBER_SIZE },
    uEmberTwinkle: { value: config.EMBER_TWINKLE },
    uEmberOpacity: { value: config.EMBER_OPACITY },
    uPointRef: { value: CALIB.CAMERA_Z },
  }
}

/**
 * The cage is one continuous object across the whole hero (spec §2b): a sphere
 * over the extruding sketch, blooming into a polygon, then morphing home into
 * the logo's wireframe.
 *
 * All three shape targets are derived from `position` and `uCentre`, so this
 * needs NO extra vertex attributes — the sphere is just each cage vertex pushed
 * out along its own direction from the centre. Every vertex therefore has a
 * defined destination and the morph cannot tear.
 */
/**
 * Shape, writhe and per-vertex randomness — shared verbatim by the cage lines
 * and the ember points, so the embers sit exactly on the cage at every stage of
 * the morph rather than drifting out of register with it.
 */
const SHARED_SHAPE_GLSL = /* glsl */ `
uniform vec3  uSeed;
uniform vec3  uCentre;
uniform float uSphereR;
uniform float uBloomR;
uniform float uPolySides;
uniform float uBloom;
uniform float uMorph;
uniform float uTime;
uniform float uJitter;
uniform float uJitSpeed;
uniform float uSparkStagger;

float tt_hash11(float n) { return fract(sin(n) * 43758.5453123); }
float tt_hash13(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453123);
}

// Radius of a regular N-gon of inradius 1 along direction d. Peaks at
// 1/cos(pi/N) on the corners, 1 at the edge midpoints.
float tt_polyR(vec2 d, float N) {
  float a = atan(d.y, d.x);
  float seg = 6.28318530718 / N;
  float k = mod(a + seg * 0.5, seg) - seg * 0.5;
  return 1.0 / max(0.2, cos(k));
}

/**
 * Morphed position plus the per-vertex writhe.
 *
 * The writhe is keyed off a hash of the vertex's OWN position, which matters:
 * the two endpoints of a segment hash differently and so drift apart, making the
 * web deform rather than translate — but endpoints that share a position (the
 * junctions where segments meet) hash identically and move together, so the mesh
 * stays connected instead of tearing itself apart.
 */
vec3 tt_shaped(vec3 pos, float seed) {
  vec3 p = pos;

  // Skip the morph once the cage is home — the common case, since the charge,
  // settle and every pulse run entirely at uMorph = 1.
  if (uMorph < 0.999) {
    vec3 rel = pos - uCentre;
    vec3 dir = rel / max(1e-5, length(rel));

    vec2 dxy = rel.xy;
    // A vertex sitting exactly on the centre axis has no angle to speak of;
    // pick one rather than feeding atan() a zero vector.
    if (dot(dxy, dxy) < 1e-10) dxy = vec2(1.0, 0.0);

    vec3 pSphere = uCentre + dir * uSphereR;
    vec3 pPoly   = uCentre + dir * (uBloomR * tt_polyR(normalize(dxy), uPolySides));
    p = mix(mix(pSphere, pPoly, uBloom), pos, uMorph);
  }

  vec3 axis = normalize(vec3(
    tt_hash11(seed * 13.1) - 0.5,
    tt_hash11(seed * 27.3) - 0.5,
    tt_hash11(seed * 41.7) - 0.5
  ) + vec3(1e-4));
  p += axis * (uJitter * sin(uTime * uJitSpeed + seed * 6.2831853));
  return p;
}

/**
 * Distance to the charge front, randomly offset per vertex. Without the offset
 * the front is a clean expanding ring; with it the leading edge is broken and
 * ragged, which is what the reference actually shows.
 */
float tt_frontDist(vec3 p, float seed) {
  return distance(p, uSeed) + (seed - 0.5) * 2.0 * uSparkStagger;
}
`

/** Independent random flares: each segment lights on its own rate and phase. */
const SPARK_GLSL = /* glsl */ `
uniform float uSparkRate;
uniform float uSparkDensity;
uniform float uSparkLevel;

float tt_flare(float seed) {
  float ph = fract(uTime * uSparkRate * (0.4 + seed) + seed * 7.13);
  return smoothstep(1.0 - uSparkDensity, 1.0, ph) * uSparkLevel;
}
`

const CAGE_VERT = /* glsl */ `
${SHARED_SHAPE_GLSL}
varying float vDist;
varying float vSeed;

void main() {
  float seed = tt_hash13(position);
  vSeed = seed;
  vec3 finalPos = tt_shaped(position, seed);
  // Measured on the MORPHED position, so the charge front tracks the cage where
  // it actually is — across the bloomed polygon, not where the logo will end up.
  vDist = tt_frontDist(finalPos, seed);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
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
uniform float uTime;
${SPARK_GLSL}
varying float vDist;
varying float vSeed;

void main() {
  float crest = 1.0 - smoothstep(0.0, uSoftness, abs(vDist - uFront));
  float core  = uCoreStrength * uCoreLive * (1.0 - smoothstep(0.0, uCoreRadius, vDist));
  // Sparks fire independently of where the front is, so the cage keeps
  // crackling instead of going dead behind the crest.
  float heat  = clamp(max(max(crest, core), tt_flare(vSeed)), 0.0, 1.0);

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
      uCentre: u.uCentre,
      uBloom: u.uBloom,
      uMorph: u.uMorph,
      uSphereR: u.uSphereR,
      uBloomR: u.uBloomR,
      uPolySides: u.uPolySides,
      uTime: u.uTime,
      uJitter: u.uJitter,
      uJitSpeed: u.uJitSpeed,
      uSparkStagger: u.uSparkStagger,
      uSparkRate: u.uSparkRate,
      uSparkDensity: u.uSparkDensity,
      uSparkLevel: u.uSparkLevel,
    },
    vertexShader: CAGE_VERT,
    fragmentShader: CAGE_FRAG,
    transparent: true,
    depthWrite: false,
  })
}

const EMBER_VERT = /* glsl */ `
${SHARED_SHAPE_GLSL}
${SPARK_GLSL}
uniform float uFront;
uniform float uSoftness;
uniform float uCoreRadius;
uniform float uCoreStrength;
uniform float uCoreLive;
uniform float uEmberSize;
uniform float uEmberTwinkle;
uniform float uPointRef;
uniform float uGlobalFade;
varying float vHeat;
varying float vTw;

void main() {
  float seed = tt_hash13(position);
  vec3 p = tt_shaped(position, seed);
  float d = tt_frontDist(p, seed);

  float crest = 1.0 - smoothstep(0.0, uSoftness, abs(d - uFront));
  float core  = uCoreStrength * uCoreLive * (1.0 - smoothstep(0.0, uCoreRadius, d));
  vHeat = clamp(max(max(crest, core), tt_flare(seed)), 0.0, 1.0);
  vTw = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * uEmberTwinkle + seed * 19.7));

  // Cull cold embers HERE rather than discarding in the fragment stage. The
  // fragment discard still pays full rasterisation cost, and only a small
  // fraction of the cage is hot at any moment — culling early is the difference
  // between drawing every ember and drawing the handful that are actually lit.
  if (vHeat < 0.06 || uGlobalFade <= 0.001) {
    gl_PointSize = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside clip space
    return;
  }

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // uPointRef is the camera's distance to the logo, so uEmberSize is literally
  // pixels AT the logo's depth, with mild attenuation either side of it.
  //
  // The usual three.js idiom here is a hard-coded 300.0, which assumes a much
  // larger world scale. This scene's camera sits 2.4 units out, so that constant
  // produced ~437px points — thousands of them, additively blended. The clamp is
  // a hard backstop so no camera or config value can ever reproduce that.
  float atten = uPointRef / max(0.05, -mv.z);
  gl_PointSize = clamp(uEmberSize * vTw * atten, 1.0, 24.0);
  gl_Position = projectionMatrix * mv;
}
`

/**
 * Round glowing dots on the same ramp as the wires. Their opacity is gated on
 * local heat, so they cluster around the charge and the sparks rather than
 * peppering the whole cage — which is how the reference reads.
 */
const EMBER_FRAG = /* glsl */ `
uniform vec3  uWarm;
uniform vec3  uHot;
uniform vec3  uCrest;
uniform float uGlobalFade;
uniform float uEmberOpacity;
varying float vHeat;
varying float vTw;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  if (r > 0.5) discard;

  vec3 col = mix(uWarm, uHot, smoothstep(0.10, 0.60, vHeat));
  col = mix(col, uCrest, smoothstep(0.70, 1.00, vHeat));

  float soft = smoothstep(0.5, 0.08, r);
  float a = soft * uEmberOpacity * uGlobalFade * vTw * smoothstep(0.06, 0.35, vHeat);
  if (a <= 0.002) discard;
  gl_FragColor = vec4(col, a);
}
`

/**
 * ADDITIVE, unlike the cage. Embers are pure light — they should bloom over
 * whatever is behind them. The wires use normal blending because they spend
 * most of the transition cold and have to darken the paper; the embers only
 * ever exist where there is heat, so they have nothing to darken.
 */
export function makeEmberMaterial(u: IgnitionUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSeed: u.uSeed,
      uCentre: u.uCentre,
      uSphereR: u.uSphereR,
      uBloomR: u.uBloomR,
      uPolySides: u.uPolySides,
      uBloom: u.uBloom,
      uMorph: u.uMorph,
      uTime: u.uTime,
      uJitter: u.uJitter,
      uJitSpeed: u.uJitSpeed,
      uSparkStagger: u.uSparkStagger,
      uSparkRate: u.uSparkRate,
      uSparkDensity: u.uSparkDensity,
      uSparkLevel: u.uSparkLevel,
      uFront: u.uFront,
      uSoftness: u.uSoftness,
      uCoreRadius: u.uCoreRadius,
      uCoreStrength: u.uCoreStrength,
      uCoreLive: u.uCoreLive,
      uGlobalFade: u.uGlobalFade,
      uEmberSize: u.uEmberSize,
      uEmberTwinkle: u.uEmberTwinkle,
      uEmberOpacity: u.uEmberOpacity,
      uPointRef: u.uPointRef,
      uWarm: u.uWarm,
      uHot: u.uHot,
      uCrest: u.uCrest,
    },
    vertexShader: EMBER_VERT,
    fragmentShader: EMBER_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
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
