import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getWork, getWorks } from '../../../../../lib/cms'
import { isLocale, getAlternates } from '../../../../../lib/i18n'
import { PlaceholderFrame } from '../../../../../components/blocks/PlaceholderFrame'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const work = await getWork(slug, locale)
  if (!work) return {}
  return {
    title: work.title,
    description: work.oneLiner || undefined,
    alternates: getAlternates(`/work/${slug}`),
  }
}

export default async function WorkPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()

  const [work, allWorks] = await Promise.all([getWork(slug, locale), getWorks(locale)])
  if (!work) notFound()

  const idx = allWorks.findIndex((w) => w.slug === slug)
  const prev = idx > 0 ? allWorks[idx - 1] : allWorks[allWorks.length - 1]
  const next = idx >= 0 && idx < allWorks.length - 1 ? allWorks[idx + 1] : allWorks[0]

  return (
    <div>
      <section style={{ paddingTop: 'clamp(96px, 14vw, 160px)' }}>
        <div className="tt-container">
          <span style={{ fontSize: '0.8125rem', color: 'var(--accent)', letterSpacing: '0.06em' }}>
            {work.category} — {work.year}
          </span>
          <h1 className="tt-display" style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)', marginTop: '0.25em', maxWidth: '18ch' }}>
            {work.title}
          </h1>
          {work.oneLiner ? (
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--muted)', maxWidth: '48ch', marginTop: '1em' }}>
              {work.oneLiner}
            </p>
          ) : null}
        </div>
      </section>

      <section className="tt-container" style={{ paddingBlock: 'var(--section-gap)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'clamp(16px, 2.5vw, 32px)' }}>
          <PlaceholderFrame aspectRatio="16 / 9" label={work.category} />
          <PlaceholderFrame aspectRatio="3 / 2" label={work.category} />
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--line)' }}>
        <div className="tt-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <Link href={`/${locale}/work/${prev.slug}`} className="tt-work-nav" style={{ padding: '32px 0', textDecoration: 'none' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>← {locale === 'id' ? 'Sebelumnya' : 'Previous'}</span>
            <p className="tt-display tt-work-nav-title" style={{ fontSize: 'clamp(1.25rem, 3vw, 2rem)', marginTop: '0.3em' }}>
              {prev.title}
            </p>
          </Link>
          <Link
            href={`/${locale}/work/${next.slug}`}
            className="tt-work-nav"
            style={{ padding: '32px 0', textDecoration: 'none', textAlign: 'right' }}
          >
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{locale === 'id' ? 'Berikutnya' : 'Next'} →</span>
            <p className="tt-display tt-work-nav-title" style={{ fontSize: 'clamp(1.25rem, 3vw, 2rem)', marginTop: '0.3em' }}>
              {next.title}
            </p>
          </Link>
        </div>
      </footer>
      <style>{`.tt-work-nav:hover .tt-work-nav-title { font-style: italic; }`}</style>
    </div>
  )
}
