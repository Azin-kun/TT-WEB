import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getWorks, getSettings } from '../../../../lib/cms'
import { isLocale, getAlternates } from '../../../../lib/i18n'
import { ArchiveCanvas } from '../../../../components/archive/ArchiveCanvas'

export async function generateMetadata(): Promise<Metadata> {
  return { alternates: getAlternates('/archive'), title: 'Archive' }
}

// 003 Archive (spec base §1.1/§1.3): the complete works live in a drag-to-explore
// surface, separate from the curated homepage selection.
export default async function ArchivePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  const [works, settings] = await Promise.all([getWorks(locale), getSettings(locale)])

  return (
    <ArchiveCanvas
      locale={locale}
      countTemplate={settings.archiveCountTemplate}
      works={works.map((w) => ({
        id: w.id,
        title: w.title,
        slug: w.slug,
        category: w.category,
        year: w.year,
        slot: { x: w.archiveSlot?.x ?? 0, y: w.archiveSlot?.y ?? 0, scale: w.archiveSlot?.scale ?? 1 },
      }))}
    />
  )
}
