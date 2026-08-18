/**
 * Assertions for the deterministic cage subsample.
 * Run: npm run verify:config
 *
 * Pure geometry work — no WebGL context needed — so the cage is genuinely
 * unit-testable in Node despite being a three.js module.
 */
import { subsampleSegments } from './cage'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

// 12 segments = 24 vertices = 72 floats
const N = 12
const src = new Float32Array(N * 6)
for (let i = 0; i < N * 6; i++) src[i] = i

const half = subsampleSegments(src, 0.5, 1337)
check('half density keeps ~half the segments', half.length / 6 === Math.round(N * 0.5))
check('output length is a whole number of segments', half.length % 6 === 0)

// determinism: same seed -> byte-identical output
const again = subsampleSegments(src, 0.5, 1337)
check('same seed is deterministic', half.every((v, i) => v === again[i]))

// a different seed picks a different subset (with 12 segments a collision is
// possible in principle; if this ever fails, the seed is being ignored)
const other = subsampleSegments(src, 0.5, 99)
check('different seed picks a different subset', !half.every((v, i) => v === other[i]))

// segments are copied whole — never split across the 6-float boundary
const full = subsampleSegments(src, 1, 1337)
check('density 1 keeps everything', full.length === src.length)
for (let s = 0; s < full.length / 6; s++) {
  const base = full[s * 6]
  check(`segment ${s} copied intact`, full[s * 6 + 1] === base + 1 && full[s * 6 + 5] === base + 5)
}

// a partial subsample must also preserve whole segments: every kept segment's
// six floats have to be consecutive and start on a multiple of 6 in the source
for (let s = 0; s < half.length / 6; s++) {
  const base = half[s * 6]
  const aligned = base % 6 === 0
  let consecutive = true
  for (let k = 1; k < 6; k++) if (half[s * 6 + k] !== base + k) consecutive = false
  check(`subsampled segment ${s} is aligned and intact`, aligned && consecutive)
}

// kept segments come out in ascending source order
let ascending = true
for (let s = 1; s < half.length / 6; s++) {
  if (half[s * 6] <= half[(s - 1) * 6]) ascending = false
}
check('kept segments stay in source order', ascending)

// clamping
check('density 0 yields an empty array', subsampleSegments(src, 0, 1337).length === 0)
check('density above 1 clamps', subsampleSegments(src, 5, 1337).length === src.length)
check('negative density clamps to empty', subsampleSegments(src, -2, 1337).length === 0)

// does not mutate its input
const guard = new Float32Array(src)
subsampleSegments(src, 0.5, 7)
check('input is not mutated', src.every((v, i) => v === guard[i]))

console.log(failures === 0 ? '\nAll cage checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
