import type { CollectionConfig } from 'payload'
import { revalidateHooks } from '../lib/revalidate'

export const Services: CollectionConfig = {
  slug: 'services',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'order'] },
  access: { read: () => true },
  hooks: revalidateHooks('services'),
  fields: [
    { name: 'name', type: 'text', localized: true, required: true },
    {
      name: 'capabilities',
      type: 'array',
      localized: true,
      fields: [{ name: 'item', type: 'text', required: true }],
    },
    { name: 'order', type: 'number', defaultValue: 0, admin: { position: 'sidebar' } },
  ],
}
