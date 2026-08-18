// Task 9 Step 2 — the regression test that matters most.
//
// Reproduces, for ignition, the exact race the 2026-08-09 review found in the
// separation: a signal that arrives BEFORE load() resolves must not be dropped.
//
// The race, concretely:
//   video ends            -> introDone
//   +4000ms, load pending -> LogoStage's CANVAS_READY_FALLBACK_MS forces
//                            canvasReady, so `live` goes true and
//                            startIgnition() is called with NO controller yet
//   load() resolves later -> the controller is built; it must honour that
//                            recorded intent, or the bridge never runs and
//                            `armed` + the floating words (both hang off `done`)
//                            are dead forever, with no console error.
//
// STALL ONLY THE .glb. Stalling draco_wasm_wrapper.js / draco_decoder.wasm
// hangs DRACOLoader's own worker bootstrap so the logo never renders at all —
// a documented TEST ARTIFACT that cost an earlier session a false diagnosis.
//
// The test refuses to pass unless it can prove the race was actually
// exercised: LogoStage logs a distinctive error when it takes the fallback
// path, and that message is asserted, not assumed.
import { launch, watchErrors, trackVideoEnd, probeWords, canvasCentre, fresh, meanAbsDiff, ringInk, waitForQuiet, report, BASE } from './t9-lib.mjs'

const STALL_MS = Number(process.argv[2] || 14000)
const OUT = fresh('t9-stall')
const W = 900
const H = 700
const FORCED = '3D canvas never reported ready'

const browser = await launch()
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
const errors = watchErrors(page)

let stalled = null
await page.setRequestInterception(true)
page.on('request', async (req) => {
  if (req.url().includes('logo.draco.glb')) {
    stalled = { url: req.url(), at: Date.now() }
    console.log(`stalling ${req.url()} for ${STALL_MS}ms`)
    setTimeout(() => req.continue().catch(() => {}), STALL_MS)
    return
  }
  req.continue().catch(() => {})
})

const t0 = Date.now()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await trackVideoEnd(page)

await page.waitForFunction('window.__ttEnded === true', { timeout: 45000, polling: 50 })
console.log(`video ended at +${Date.now() - t0}ms`)

// Wait for the fallback path to announce itself. If it never does, the stall
// was too short and this run proves nothing — that is a FAILED test, not a pass.
let forcedAt = null
try {
  await page.waitForFunction(() => true, { timeout: 1 })
} catch {}
const deadline = Date.now() + STALL_MS + 8000
while (Date.now() < deadline) {
  if (errors.some((e) => e.includes(FORCED))) {
    forcedAt = Date.now() - t0
    break
  }
  await new Promise((r) => setTimeout(r, 100))
}
console.log(forcedAt ? `forced-handoff fallback fired at +${forcedAt}ms` : 'forced-handoff fallback NOT seen')

// `cue` fired?  The floating words are DOM elements whose opacity only leaves 0
// when ConstellationField's `active` prop goes true, and that prop is driven by
// LogoStage's onLive — which fires on the ignition's `cue` and nothing else.
let words = { total: 0, lit: 0, max: 0 }
const cueDeadline = Date.now() + 30000
while (Date.now() < cueDeadline) {
  words = await probeWords(page)
  if (words.lit > 0) break
  await new Promise((r) => setTimeout(r, 150))
}
console.log('words:', JSON.stringify(words), `at +${Date.now() - t0}ms`)

const box = await canvasCentre(page)
if (!box) {
  console.log('FAIL — no canvas on the page at all')
  await browser.close()
  process.exit(1)
}

// `done` fired?  `done` is what sets `armed`, and `armed` is what lets a hold
// separate the logo. Measure the hold against a no-hold control over an
// identical window, so the logo's own idle spin cannot be mistaken for a
// separation.
const shot = async (n) => {
  const p = `${OUT}/${n}.png`
  await page.screenshot({ path: p })
  return p
}

// Park the cursor on the logo BEFORE the control window. The engine's deflect
// and tilt follow the cursor anywhere on the page, so moving it only for the
// hold would have made pointer motion — not the button — the difference between
// the two windows. Now the ONLY difference is the button being down, and the
// only thing a press can add is the charge path, which requires `armed`.
await page.mouse.move(box.x, box.y)
await new Promise((r) => setTimeout(r, 700))

// Only start measuring once the bridge has finished and the mark is merely
// idle-spinning; otherwise the control window catches the logo still
// materialising and swamps the difference the test exists to detect.
const quiet = await waitForQuiet(page, OUT, W, H)
console.log(`settled: ${JSON.stringify(quiet)}`)

// Sample a whole window rather than two endpoints: the panels sweep through the
// ring, so the signal is a transient peak, not an end state.
const sampleWindow = async (label, frames = 5) => {
  const ring = []
  const paths = []
  for (let i = 0; i < frames; i++) {
    const p = await shot(`${label}-${i}`)
    paths.push(p)
    ring.push(ringInk(p, W, H, box))
  }
  return { ring, peak: Math.max(...ring), paths }
}

const control = await sampleWindow('control')
await page.mouse.down()
const hold = await sampleWindow('hold')
await page.mouse.up()

const controlDelta = meanAbsDiff(control.paths[0], control.paths.at(-1), W, H)
const holdDelta = meanAbsDiff(hold.paths[0], hold.paths.at(-1), W, H)

console.log(`control ring ink: ${control.ring.map((v) => v.toFixed(4)).join(' ')}  peak ${control.peak.toFixed(4)}`)
console.log(`hold    ring ink: ${hold.ring.map((v) => v.toFixed(4)).join(' ')}  peak ${hold.peak.toFixed(4)}`)
console.log(`whole-frame delta — control ${controlDelta.toFixed(2)}, hold ${holdDelta.toFixed(2)}`)

const fatal = errors.filter((e) => !e.includes(FORCED))
const checks = [
  ['the .glb request was actually intercepted', !!stalled, stalled?.url],
  [
    'the slow-load race was exercised (fallback path taken)',
    forcedAt !== null,
    forcedAt === null ? `raise STALL_MS above ${STALL_MS}` : `+${forcedAt}ms`,
  ],
  ['ignition `cue` fired despite the slow load (words entered)', words.lit > 0, `${words.lit}/${words.total} lit, max opacity ${words.max}`],
  [
    'ignition `done` fired despite the slow load — the hold SEPARATES the logo',
    hold.peak > control.peak * 3 && hold.peak > 0.02,
    `ring ink peak: hold ${hold.peak.toFixed(4)} vs idle-spin control ${control.peak.toFixed(4)}`,
  ],
  ['no unexpected console errors', fatal.length === 0, fatal.slice(0, 3).join(' | ')],
  ['the scene actually settled before measuring', quiet.quiet, `after ${quiet.waited}ms, delta ${quiet.delta.toFixed(2)}`],
]

const failed = report(checks)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
