import path from 'path'
import { fileURLToPath } from 'url'
import type { CollectionConfig } from 'payload'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: () => true },
  upload: {
    staticDir: path.resolve(dirname, '../../media'),
    imageSizes: [
      { name: 'card', width: 1600 },
      { name: 'og', width: 1200, height: 630, position: 'centre' },
    ],
    mimeTypes: ['image/*', 'video/*'],
  },
  fields: [{ name: 'alt', type: 'text', localized: true }],
}
