import * as THREE from 'three'
import { SHATTER, type ShatterUniforms } from './types'

/**
 * Patches the pencil matcap materials so the logo's faces peel off on the GPU,
 * and adds the sweeping light wash across them.
 * Spec: docs/superpowers/specs/2026-08-08-hero-logo-shatter-design.md §6
 */

export function makeShatterUniforms(center: THREE.Vector3, spread: number): ShatterUniforms {
  return {
    uBlast: { value: 0 },
    uCenter: { value: center.clone() },
    uSpread: { value: spread },
    uNormalFollow: { value: SHATTER.NORMAL_FOLLOW },
    uHatchStrength: { value: SHATTER.HATCH_STRENGTH },
    uHatchScale: { value: SHATTER.HATCH_SCALE },
    uTime: { value: 0 },
    uShineStrength: { value: SHATTER.SHINE_STRENGTH },
    uShineWidth: { value: SHATTER.SHINE_WIDTH },
    uShineSpeed: { value: SHATTER.SHINE_SPEED },
    uShineBoost: { value: SHATTER.SHINE_CHARGE_BOOST },
    uShineWarm: { value: new THREE.Color(SHATTER.SHINE_WARM) },
    uShineBright: { value: new THREE.Color(SHATTER.SHINE_BRIGHT) },
  }
}

// `PI` is already defined by three's <common> chunk, which we inject after.
const VERT_HELPERS = /* glsl */ `
uniform float uBlast;
uniform vec3  uCenter;
uniform float uSpread;
uniform float uNormalFollow;

attribute vec3 aOrigin;
attribute vec3 aAxis;
attribute vec3 aDir;
attribute vec4 aParams;  // x=spin  y=stagger  z=spreadMul  w=1 if this is a cap face

vec3 tt_rotAxis(vec3 v, vec3 axis, float a){
  float c = cos(a), s = sin(a);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

// aParams.w gates the whole thing: side-wall triangles get 0 and never move,
// which is what leaves the hollow body standing once the caps have gone.
float tt_shardT(){
  return clamp((uBlast - aParams.y) / max(1e-4, 1.0 - aParams.y), 0.0, 1.0) * aParams.w;
}
`

/**
 * Screen-space pencil hatching plus the light wash.
 *
 * Hatching is keyed off gl_FragCoord rather than the surface, because a matcap
 * lookup is driven purely by the view normal — a small flat face samples an
 * almost constant texel and comes out flat. Screen space is also how real
 * pencil behaves: strokes live on the paper, not on the object.
 *
 * The wash is a light orbiting the mark; faces brighten as they turn to meet
 * it, which is what makes the logo read as a material rather than a shape.
 */
const FRAG_HELPERS = /* glsl */ `
uniform float uHatchStrength;
uniform float uHatchScale;
uniform float uTime;
uniform float uShineStrength;
uniform float uShineWidth;
uniform float uShineSpeed;
uniform float uShineBoost;
uniform float uBlast;
uniform vec3  uShineWarm;
uniform vec3  uShineBright;

float tt_ink(vec2 p, float ang, float spacing, float width){
  float c = cos(ang), s = sin(ang);
  float v = (p.x * c + p.y * s) / spacing;
  float d = abs(fract(v) - 0.5) * 2.0;      // 0 at stroke centre
  return 1.0 - smoothstep(width, width + 0.35, d);
}

vec3 tt_hatchify(vec3 col, vec2 frag){
  float lum  = clamp(dot(col, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  float dark = 1.0 - lum;
  vec2  p    = frag / max(0.5, uHatchScale);

  float ink = 0.0;
  ink = max(ink, tt_ink(p,  0.7854, 5.0, 0.30) * smoothstep(0.10, 0.30, dark));
  ink = max(ink, tt_ink(p, -0.6981, 7.0, 0.26) * smoothstep(0.35, 0.55, dark));
  ink = max(ink, tt_ink(p,  1.3963, 9.0, 0.22) * smoothstep(0.60, 0.80, dark));

  return col * (1.0 - ink * uHatchStrength);
}

vec3 tt_shine(vec3 col, vec3 n){
  float a = uTime * uShineSpeed;
  vec3  L = normalize(vec3(cos(a), sin(a) * 0.6, 0.75));
  float s = clamp(dot(normalize(n), L), 0.0, 1.0);
  float band = smoothstep(1.0 - uShineWidth, 1.0, s);
  vec3  tint = mix(uShineWarm, uShineBright, band);
  // The wash flares as the charge builds — on trionn the faces light up well
  // before anything moves, so the light leads and the separation follows.
  float amt  = uShineStrength * (1.0 + uBlast * uShineBoost);
  return mix(col, tint, clamp(band * amt, 0.0, 1.0));
}
`

export function patchForShatter(material: THREE.Material, u: ShatterUniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uBlast: u.uBlast,
      uCenter: u.uCenter,
      uSpread: u.uSpread,
      uNormalFollow: u.uNormalFollow,
      uHatchStrength: u.uHatchStrength,
      uHatchScale: u.uHatchScale,
      uTime: u.uTime,
      uShineStrength: u.uShineStrength,
      uShineWidth: u.uShineWidth,
      uShineSpeed: u.uShineSpeed,
      uShineBoost: u.uShineBoost,
      uShineWarm: u.uShineWarm,
      uShineBright: u.uShineBright,
    })

    // Fragment stage gets its OWN helper block — the vertex helpers declare
    // attributes, which are illegal in a fragment shader. Hatch first, then the
    // wash on top, so the light reads as falling ONTO drawn graphite.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HELPERS}`)
      .replace(
        '#include <opaque_fragment>',
        `outgoingLight = tt_hatchify(outgoingLight, gl_FragCoord.xy);
  outgoingLight = tt_shine(outgoingLight, normal);
  #include <opaque_fragment>`,
      )

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HELPERS}`)
      // The normal is rotated only FRACTIONALLY (uNormalFollow) — rotating it
      // fully is physically exact but swings the matcap lookup across flat
      // regions, which flattens the pencil texture.
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
  objectNormal = tt_rotAxis(objectNormal, aAxis, aParams.x * tt_shardT() * PI * uNormalFollow);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  {
    float ttT = tt_shardT();
    vec3 ttLocal = tt_rotAxis(transformed - aOrigin, aAxis, aParams.x * ttT * PI);
    transformed = aOrigin + ttLocal + aDir * (uSpread * aParams.z * ttT);
  }`,
      )
  }
  material.needsUpdate = true
}
