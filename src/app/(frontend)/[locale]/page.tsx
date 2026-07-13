import { notFound } from 'next/navigation'
import { getPage, getSettings } from '../../../lib/cms'
import { isLocale } from '../../../lib/i18n'
import { RenderBlocks } from '../../../components/blocks/RenderBlocks'

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  const [page, settings] = await Promise.all([getPage('home', locale), getSettings(locale)])
  if (!page) notFound()

  return <RenderBlocks blocks={page.layout || []} locale={locale} settings={settings} />
}
