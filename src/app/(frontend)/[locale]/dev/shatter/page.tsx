import { notFound } from 'next/navigation'
import { getHeroEffects } from '@/lib/cms'
import { resolveSeparation } from '@/lib/three/shatter/resolveSeparation'
import ShatterLab from './ShatterLab'

// Dev-only tuning bench for the hold-to-separate effect. Never reachable in a
// production build.
export default async function ShatterDevPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  const effects = await getHeroEffects()
  return <ShatterLab initial={resolveSeparation(effects)} />
}
