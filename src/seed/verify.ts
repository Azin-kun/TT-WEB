import { getPayload } from 'payload'
import config from '@payload-config'

const run = async () => {
  const payload = await getPayload({ config })
  const counts: Record<string, number> = {}
  for (const c of ['users', 'works', 'services', 'manifesto-statements', 'pages'] as const) {
    counts[c] = (await payload.find({ collection: c, limit: 0 })).totalDocs
  }
  const settings = await payload.findGlobal({ slug: 'site-settings', locale: 'en' })
  const homeId = await payload.find({
    collection: 'pages',
    where: { slug: { equals: 'home' } },
    locale: 'id',
    limit: 1,
  })
  console.log(JSON.stringify({
    counts,
    siteName: settings?.siteName,
    homeTitleId: homeId.docs[0]?.title,
    homeBlocks: (homeId.docs[0]?.layout || []).map((b: any) => b.blockType),
  }, null, 2))
  process.exit(0)
}

run().catch((e) => { console.error(e); process.exit(1) })
