import type { CollectionConfig } from 'payload'
import { revalidateHooks } from '../lib/revalidate'

export const ManifestoStatements: CollectionConfig = {
  slug: 'manifesto-statements',
  admin: { useAsTitle: 'text', defaultColumns: ['text', 'order'] },
  access: { read: () => true },
  hooks: revalidateHooks('manifesto'),
  fields: [
    { name: 'text', type: 'textarea', localized: true, required: true },
    { name: 'order', type: 'number', defaultValue: 0, admin: { position: 'sidebar' } },
  ],
}
