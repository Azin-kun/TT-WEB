/* Bilingual lorem seed (owner 2026-07-12: "fill it with Lorem ipsum", real info later).
   Run: npm run seed  — idempotent: exits if users already exist. */
import { getPayload } from 'payload'
import config from '@payload-config'

const lorem = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Sed do eiusmod tempor incididunt ut labore et dolore.',
  'Ut enim ad minim veniam, quis nostrud exercitation.',
  'Duis aute irure dolor in reprehenderit in voluptate.',
  'Excepteur sint occaecat cupidatat non proident.',
  'Sunt in culpa qui officia deserunt mollit anim.',
]
const id = (s: string) => `${s} (ID)` // visibly proves the locale switch until real copy arrives

const run = async () => {
  const payload = await getPayload({ config })

  const existing = await payload.find({ collection: 'users', limit: 1 })
  if (existing.totalDocs > 0) {
    payload.logger.info('Seed skipped — users already exist.')
    process.exit(0)
  }

  // --- admin user ---
  await payload.create({
    collection: 'users',
    data: {
      email: 'admin@tampa-taruno.local',
      password: process.env.SEED_ADMIN_PASSWORD || 'tampataruno-2026',
      role: 'admin',
    },
  })

  // --- site settings (both locales) ---
  await payload.updateGlobal({
    slug: 'site-settings',
    locale: 'en',
    data: {
      siteName: 'TAMPA TARUNO',
      email: 'yuthista@gmail.com',
      locationLine: 'Lorem ipsum — GMT+7',
      timezone: 'Asia/Jakarta',
      socials: [
        { label: 'Instagram', url: 'https://instagram.com/' },
        { label: 'LinkedIn', url: 'https://linkedin.com/' },
      ],
      navLabels: { home: 'Homepage', manifesto: 'Manifesto', archive: 'Archive' },
      archiveCountTemplate: '{{count}} projects in the archive',
      seo: { title: 'TAMPA TARUNO', description: lorem[0] },
    },
  })
  await payload.updateGlobal({
    slug: 'site-settings',
    locale: 'id',
    data: {
      locationLine: 'Kota Lorem — GMT+7',
      navLabels: { home: 'Beranda', manifesto: 'Manifesto', archive: 'Arsip' },
      archiveCountTemplate: '{{count}} proyek dalam arsip',
      seo: { title: 'TAMPA TARUNO', description: id(lorem[0]) },
    },
  })

  // --- manifesto statements ---
  for (let i = 0; i < 6; i++) {
    const doc = await payload.create({
      collection: 'manifesto-statements',
      locale: 'en',
      data: { text: lorem[i], order: i },
    })
    await payload.update({
      collection: 'manifesto-statements',
      id: doc.id,
      locale: 'id',
      data: { text: id(lorem[i]) },
    })
  }

  // --- services (structural names kept; capabilities lorem) ---
  const services = ['Brand Strategy', 'Interface Design', 'Immersive & Motion', 'Engineering']
  for (let i = 0; i < services.length; i++) {
    const caps = (n: number, loc: (s: string) => string) =>
      Array.from({ length: 4 }, (_, k) => ({ item: loc(lorem[(i + k) % 6].slice(0, 42)) }))
    const doc = await payload.create({
      collection: 'services',
      locale: 'en',
      data: { name: services[i], capabilities: caps(i, (s) => s), order: i },
    })
    await payload.update({
      collection: 'services',
      id: doc.id,
      locale: 'id',
      data: { name: services[i], capabilities: caps(i, id) },
    })
  }

  // --- works ×12 (5 featured), deterministic archive scatter ---
  const cats = ['brand', 'web', 'motion', 'engineering'] as const
  for (let i = 0; i < 12; i++) {
    const jx = ((i * 73) % 90) - 45 // deterministic jitter
    const jy = ((i * 37) % 70) - 35
    const doc = await payload.create({
      collection: 'works',
      locale: 'en',
      data: {
        title: `Lorem Project ${String(i + 1).padStart(2, '0')}`,
        slug: `lorem-project-${i + 1}`,
        category: cats[i % 4],
        year: 2022 + (i % 4),
        oneLiner: lorem[i % 6],
        featured: i < 5,
        archiveSlot: {
          x: (i % 4) * 440 - 660 + jx,
          y: Math.floor(i / 4) * 320 - 320 + jy,
          scale: 0.85 + ((i * 29) % 31) / 100,
        },
        order: i,
      },
    })
    await payload.update({
      collection: 'works',
      id: doc.id,
      locale: 'id',
      data: { title: `Proyek Lorem ${String(i + 1).padStart(2, '0')}`, oneLiner: id(lorem[i % 6]) },
    })
  }

  // --- homepage (one shared layout; localized fields inside blocks) ---
  const home = await payload.create({
    collection: 'pages',
    locale: 'en',
    draft: false,
    data: {
      title: 'Homepage',
      slug: 'home',
      _status: 'published',
      layout: [
        {
          blockType: 'hero',
          line1: 'Lorem ipsum dolor sit amet',
          line2: 'Consectetur adipiscing elit, sed do eiusmod tempor',
          locationLine: 'Lorem ipsum — GMT+7',
          scrollCue: 'Scroll to explore',
        },
        { blockType: 'manifestoStrip' },
        { blockType: 'featuredWorks', heading: 'Selected works' },
        { blockType: 'servicesRows', heading: 'Services' },
        { blockType: 'archiveTeaser', countTemplate: '{{count}} projects in the archive' },
        { blockType: 'contactMailto', heading: 'Lorem ipsum dolor?' },
      ],
    },
  })
  // second-locale values for the SAME blocks (match by block id)
  const created = await payload.findByID({ collection: 'pages', id: home.id, depth: 0 })
  const idValues: Record<string, Record<string, string>> = {
    hero: {
      line1: 'Lorem ipsum dolor sit amet (ID)',
      line2: 'Consectetur adipiscing elit, sed do eiusmod (ID)',
      locationLine: 'Kota Lorem — GMT+7',
      scrollCue: 'Gulir untuk menjelajah',
    },
    featuredWorks: { heading: 'Karya pilihan' },
    servicesRows: { heading: 'Layanan' },
    archiveTeaser: { countTemplate: '{{count}} proyek dalam arsip' },
    contactMailto: { heading: 'Lorem ipsum dolor? (ID)' },
  }
  await payload.update({
    collection: 'pages',
    id: home.id,
    locale: 'id',
    draft: false,
    data: {
      title: 'Beranda',
      _status: 'published',
      layout: (created.layout || []).map((b: any) => ({
        ...b,
        ...(idValues[b.blockType] || {}),
      })),
    },
  })

  payload.logger.info('Seed complete: admin user, settings, 6 statements, 4 services, 12 works, homepage (en+id).')
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
