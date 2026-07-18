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

**Re-seed from scratch:** delete `tampa-taruno.db`, then:

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

Everything currently seeded is **lorem ipsum placeholder copy** — the owner
hasn't provided real business info/services/project copy yet. Replace via
`/admin`, not by editing seed data (the seed script is for fresh installs
only).

## Assets

All generated/produced assets (logo GLB, textures, hero video, Higgsfield
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

- Base shared JS: ~102 KB gz (budget: < 250 KB).
- three.js lazy chunk (logo only, code-split via `next/dynamic(ssr:false)`):
  ~140 KB gz combined (budget: ≤ 180 KB gz). Never included in the base
  bundle — confirmed by grepping the shared chunks for three.js signatures.
- Hero video: ~0.9 MB mp4 / ~0.3 MB webm (budget: ≤ 3.5 MB).
- Logo GLB (Draco-compressed): 53.7 KB (budget: ≤ 300 KB).
