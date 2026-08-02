# TAMPA TARUNO — Website

A bilingual (EN/ID) marketing site with a single **Atelier** appearance
(pencil-sketch, hand-drawn logo → rotating 3D graphite). Structure follows a
Synapser-style scroll narrative (numbered nav, manifesto word-scrub,
drag-canvas archive).

Full design spec: [`_PLAN/TAMPA-TARUNO-DUAL-APPEARANCE-DESIGN.md`](../_PLAN/TAMPA-TARUNO-DUAL-APPEARANCE-DESIGN.md)
in the parent `WEBSITE` folder. Build plan: [`_PLAN/TAMPA-TARUNO-BUILD-PLAN.md`](../_PLAN/TAMPA-TARUNO-BUILD-PLAN.md).

## Stack

Next.js 15 (App Router, TS) · Payload CMS 3 (SQLite in dev) · Tailwind v4 +
CSS custom-property tokens · GSAP 3.15 (ScrollTrigger, SplitText,
ScrambleTextPlugin, Draggable, InertiaPlugin, Flip — all free in this GSAP
version) · Lenis · three.js (lazy-loaded, logo only).

## Running locally

```bash
npm install
npm run dev       # http://localhost:3000
```

First run creates `tampa-taruno.db` (SQLite) automatically. Admin panel:
`http://localhost:3000/admin` — login `admin@tampa-taruno.local` /
`tampataruno-2026` (or whatever `SEED_ADMIN_PASSWORD` was set to — **change
the password after first login**).

**Re-seed from scratch:** stop the dev server, delete `tampa-taruno.db`, then
run the commands below — and delete `.next` before starting the server again.
Seeding writes to SQLite behind Next's back, so the revalidate hooks never fire
and pages keep rendering the previous data until the cache is cleared.

```bash
npm run seed          # admin user, settings, statements, services, works, home page (en+id)
npm run seed:verify   # sanity-check counts + a couple of localized values
```

`payload run` doesn't work in non-TTY shells on this machine, so seed/verify
run via `node --env-file=.env --import tsx src/seed/*.ts` instead (see
`package.json`).

## Environment variables

See `.env.example`. Key ones:
- `PAYLOAD_SECRET` — random string, rotate for production.
- `DATABASE_URI` — `file:./tampa-taruno.db` in dev; a Postgres connection
  string in production (see deploy swap below).
- `SEED_ADMIN_PASSWORD` — password for the seeded admin user.
- `NEXT_PUBLIC_SITE_URL` — used for `metadataBase`, OG/canonical URLs,
  sitemap.xml, robots.txt. Defaults to `http://localhost:3000`; **set this to
  the real domain once the owner picks one** (checklist item 6.1).

## Deploy: swapping SQLite → Postgres (Neon)

The DB adapter is isolated to one file, `src/payload.config.ts`. To move to
Postgres/Neon:

```bash
npm i @payloadcms/db-postgres
npm uninstall @payloadcms/db-sqlite
```

```ts
// src/payload.config.ts
import { postgresAdapter } from '@payloadcms/db-postgres'
// ...
db: postgresAdapter({ pool: { connectionString: process.env.DATABASE_URI } }),
```

Set `DATABASE_URI` to the Neon connection string, then run the app once to
let Payload push the schema (or use `payload migrate` for a controlled
migration in production). No other file references the DB adapter.

## Content model

- **Collections:** `works`, `services`, `manifesto-statements`, `pages`
  (block-based: Hero, ManifestoStrip, FeaturedWorks, ServicesRows,
  ArchiveTeaser, ContactMailto, RichText, MediaFull), `media`, `users`.
  - **Hero block** also carries `floatingWords` (localized array, up to 18
    short words) and `constellationEnabled` (checkbox) — the "margin notes"
    constellation tethered to the 3D logo by pencil strings. Editable per
    locale in `/admin`; the hero looks complete without it if disabled/empty.
- **Global:** `site-settings` (nav labels, contact info). The site ships a
  single Atelier appearance — no appearance-switch labels or transition
  kill-switch.
- All text-bearing fields are `localized: true` (`en` default, `id`
  secondary). A page's block **layout** (which blocks, in what order) is
  shared across locales; the text *inside* each block is per-locale.

Seeded content is **real business copy** (bilingual EN/ID), written from the
company documents in the parent workspace — `Tampotaruno/laporan-strategi.md`
(mission, values, brand story, tagline, the three publicly-marketed services)
and the actual project repos (`WorldWideSaaS`, `AgencyOS`, `Samsara Atelier`).
The copy lives in [`src/seed/content.ts`](src/seed/content.ts);
`src/seed/index.ts` only maps it onto the Payload schema.

Two standing constraints on that copy, because the company has no paying
clients yet: no invented metrics, client names or outcome claims, and
`projectCount` counts only verified deliveries (Klinik OS and AI Automation
are legitimately `0`). Durations quoted on the site (30–45 days, two weeks)
come from §4 of the strategy report.

Day-to-day edits go through `/admin`, not the seed script (which is for fresh
installs only). Still placeholder: work cover images (see Assets below) and
the social links in `site-settings` (empty until real accounts exist).

## Assets

The hero intro is **drawn in code**, not played from a file: `SketchIntro`
stroke-draws the real logo outline (paths inlined in
[`src/components/hero/logoPaths.ts`](src/components/hero/logoPaths.ts),
generated from `public/media/logo-full-color.svg`), inks it in the 3D
matcap's own tones, then hands off to the rotating mesh. It sizes itself from
`CALIB` exactly as `LogoEngine` sizes the mesh, so retuning logo placement
means editing `lib/three/calibration.ts` and nothing else. The old stitched
draw-in + Kling extrusion video (`sketch-draw-16x9.mp4`/`.webm`, 2.2 MB) was
deleted in 2026-08 — recover from git history if it's ever wanted back.
`sketch-poster.webp` stays: it's the OG/Twitter share image.

Other generated/produced assets (logo GLB, textures, Higgsfield
outputs) live in `../_ASSETS/` (parent `WEBSITE` folder) with full
provenance — prompts, models, job IDs, verification notes — logged in
[`_ASSETS/asset-manifest.md`](../_ASSETS/asset-manifest.md). Copy shipping
variants into `public/` (already done for the current asset set); don't
regenerate from scratch without checking that manifest first.

Work/archive item cover images are still **placeholder frames** (CSS, no
imagery) pending real project photography (see `H4` in the asset manifest —
blocked on the owner's business info, same as the copy).

## Known scope boundaries (not bugs)

- Hosting/domain undecided — `NEXT_PUBLIC_SITE_URL` is a placeholder.
- `RichText`/`MediaFull` blocks exist in the schema for future admin use but
  aren't exercised by the seeded homepage.
- No booking/pricing/mascot features — those belong to other reference
  plans in `_PLAN/`, not this dual-appearance concept.

## Performance budgets (verified via `npm run build`)

Re-measured 2026-08-02 on a clean `npm run build`. Run the build with the dev
server **stopped** — both write `.next`, and racing them fails the prerender
with a bogus `webpack-runtime` "Cannot read properties of undefined".

- Base shared JS: 102 KB gz (budget: < 250 KB) — unchanged by the hero rework.
- three.js lazy chunk (logo only, code-split via `next/dynamic(ssr:false)`):
  142.6 KB gz combined (budget: ≤ 180 KB gz). Never included in the base
  bundle — confirmed by grepping the shared chunks for three.js signatures.
- Hero intro: no media request at all. The inlined logo paths (17.4 KB raw,
  8.0 KB gz) land in the `/[locale]` route chunk, not the shared base, and
  replaced a 2.2 MB video pair.
- Logo GLB (Draco-compressed): 53.7 KB (budget: ≤ 300 KB).
