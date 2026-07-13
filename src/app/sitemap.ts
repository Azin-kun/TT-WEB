import type { MetadataRoute } from 'next'
import { getWorks, locales } from '../lib/cms'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths = ['', '/manifesto', '/archive']
  const entries: MetadataRoute.Sitemap = []

  for (const locale of locales) {
    for (const path of staticPaths) {
      entries.push({ url: `${SITE_URL}/${locale}${path}`, changeFrequency: 'monthly' })
    }
    const works = await getWorks(locale)
    for (const work of works) {
      entries.push({ url: `${SITE_URL}/${locale}/work/${work.slug}`, changeFrequency: 'yearly' })
    }
  }

  return entries
}
