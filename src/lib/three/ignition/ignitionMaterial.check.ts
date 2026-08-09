/**
 * Assertions for the shader patching.
 * Run: npm run verify:config
 *
 * The hazard this exists for: three exposes exactly ONE onBeforeCompile per
 * material. If patchSkinForIgnition assigned instead of composing, it would
 * silently delete the screen-space hatch, the light wash and the whole panel
 * displacement — with no error, no warning, and nothing failing to compile.
 *
 * onBeforeCompile is a pure string transform, so it can be driven directly
 * against three's real matcap shader source without a WebGL context.
 */
import * as THREE from 'three'
import { DEFAULT_SEPARATION } from '../shatter/types'
import { makeShatterUniforms, patchForShatter } from '../shatter/shatterMaterial'
import { DEFAULT_IGNITION } from './types'
import {
  makeCageMaterial,
  makeEmberMaterial,
  makeIgnitionUniforms,
  patchSkinForIgnition,
} from './ignitionMaterial'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

type FakeShader = {
  uniforms: Record<string, unknown>
  vertexShader: string
  fragmentShader: string
}

const freshShader = (): FakeShader => ({
  uniforms: {},
  vertexShader: THREE.ShaderLib.matcap.vertexShader,
  fragmentShader: THREE.ShaderLib.matcap.fragmentShader,
})

const compile = (m: THREE.Material): FakeShader => {
  const s = freshShader()
  // three calls this with (shader, renderer); the renderer is unused by both patches.
  ;(m.onBeforeCompile as (s: FakeShader, r: unknown) => void).call(m, s, {})
  return s
}

const ignitionUniforms = () =>
  makeIgnitionUniforms(DEFAULT_IGNITION, 1, new THREE.Vector3())
const shatterUniforms = () =>
  makeShatterUniforms(new THREE.Vector3(), 1, DEFAULT_SEPARATION)

// --- ignition alone ---
{
  const m = new THREE.MeshMatcapMaterial()
  patchSkinForIgnition(m, ignitionUniforms())
  const s = compile(m)
  check('ignition alone: wake helper injected', s.fragmentShader.includes('tt_ignWake'))
  check('ignition alone: alpha multiplied', s.fragmentShader.includes('diffuseColor.a *= tt_ignWake();'))
  check('ignition alone: varying declared in vertex', s.vertexShader.includes('varying float vIgnDist;'))
  check('ignition alone: varying assigned in vertex', s.vertexShader.includes('vIgnDist = distance(position, uSeed);'))
  check('ignition alone: uniforms merged', 'uFront' in s.uniforms && 'uWakeActive' in s.uniforms)
  check('ignition alone: cache key set', m.customProgramCacheKey() === 'tt-ignition-1')
}

// --- the composition hazard: shatter THEN ignition ---
{
  const m = new THREE.MeshMatcapMaterial()
  patchForShatter(m, shatterUniforms(), DEFAULT_SEPARATION)
  patchSkinForIgnition(m, ignitionUniforms())
  const s = compile(m)

  // shatter's work must survive
  check('composed: hatch survives', s.fragmentShader.includes('tt_hatchify'))
  check('composed: light wash survives', s.fragmentShader.includes('tt_shine'))
  check('composed: vertex displacement survives', s.vertexShader.includes('tt_shardT'))
  check('composed: shatter uniforms survive', 'uBlast' in s.uniforms && 'uHatchStrength' in s.uniforms)

  // ignition's work must also be present
  check('composed: wake helper injected', s.fragmentShader.includes('tt_ignWake'))
  check('composed: wake alpha applied', s.fragmentShader.includes('diffuseColor.a *= tt_ignWake();'))
  check('composed: ignition uniforms merged', 'uFront' in s.uniforms && 'uSeed' in s.uniforms)

  // the wake must read the UNDISPLACED position, not the shatter-displaced one
  check(
    'composed: wake distance uses position, not transformed',
    s.vertexShader.includes('vIgnDist = distance(position, uSeed);'),
  )

  // both patches must have injected exactly once
  const count = (h: string, n: string) => h.split(n).length - 1
  check('composed: wake alpha injected once', count(s.fragmentShader, 'diffuseColor.a *= tt_ignWake();') === 1)
  check('composed: shatter opaque hook injected once', count(s.fragmentShader, 'tt_hatchify(outgoingLight') === 1)
}

// --- morph cage geometry (spec §2b.2) ---
{
  const logoRadius = 10
  const u = makeIgnitionUniforms(DEFAULT_IGNITION, 20, new THREE.Vector3(1, 2, 3), logoRadius)
  check('sphere radius is logoRadius * SPHERE_SCALE',
    Math.abs(u.uSphereR.value - logoRadius * DEFAULT_IGNITION.SPHERE_SCALE) < 1e-9)

  // BLOOM_SCALE is the cage's TOTAL extent against the LOGO, and must land on
  // the polygon's CORNERS. tt_polyR peaks at 1/cos(pi/N), so the stored inradius
  // times that peak has to equal logoRadius * BLOOM_SCALE exactly.
  const corner = u.uBloomR.value / Math.cos(Math.PI / DEFAULT_IGNITION.POLY_SIDES)
  check('bloomed corners land at logoRadius * BLOOM_SCALE',
    Math.abs(corner - logoRadius * DEFAULT_IGNITION.BLOOM_SCALE) < 1e-9)
  // The whole point of the owner's reparameterisation: the slider value IS the
  // total, not a factor to be multiplied by the sphere.
  check('total extent equals the BLOOM_SCALE slider exactly',
    Math.abs(corner / logoRadius - DEFAULT_IGNITION.BLOOM_SCALE) < 1e-9)
  check('cage never starts larger than it ends',
    u.uSphereR.value <= corner + 1e-9)

  check('centre uniform carries the logo centre', u.uCentre.value.x === 1 && u.uCentre.value.z === 3)
  check('polySides forwarded', u.uPolySides.value === DEFAULT_IGNITION.POLY_SIDES)
  // Defaults must reproduce the pre-overlay behaviour exactly: cage at the
  // logo's true shape, no bloom.
  check('morph defaults to home (1)', u.uMorph.value === 1)
  check('bloom defaults to sphere (0)', u.uBloom.value === 0)
}

// The cage shader must carry the morph and expose its uniforms.
{
  const u = makeIgnitionUniforms(DEFAULT_IGNITION, 20, new THREE.Vector3(), 10)
  const m = makeCageMaterial(u)
  const src = m.vertexShader
  check('cage vertex shader has the polygon radius helper', src.includes('tt_polyR'))
  check('cage vertex shader morphs', src.includes('uMorph') && src.includes('uBloom'))
  // The front must be measured on the MORPHED position, never the raw attribute,
  // or the charge would sweep where the logo will end up rather than where the
  // cage currently is.
  check('charge front measured on the morphed position', src.includes('tt_frontDist(finalPos'))
  check('front distance never uses the raw attribute', !src.includes('tt_frontDist(position'))
  for (const k of ['uCentre', 'uBloom', 'uMorph', 'uSphereR', 'uBloomR', 'uPolySides'])
    check(`cage material exposes ${k}`, k in m.uniforms)
}

// --- living cage: writhe, ragged front, random flares (spec §2c) ---
{
  const u = makeIgnitionUniforms(DEFAULT_IGNITION, 20, new THREE.Vector3(), 10)
  const cage = makeCageMaterial(u)
  const ember = makeEmberMaterial(u)

  check('wires writhe off a per-vertex hash', cage.vertexShader.includes('tt_hash13(position)'))
  check('writhe is time-driven', cage.vertexShader.includes('uTime * uJitSpeed'))
  check('front is randomly staggered per vertex', cage.vertexShader.includes('uSparkStagger'))
  check('cage sparks independently of the front', cage.fragmentShader.includes('tt_flare(vSeed)'))

  check('jitter scaled by logo radius',
    Math.abs(u.uJitter.value - DEFAULT_IGNITION.WIRE_JITTER * 10) < 1e-9)
  check('spark stagger scaled by logo radius',
    Math.abs(u.uSparkStagger.value - DEFAULT_IGNITION.SPARK_STAGGER * 10) < 1e-9)
  check('sparks start at idle level, not full', u.uSparkLevel.value === DEFAULT_IGNITION.SPARK_IDLE)

  // Embers must run the SAME shape function as the wires, or they drift out of
  // register with the cage during the bloom and morph.
  check('embers reuse the shared shape function', ember.vertexShader.includes('tt_shaped(position, seed)'))
  check('embers reuse the shared front distance', ember.vertexShader.includes('tt_frontDist(p, seed)'))
  check('embers twinkle', ember.vertexShader.includes('uEmberTwinkle'))
  check('embers gate opacity on heat', ember.fragmentShader.includes('smoothstep(0.06, 0.35, vHeat)'))

  // Blending differs on purpose: wires spend most of the transition cold and
  // must darken the paper; embers are pure light.
  check('embers blend additively', ember.blending === THREE.AdditiveBlending)
  check('cage does NOT blend additively', cage.blending !== THREE.AdditiveBlending)

  for (const k of ['uTime', 'uJitter', 'uSparkLevel', 'uEmberSize', 'uEmberOpacity'])
    check(`ember material exposes ${k}`, k in ember.uniforms)
}

// --- negative control: prove the composition assertions above can actually
// fail. Simulate the bug by ASSIGNING onBeforeCompile the way a naive patch
// would, and confirm the shatter work disappears. Without this, the "composed:
// hatch survives" checks could be passing vacuously.
{
  const m = new THREE.MeshMatcapMaterial()
  patchForShatter(m, shatterUniforms(), DEFAULT_SEPARATION)
  const u = ignitionUniforms()
  m.onBeforeCompile = (shader: FakeShader) => {
    Object.assign(shader.uniforms, { uFront: u.uFront })
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <alphatest_fragment>',
      'diffuseColor.a *= 1.0;\n  #include <alphatest_fragment>',
    )
  }
  const s = compile(m)
  check('negative control: assigning DOES destroy the hatch', !s.fragmentShader.includes('tt_hatchify'))
  check('negative control: assigning DOES destroy the displacement', !s.vertexShader.includes('tt_shardT'))
  check('negative control: assigning DOES drop shatter uniforms', !('uBlast' in s.uniforms))
}

// --- a missing anchor must THROW, never silently no-op ---
{
  const m = new THREE.MeshMatcapMaterial()
  patchSkinForIgnition(m, ignitionUniforms())
  let threw = false
  try {
    const s: FakeShader = { uniforms: {}, vertexShader: 'void main(){}', fragmentShader: 'void main(){}' }
    ;(m.onBeforeCompile as (s: FakeShader, r: unknown) => void).call(m, s, {})
  } catch {
    threw = true
  }
  check('missing anchor throws rather than silently no-opping', threw)
}

// --- idempotence of the uniform wiring across recompiles ---
{
  const m = new THREE.MeshMatcapMaterial()
  patchForShatter(m, shatterUniforms(), DEFAULT_SEPARATION)
  patchSkinForIgnition(m, ignitionUniforms())
  const a = compile(m)
  const b = compile(m)
  check('recompile is stable (fragment)', a.fragmentShader === b.fragmentShader)
  check('recompile is stable (vertex)', a.vertexShader === b.vertexShader)
}

console.log(
  failures === 0 ? '\nAll ignition material checks passed.' : `\n${failures} check(s) FAILED.`,
)
process.exit(failures === 0 ? 0 : 1)
