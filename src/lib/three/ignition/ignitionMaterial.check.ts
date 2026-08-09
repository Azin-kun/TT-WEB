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
import { makeIgnitionUniforms, patchSkinForIgnition } from './ignitionMaterial'

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
