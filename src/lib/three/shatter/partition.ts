import * as THREE from 'three'
import { SHATTER, mulberry32 } from './types'

/**
 * Tags the logo's geometry so its faces can detach as whole panels, and writes
 * the per-vertex attributes the separation shader reads.
 * Spec: docs/superpowers/specs/2026-08-08-hero-logo-shatter-design.md §5
 *
 * Runs once, right after the GLB loads.
 *
 * There is deliberately NO subdivision here. Frame-by-frame observation of
 * trionn.com (2026-08-08) showed its faces leave as large intact planes, not as
 * fragments — so each cap becomes exactly one panel. For this logo that means
 * four: front and back of the black stroke, front and back of the red one. The
 * extruded side walls are never tagged, so they stay put and read as the hollow
 * body once the caps have gone.
 */

export type PartitionResult = {
  /** centre of the combined bounding box */
  center: THREE.Vector3
  /** height of the combined bounding box, used to scale drift and vibration */
  height: number
  panelCount: number
}

/** 0 = front cap, 1 = back cap, 2 = the curved extruded side band */
const FRONT_CAP = 0
const BACK_CAP = 1
const SIDE_BAND = 2
const KINDS_PER_MESH = 3

type Panel = {
  sumX: number
  sumY: number
  sumZ: number
  count: number
  kind: number
  axis: THREE.Vector3
  spin: number
  delay: number
  spreadMul: number
  lateralX: number
  lateralY: number
}

const IDENTITY = new THREE.Matrix4()

export function partitionForShatter(root: THREE.Object3D, seedValue = 0x7a3b1c): PartitionResult {
  const meshes: THREE.Mesh[] = []
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
  })

  // The shader displaces `position`, which lives in each mesh's OBJECT space —
  // so bake any child transform into the geometry first. That makes mesh-local
  // space identical to root space, which is what lets a single shared uCenter
  // be correct for both meshes.
  for (const mesh of meshes) {
    mesh.updateMatrix()
    if (!mesh.matrix.equals(IDENTITY)) {
      const baked = mesh.geometry.clone().applyMatrix4(mesh.matrix)
      mesh.geometry.dispose()
      mesh.geometry = baked
      mesh.position.set(0, 0, 0)
      mesh.rotation.set(0, 0, 0)
      mesh.scale.set(1, 1, 1)
      mesh.updateMatrix()
    }
  }

  const box = new THREE.Box3()
  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox()
    if (mesh.geometry.boundingBox) box.union(mesh.geometry.boundingBox)
  }
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())

  const rand = mulberry32(seedValue)

  // One panel per (mesh, face kind): front cap, back cap and side band.
  // Every face of the skin leaves — nothing is retained here. What stays behind
  // is a separate intact translucent body, built in LogoEngine.
  const panelCount = meshes.length * KINDS_PER_MESH
  const panels: Panel[] = []
  for (let i = 0; i < panelCount; i++) {
    const axis = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1)
    if (axis.lengthSq() < 1e-6) axis.set(0, 1, 0)
    axis.normalize()
    panels.push({
      sumX: 0,
      sumY: 0,
      sumZ: 0,
      count: 0,
      kind: i % KINDS_PER_MESH,
      axis,
      spin: SHATTER.SPIN_MIN + rand() * (SHATTER.SPIN_MAX - SHATTER.SPIN_MIN),
      delay: SHATTER.SEPARATE_START + rand() * SHATTER.STAGGER_MAX,
      spreadMul: 1 + (rand() * 2 - 1) * SHATTER.SPREAD_VAR,
      lateralX: (rand() * 2 - 1) * SHATTER.LATERAL_DRIFT,
      lateralY: (rand() * 2 - 1) * SHATTER.LATERAL_DRIFT,
    })
  }

  // Pass A — de-index, classify each triangle, accumulate panel centroids.
  const perMesh: {
    mesh: THREE.Mesh
    geo: THREE.BufferGeometry
    panelOf: Int16Array // -1 = side wall, stays put
  }[] = []

  meshes.forEach((mesh, meshIndex) => {
    const src = mesh.geometry
    // Required: a triangle must belong to exactly one panel. With shared
    // vertices, triangles spanning a cap/wall boundary would stretch instead of
    // detaching cleanly.
    const geo = src.index ? src.toNonIndexed() : src.clone()
    if (geo !== src) src.dispose()

    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const triCount = pos.count / 3
    const panelOf = new Int16Array(triCount)

    for (let t = 0; t < triCount; t++) {
      const i = t * 3
      const e1x = pos.getX(i + 1) - pos.getX(i)
      const e1y = pos.getY(i + 1) - pos.getY(i)
      const e1z = pos.getZ(i + 1) - pos.getZ(i)
      const e2x = pos.getX(i + 2) - pos.getX(i)
      const e2y = pos.getY(i + 2) - pos.getY(i)
      const e2z = pos.getZ(i + 2) - pos.getZ(i)
      const nx = e1y * e2z - e1z * e2y
      const ny = e1z * e2x - e1x * e2z
      const nz = e1x * e2y - e1y * e2x
      const nl = Math.hypot(nx, ny, nz) || 1
      const nzn = nz / nl

      const kind =
        Math.abs(nzn) < SHATTER.CAP_NORMAL_MIN ? SIDE_BAND : nzn > 0 ? FRONT_CAP : BACK_CAP
      const p = meshIndex * KINDS_PER_MESH + kind
      panelOf[t] = p
      panels[p].sumX += (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3
      panels[p].sumY += (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3
      panels[p].sumZ += (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3
      panels[p].count++
    }

    perMesh.push({ mesh, geo, panelOf })
  })

  // Pass B — finalise pivots and drift directions.
  const origin = new Float32Array(panelCount * 3)
  const dir = new Float32Array(panelCount * 3)
  panels.forEach((p, i) => {
    if (p.count > 0) {
      origin[i * 3] = p.sumX / p.count
      origin[i * 3 + 1] = p.sumY / p.count
      origin[i * 3 + 2] = p.sumZ / p.count
    } else {
      origin[i * 3] = center.x
      origin[i * 3 + 1] = center.y
      origin[i * 3 + 2] = center.z
    }
    // Caps lift off along the way they face, with a little sideways drift —
    // delamination rather than a radial burst. The side band wraps the stroke
    // and has no single facing, so it opens outward in the plane instead.
    let dx: number
    let dy: number
    let dz: number
    if (p.kind === SIDE_BAND) {
      dx = origin[i * 3] - center.x
      dy = origin[i * 3 + 1] - center.y
      const l = Math.hypot(dx, dy)
      if (l < 1e-4) {
        // stroke sits on the centre — no meaningful radial, so use its own drift
        dx = p.lateralX || 1
        dy = p.lateralY
      } else {
        dx = dx / l + p.lateralX * 0.3
        dy = dy / l + p.lateralY * 0.3
      }
      dz = 0
    } else {
      dx = p.lateralX
      dy = p.lateralY
      dz = p.kind === FRONT_CAP ? 1 : -1
    }
    const L = Math.hypot(dx, dy, dz) || 1
    dir[i * 3] = dx / L
    dir[i * 3 + 1] = dy / L
    dir[i * 3 + 2] = dz / L
  })

  for (const { mesh, geo, panelOf } of perMesh) {
    const vertCount = (geo.getAttribute('position') as THREE.BufferAttribute).count
    const aOrigin = new Float32Array(vertCount * 3)
    const aAxis = new Float32Array(vertCount * 3)
    const aDir = new Float32Array(vertCount * 3)
    const aParams = new Float32Array(vertCount * 4)

    // Every triangle belongs to a panel and every panel leaves — the skin is
    // fully shed. aParams.w stays in the layout so the shader keeps a single
    // code path, but nothing sets it to 0 any more.
    for (let t = 0; t < panelOf.length; t++) {
      const p = panelOf[t]
      const panel = panels[p]
      for (let k = 0; k < 3; k++) {
        const v = t * 3 + k
        aOrigin[v * 3] = origin[p * 3]
        aOrigin[v * 3 + 1] = origin[p * 3 + 1]
        aOrigin[v * 3 + 2] = origin[p * 3 + 2]
        aAxis[v * 3] = panel.axis.x
        aAxis[v * 3 + 1] = panel.axis.y
        aAxis[v * 3 + 2] = panel.axis.z
        aDir[v * 3] = dir[p * 3]
        aDir[v * 3 + 1] = dir[p * 3 + 1]
        aDir[v * 3 + 2] = dir[p * 3 + 2]
        aParams[v * 4] = panel.spin
        aParams[v * 4 + 1] = panel.delay
        aParams[v * 4 + 2] = panel.spreadMul
        aParams[v * 4 + 3] = 1
      }
    }

    geo.setAttribute('aOrigin', new THREE.BufferAttribute(aOrigin, 3))
    geo.setAttribute('aAxis', new THREE.BufferAttribute(aAxis, 3))
    geo.setAttribute('aDir', new THREE.BufferAttribute(aDir, 3))
    geo.setAttribute('aParams', new THREE.BufferAttribute(aParams, 4))
    mesh.geometry = geo
  }

  return { center, height: size.y, panelCount }
}
