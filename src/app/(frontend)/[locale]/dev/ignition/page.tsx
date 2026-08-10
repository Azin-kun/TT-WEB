import { notFound } from 'next/navigation'
import { getHeroEffects } from '@/lib/cms'
import { resolveIgnition } from '@/lib/three/ignition/resolveIgnition'
import { resolveSeparation } from '@/lib/three/shatter/resolveSeparation'
import IgnitionLab from './IgnitionLab'

// Dev-only tuning bench for the electrical wireframe ignition. Never reachable
// in a production build.
export default async function IgnitionDevPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  const effects = await getHeroEffects()
  return (
    <IgnitionLab initial={resolveIgnition(effects)} separation={resolveSeparation(effects)} />
  )
}
