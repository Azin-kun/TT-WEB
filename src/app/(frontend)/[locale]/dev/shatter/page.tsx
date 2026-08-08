import { notFound } from 'next/navigation'
import ShatterLab from './ShatterLab'

// Dev-only tuning bench for the hold-to-shatter effect. Never reachable in a
// production build.
export default function ShatterDevPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <ShatterLab />
}
