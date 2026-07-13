import type { CollectionConfig } from 'payload'
import { pageBlocks } from '../blocks'
import { revalidateHooks } from '../lib/revalidate'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'slug', '_status'] },
  access: { read: () => true },
  versions: { drafts: true },
  hooks: revalidateHooks('pages'),
  fields: [
    { name: 'title', type: 'text', localized: true, required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    // layout itself is shared across locales (one composition); the text
    // fields INSIDE each block are localized individually.
    { name: 'layout', type: 'blocks', blocks: pageBlocks },
  ],
}
