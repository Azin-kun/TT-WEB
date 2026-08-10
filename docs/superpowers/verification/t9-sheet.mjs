// Task 9 Step 1 — contact-sheet the whole transition.
//
// Capture starts BEFORE the video ends, because the cage now blooms as a sphere
// over the still-playing video (the overlay phase); starting at `ended` misses
// it entirely. Frames are tiled into one sheet before being looked at — single
// screenshots hid real defects twice last session (the ~70 degree oblique
// handoff, and the sphere-projection chords) that were obvious side by side.
import { launch, watchErrors, fresh, report, BASE } from './t9-lib.mjs'
import ffmpeg from 'ffmpeg-static'
import { execFileSync } from 'node:child_process'
import { readdirSync, writeFileSync } from 'node:fs'

const LEAD_S = Number(process.argv[2] || 2.0) // seconds before video end to start
const DURATION_MS = Number(process.argv[3] || 4200)
const OUT = fresh('t9-shots')
const SHEET = process.argv[4] || 't9-sheet.png'
const W = 900
const H = 700

const browser = await launch()
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
const errors = watchErrors(page)

await page.goto(BASE, { waitUntil: 'domcontentloaded' })

// Fire once the video is within LEAD_S of its end. `duration` is NaN until
// metadata lands, so guard for it rather than comparing against NaN forever.
await page.evaluate((lead) => {
  window.__ttNear = false
  const attach = () => {
    const v = document.querySelector('video')
    if (!v) return setTimeout(attach, 40)
    const test = () => {
      if (window.__ttNear) return
      if (!Number.isFinite(v.duration)) return
      if (v.currentTime >= v.duration - lead) window.__ttNear = true
    }
    v.addEventListener('timeupdate', test)
    v.addEventListener('ended', () => {
      window.__ttNear = true
    })
    v.addEventListener('error', () => {
      window.__ttNear = true
    })
    setInterval(test, 40)
  }
  attach()
}, LEAD_S)

await page.waitForFunction('window.__ttNear === true', { timeout: 45000, polling: 30 })
console.log(`within ${LEAD_S}s of video end — capturing`)

// page.screenshot() costs ~360ms per frame against this scene under software
// rasterisation — far too coarse to read a 2s transition. CDP screencast
// delivers frames as the compositor produces them instead.
const client = await page.createCDPSession()
let i = 0
const t0 = Date.now()
client.on('Page.screencastFrame', async ({ data, sessionId }) => {
  if (Date.now() - t0 < DURATION_MS) {
    writeFileSync(`${OUT}/f${String(i).padStart(3, '0')}.jpg`, Buffer.from(data, 'base64'))
    i++
  }
  await client.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})
await client.send('Page.startScreencast', {
  format: 'jpeg',
  quality: 85,
  maxWidth: W,
  maxHeight: H,
  everyNthFrame: 1,
})
await new Promise((r) => setTimeout(r, DURATION_MS + 300))
await client.send('Page.stopScreencast').catch(() => {})

const elapsed = Date.now() - t0
console.log(`captured ${i} frames over ${elapsed}ms (~${Math.round(elapsed / Math.max(1, i))}ms apart)`)

const count = readdirSync(OUT).filter((f) => f.endsWith('.jpg')).length
const cols = 6
const rows = Math.ceil(count / cols)
execFileSync(
  ffmpeg,
  [
    '-y', '-v', 'error',
    '-framerate', '1',
    '-i', `${OUT}/f%03d.jpg`,
    '-vf',
    `scale=380:-2,drawtext=fontfile='C\\:/Windows/Fonts/arialbd.ttf':text='%{n}':x=6:y=6:fontsize=26:fontcolor=red:box=1:boxcolor=white@0.9,tile=${cols}x${rows}:padding=3:color=0x333333`,
    '-frames:v', '1',
    SHEET,
  ],
  { stdio: 'inherit' },
)
console.log(`sheet written: ${SHEET} (${cols}x${rows}, ${count} frames)`)

const failed = report([
  ['captured a usable number of frames', i >= 20, `${i} frames`],
  ['no console errors during the transition', errors.length === 0, errors.slice(0, 3).join(' | ')],
])
await browser.close()
process.exit(failed === 0 ? 0 : 1)
