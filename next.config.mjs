import { withPayload } from '@payloadcms/next/withPayload'
import { fileURLToPath } from 'url'
import path from 'path'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pins the workspace root to this project (an unrelated lockfile/node_modules
  // sits at C:\Users\user\, an ancestor dir, which Next.js would otherwise
  // pick up and warn about via its "multiple lockfiles" heuristic).
  outputFileTracingRoot: dirname,
  // Hides the dev-mode indicator badge (bottom-left round icon) — dev-only,
  // never shipped in production, but the owner wants it out of the way locally.
  devIndicators: false,
}

export default withPayload(nextConfig)
