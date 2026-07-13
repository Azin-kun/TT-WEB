import { notFound } from 'next/navigation'

// Any URL under /[locale]/ that doesn't match a real page lands here.
// Matching into the [locale] segment (rather than falling through to Next's
// generic root 404) is what lets the co-located [locale]/not-found.tsx render.
export default function CatchAll(): never {
  notFound()
}
