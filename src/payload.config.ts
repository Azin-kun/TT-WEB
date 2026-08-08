import path from 'path'
import { fileURLToPath } from 'url'
import { buildConfig } from 'payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Works } from './collections/Works'
import { Services } from './collections/Services'
import { ManifestoStatements } from './collections/ManifestoStatements'
import { Pages } from './collections/Pages'
import { SiteSettings } from './globals/SiteSettings'
import { HeroEffects } from './globals/HeroEffects'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// DB adapter is isolated HERE only (Global Constraint): dev = sqlite,
// production swap = @payloadcms/db-postgres + Neon DATABASE_URI.
export default buildConfig({
  admin: {
    user: 'users',
    importMap: { baseDir: path.resolve(dirname) },
  },
  editor: lexicalEditor(),
  collections: [Users, Media, Works, Services, ManifestoStatements, Pages],
  globals: [SiteSettings, HeroEffects],
  localization: {
    locales: ['en', 'id'],
    defaultLocale: 'en',
    fallback: true,
  },
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URI || 'file:./tampa-taruno.db' },
  }),
  sharp,
})
