import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getManifesto, getSettings } from '../../../../lib/cms'
import { isLocale } from '../../../../lib/i18n'
import { getAlternates } from '../../../../lib/i18n'
import { ManifestoStrip } from '../../../../components/blocks/ManifestoStrip'
import { PlaceholderFrame } from '../../../../components/blocks/PlaceholderFrame'

export async function generateMetadata(): Promise<Metadata> {
  return { alternates: getAlternates('/manifesto'), title: 'Manifesto' }
}

// 002 Manifesto (spec base §1.1): the full poetic statement sequence gets its
// own destination, followed by studio facts and culture imagery.
export default async function ManifestoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  const [statements, settings] = await Promise.all([getManifesto(locale), getSettings(locale)])

  const facts = [
    { label: locale === 'id' ? 'Didirikan' : 'Founded', value: '2026' },
    { label: locale === 'id' ? 'Berbasis di' : 'Based in', value: settings.locationLine || 'Surakarta, ID' },
    { label: locale === 'id' ? 'Fokus' : 'Focus', value: locale === 'id' ? 'Klinik & UKM' : 'Clinics & SMEs' },
  ]

  return (
    <div>
      <ManifestoStrip statements={statements.map((s) => s.text)} />

      <section className="tt-container" style={{ paddingBlock: 'var(--section-gap)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 'clamp(24px, 4vw, 56px)',
            borderTop: '1px solid var(--line)',
            paddingTop: 'clamp(32px, 5vw, 64px)',
          }}
        >
          {facts.map((f) => (
            <div key={f.label}>
              <p style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                {f.label}
              </p>
              <p className="tt-display" style={{ fontSize: 'clamp(1.25rem, 2.4vw, 1.75rem)', marginTop: '0.3em' }}>
                {f.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="tt-container" style={{ paddingBottom: 'var(--section-gap)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'clamp(16px, 2.5vw, 32px)',
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <PlaceholderFrame key={i} aspectRatio={i % 2 === 0 ? '4 / 5' : '3 / 2'} />
          ))}
        </div>
      </section>
    </div>
  )
}
