// Isolates the orbiting-orbs animation from the reference clip.
//
// The clip is a laptop mockup of an unrelated coffee site, so most of the frame
// is a STATIC photograph (robotic hand + bean). Two composites separate signal
// from backdrop:
//   lighten  = per-pixel max across frames -> every position an orb ever
//              occupied, i.e. the full orbit paths drawn out at once
//   motion   = per-pixel max deviation from the per-pixel median -> only the
//              things that actually move, with the static photo subtracted
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'
import { readdirSync, writeFileSync } from 'node:fs'

const DIR = 'orb-frames'
const W = 368
const H = 368
const FIRST = Number(process.argv[2] || 1)
const LAST = Number(process.argv[3] || 30)

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.png'))
  .sort()
  .slice(FIRST - 1, LAST)

console.log(`analysing ${files.length} frames: ${files[0]} .. ${files.at(-1)}`)

const frames = files.map((f) =>
  execFileSync(ffmpeg, ['-v', 'error', '-i', `${DIR}/${f}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
    maxBuffer: 1 << 28,
  }),
)

const n = W * H * 3
const lighten = Buffer.alloc(n)
const motion = Buffer.alloc(n)
const median = Buffer.alloc(n)

const scratch = new Uint8Array(frames.length)
for (let i = 0; i < n; i++) {
  let max = 0
  for (let f = 0; f < frames.length; f++) {
    const v = frames[f][i]
    scratch[f] = v
    if (v > max) max = v
  }
  lighten[i] = max
  const sorted = Array.from(scratch).sort((a, b) => a - b)
  const med = sorted[sorted.length >> 1]
  median[i] = med
  let dev = 0
  for (let f = 0; f < frames.length; f++) {
    const d = Math.abs(frames[f][i] - med)
    if (d > dev) dev = d
  }
  // amplified, since the clip is dark and heavily compressed
  motion[i] = Math.min(255, dev * 4)
}

const write = (name, buf) => {
  writeFileSync(`${name}.raw`, buf)
  execFileSync(ffmpeg, [
    '-y', '-v', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', `${name}.raw`,
    '-frames:v', '1', `${name}.png`,
  ])
  console.log(`wrote ${name}.png`)
}

write('orb-lighten', lighten)
write('orb-motion', motion)
write('orb-median', median)
