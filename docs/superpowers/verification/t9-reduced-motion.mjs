// Task 9 Step 3 — reduced motion.
//
// Under `prefers-reduced-motion: reduce`, LogoCanvas calls setInteractive(false)
// BEFORE load(), so LogoEngine skips its whole interactive block: no partition,
// no shatter controller, and no ignition controller or cage. It then calls
// finishIgnitionNow() immediately, which emits seed, cue and done in one
// synchronous pass — because `armed` and the floating words both hang off
// `done`, and a hero that silently never finishes its transition is the failure
// this guards against.
//
// Asserts: the solid logo is reached, the floating words still enter (a direct
// observation that `cue` fired, and therefore that the same synchronous
// emission delivered `done`), and nothing animates a cage in between.
import { launch, watchErrors, probeWords, canvasCentre, fresh, meanAbsDiff, inkFraction, waitForQuiet, report, BASE } from './t9-lib.mjs'

const OUT = fresh('t9-reduced')
const W = 900
const H = 700

const browser = await launch()
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
const errors = watchErrors(page)

// Set before navigation so the very first matchMedia read in LogoCanvas sees it.
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])

const t0 = Date.now()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

const reduced = await page.evaluate(
  () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
)

// Wait for the words, which cannot light until `cue` has fired.
let words = { total: 0, lit: 0, max: 0 }
const deadline = Date.now() + 20000
while (Date.now() < deadline) {
  words = await probeWords(page)
  if (words.lit > 0) break
  await new Promise((r) => setTimeout(r, 100))
}
const wordsAt = Date.now() - t0
console.log('words:', JSON.stringify(words), `at +${wordsAt}ms`)

// Sample the window in which the bridge would otherwise be running. Measure
// only after the page's own entrance has settled, or the logo fading in is
// mistaken for something igniting.
const settled = await waitForQuiet(page, OUT, W, H)
console.log('settled:', JSON.stringify(settled))

const frames = []
for (let i = 0; i < 12; i++) {
  const p = `${OUT}/f${String(i).padStart(2, '0')}.png`
  await page.screenshot({ path: p })
  frames.push(p)
  await new Promise((r) => setTimeout(r, 250))
}
const deltas = frames.slice(1).map((f, i) => meanAbsDiff(frames[i], f, W, H))
const maxDelta = Math.max(...deltas)

// The cage's measured signature is densification of the centre: with the cage
// up, core ink hits 1.73x its settled value (0.512 vs 0.297, profiled from the
// real transition). The settled idle spin only modulates it by ~9%. So a run
// that never exceeds 1.35x never drew a cage.
const cores = frames.map((f) => inkFraction(f, W, H, 0.5))
const sorted = [...cores].sort((a, b) => a - b)
const medianCore = sorted[Math.floor(sorted.length / 2)]
const coreSwing = Math.max(...cores) / medianCore

console.log('frame-to-frame deltas:', deltas.map((d) => d.toFixed(2)).join(' '))
console.log('core ink:', cores.map((c) => c.toFixed(4)).join(' '))
console.log(`core swing: ${coreSwing.toFixed(2)}x (a cage measures 1.73x)`)

const state = await page.evaluate(() => {
  const v = document.querySelector('video')
  const c = document.querySelector('canvas')
  return {
    video: v ? { paused: v.paused, ended: v.ended, currentTime: v.currentTime } : null,
    canvas: c ? { w: c.width, h: c.height } : null,
  }
})
console.log('state:', JSON.stringify(state))
const box = await canvasCentre(page)

const checks = [
  ['prefers-reduced-motion is actually emulated', reduced === true],
  ['the logo canvas exists and has a backing store', !!state.canvas && state.canvas.w > 0, JSON.stringify(state.canvas)],
  ['the canvas occupies real layout space', !!box && box.w > 100 && box.h > 100, box ? `${Math.round(box.w)}x${Math.round(box.h)}` : 'none'],
  ['the sketch video is skipped entirely', !!state.video && state.video.paused && state.video.currentTime === 0, JSON.stringify(state.video)],
  [
    'ignition `cue` fired, and early — via the immediate path, not a bridge',
    words.lit === words.total && words.max > 0.8 && wordsAt < 8000,
    `${words.lit}/${words.total} lit at opacity ${words.max} by +${wordsAt}ms`,
  ],
  ['nothing ignites — no cage is ever drawn', coreSwing < 1.35, `core swing ${coreSwing.toFixed(2)}x vs 1.73x for a real cage`],
  ['no transition burst in the bridge window', maxDelta < 25, `max frame delta ${maxDelta.toFixed(2)}`],
  ['no console errors', errors.length === 0, errors.slice(0, 3).join(' | ')],
]

const failed = report(checks)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
