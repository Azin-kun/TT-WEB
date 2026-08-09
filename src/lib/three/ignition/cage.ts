import * as THREE from 'three'
import { mulberry32 } from '../shatter/types'
import type { IgnitionConfig } from './types'

/**
 * The dense scribble cage that carries the charge.
 * Spec: docs/superpowers/specs/2026-08-09-hero-ignition-design.md §3.4
 *
 * WireframeGeometry, not EdgesGeometry. EdgesGeometry only emits an edge where
 * adjacent face normals differ by more than a threshold, so the extruded logo's
 * FLAT front and back caps would come out nearly empty and only the curved side
 * band would be dense — an outline with a dense rim, not a cage.
 *
 * The result is then subsampled: it is the mobile budget knob, it keeps the
 * segment count near ~30k, and a PARTIAL wireframe reads as pencil scribble
 * where a complete one reads as CAD.
 */

/**
 * Keeps `density` of the segments, chosen deterministically from `seed`.
 * Operates on whole segments — 6 floats, two endpoints — never splitting one.
 * Does not mutate `positions`.
 */
export function subsampleSegments(
  positions: Float32Array,
  density: number,
  seed: number,
): Float32Array {
  const segCount = Math.floor(positions.length / 6)
  const d = Math.min(1, Math.max(0, density))
  const keep = Math.round(segCount * d)
  if (keep <= 0) return new Float32Array(0)
  if (keep >= segCount) return positions.slice()

  // Partial Fisher-Yates over an index array: an unbiased sample of exactly
  // `keep` segments, without the clustering a plain `rand() < d` test produces.
  const idx = new Uint32Array(segCount)
  for (let i = 0; i < segCount; i++) idx[i] = i
  const rand = mulberry32(seed)
  for (let i = 0; i < keep; i++) {
    const j = i + Math.floor(rand() * (segCount - i))
    const t = idx[i]
    idx[i] = idx[j]
    idx[j] = t
  }

  // Sorted so the output order is stable and cache-friendly.
  const chosen = Array.from(idx.slice(0, keep)).sort((a, b) => a - b)
  const out = new Float32Array(keep * 6)
  for (let i = 0; i < keep; i++) {
    const s = chosen[i] * 6
    out.set(positions.subarray(s, s + 6), i * 6)
  }
  return out
}

/**
 * Builds one LineSegments covering every mesh under `source`, expressed in
 * `source`'s local space, so it can be added to the logo group and inherit the
 * idle spin, tilt and shake.
 *
 * Returns null when nothing was produced (no meshes, or density 0).
 */
export function buildIgnitionCage(
  source: THREE.Object3D,
  config: IgnitionConfig,
  density: number,
  material: THREE.Material,
): THREE.LineSegments | null {
  // Relative transforms below read matrixWorld on both the source and each
  // mesh; a stale matrix would silently offset the whole cage.
  source.updateMatrixWorld(true)

  const chunks: Float32Array[] = []
  const sourceInverse = new THREE.Matrix4().copy(source.matrixWorld).invert()

  source.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return

    const wire = new THREE.WireframeGeometry(mesh.geometry)
    const attr = wire.getAttribute('position') as THREE.BufferAttribute
    const raw = new Float32Array(attr.array as ArrayLike<number>)

    // Bake each mesh's own transform relative to `source`, so a single
    // LineSegments sitting at the group's origin lands on every sub-mesh.
    const m = new THREE.Matrix4().multiplyMatrices(sourceInverse, mesh.matrixWorld)
    const v = new THREE.Vector3()
    for (let i = 0; i < raw.length; i += 3) {
      v.set(raw[i], raw[i + 1], raw[i + 2]).applyMatrix4(m)
      raw[i] = v.x
      raw[i + 1] = v.y
      raw[i + 2] = v.z
    }

    chunks.push(subsampleSegments(raw, density, config.CAGE_SEED))
    wire.dispose()
  })

  const total = chunks.reduce((n, c) => n + c.length, 0)
  if (total === 0) return null

  const merged = new Float32Array(total)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.length
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(merged, 3))

  const lines = new THREE.LineSegments(geo, material)
  lines.renderOrder = 3 // above the skin (2) and the ghost body (0/1)
  lines.frustumCulled = false
  return lines
}
