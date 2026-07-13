import React from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import '../globals.css'
import { fontVariables } from '../../../lib/fonts'
import { getSettings } from '../../../lib/cms'
import { isLocale, locales, getAlternates } from '../../../lib/i18n'
import { AppearanceProvider } from '../../../components/providers/AppearanceProvider'
import { LogoApiProvider } from '../../../components/providers/LogoApi'
import { SmoothScroll } from '../../../components/providers/SmoothScroll'
import { Cursor } from '../../../components/shell/Cursor'
import { Header } from '../../../components/shell/Header'
import { Footer } from '../../../components/shell/Footer'
import { ObsidianBackground } from '../../../components/three/ObsidianBackground'

// Landing always opens Atelier (SSR attr); returning in-session visitors get
// their choice restored BEFORE first paint to avoid a flash.
const APPEARANCE_INIT = `(function(){try{if(sessionStorage.getItem('tt-appearance')==='obsidian')document.documentElement.dataset.appearance='obsidian'}catch(e){}})()`

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

// Placeholder until the owner picks a domain (checklist 6.1) — update at deploy.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const settings = await getSettings(locale)
  const title = settings.seo?.title || settings.siteName || 'TAMPA TARUNO'
  const description = settings.seo?.description || undefined
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s — ${settings.siteName || 'TAMPA TARUNO'}`,
    },
    description,
    alternates: getAlternates(''),
    icons: { icon: '/media/logo-mono.svg' },
    openGraph: {
      title,
      description,
      locale,
      alternateLocale: locales.filter((l) => l !== locale),
      images: ['/media/obsidian-poster.webp'],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/media/obsidian-poster.webp'] },
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const settings = await getSettings(locale)

  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings.siteName || 'TAMPA TARUNO',
    url: `${SITE_URL}/${locale}`,
    logo: `${SITE_URL}/media/logo-full-color.svg`,
    ...(settings.email ? { email: settings.email } : {}),
    sameAs: (settings.socials || []).map((s) => s.url).filter(Boolean),
  }

  return (
    <html lang={locale} data-appearance="atelier" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_INIT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
      </head>
      <body>
        <LogoApiProvider>
          <AppearanceProvider transitionEnabled={settings.transitionEnabled ?? true}>
            <ObsidianBackground />
            <SmoothScroll />
            <Cursor />
            <Header locale={locale} settings={settings} />
            <main id="main">{children}</main>
            <Footer locale={locale} settings={settings} />
          </AppearanceProvider>
        </LogoApiProvider>
      </body>
    </html>
  )
}
