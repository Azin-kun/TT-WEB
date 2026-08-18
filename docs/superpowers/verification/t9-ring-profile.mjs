// Quantifies what "a cage is on screen" actually measures, so the reduced-motion
// test's "no cage" threshold is calibrated against observed data rather than
// guessed. Runs over the frames the contact-sheet capture already produced.
import { ringInk, inkFraction } from './t9-lib.mjs'
import { readdirSync } from 'node:fs'

const DIR = process.argv[2] || 't9-shots'
const W = 900
const H = 700
const centre = { x: W / 2, y: H / 2 }

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.jpg'))
  .sort()

const vals = []
for (let i = 0; i < files.length; i += 4) {
  vals.push({
    frame: i,
    ring: ringInk(`${DIR}/${files[i]}`, W, H, centre),
    // Centre crop: this is where the cage lives. The cage blooms to roughly the
    // mark's own extent, so it densifies the middle rather than reaching the ring.
    core: inkFraction(`${DIR}/${files[i]}`, W, H, 0.5),
  })
}
for (const v of vals) {
  console.log(`f${String(v.frame).padStart(3, '0')}  ring ${v.ring.toFixed(4)}  core ${v.core.toFixed(4)}`)
}
const settledCore = vals.at(-1).core
console.log('\npeak ring ink:', Math.max(...vals.map((v) => v.ring)).toFixed(4))
console.log('peak core ink:', Math.max(...vals.map((v) => v.core)).toFixed(4))
console.log('settled core ink:', settledCore.toFixed(4))
console.log('cage densification (peak core / settled core):', (Math.max(...vals.map((v) => v.core)) / settledCore).toFixed(2) + 'x')
