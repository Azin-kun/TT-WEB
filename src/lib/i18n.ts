// Client-safe module: MUST NOT import from ./cms (which pulls payload/fs
// into the bundle) — cms.ts imports locale constants from HERE.
export type Locale = 'en' | 'id'
export const locales: Locale[] = ['en', 'id']
export const defaultLocale: Locale = 'en'

export const isLocale = (v: string): v is Locale => v === 'en' || v === 'id'

/** hreflang alternates for a path like "/manifesto" (leading slash, no locale) */
export const getAlternates = (path: string) => ({
  languages: {
    en: `/en${path}`,
    id: `/id${path}`,
    'x-default': `/en${path}`,
  },
})

/** swap the locale segment of a full pathname */
export const switchLocalePath = (pathname: string, to: Locale) => {
  const parts = pathname.split('/')
  parts[1] = to
  return parts.join('/') || `/${to}`
}
