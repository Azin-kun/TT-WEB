import { NextRequest, NextResponse } from 'next/server'

const LOCALES = ['en', 'id'] as const
const COOKIE = 'NEXT_LOCALE'

function negotiate(req: NextRequest): string {
  const cookie = req.cookies.get(COOKIE)?.value
  if (cookie && (LOCALES as readonly string[]).includes(cookie)) return cookie
  const header = req.headers.get('accept-language') || ''
  if (/\bid\b|id-ID/i.test(header)) return 'id'
  return 'en'
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const seg = pathname.split('/')[1]

  if ((LOCALES as readonly string[]).includes(seg)) {
    const res = NextResponse.next()
    res.cookies.set(COOKIE, seg, { path: '/', maxAge: 60 * 60 * 24 * 365 })
    return res
  }

  const locale = negotiate(req)
  const url = req.nextUrl.clone()
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`
  return NextResponse.redirect(url)
}

export const config = {
  // everything except payload admin/api, next internals, and files with extensions
  matcher: ['/((?!admin|api|_next|.*\\..*).*)'],
}
