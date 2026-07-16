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
      name: 'tagline',
      type: 'text',
      localized: true,
      admin: { description: 'Bold headline inside the expanded row (e.g. "Shaping identities that resonate and endure")' },
    },
    {
      name: 'description',
      type: 'textarea',
      localized: true,
      admin: { description: 'Paragraph inside the expanded row' },
    },
    {
      name: 'capabilities',
      type: 'array',
      localized: true,
      fields: [{ name: 'item', type: 'text', required: true }],
    },
    {
      name: 'projectCount',
      type: 'number',
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        description: 'Shown as "003//" on the row (manual for now — works aren’t related to services yet)',
      },
    },
    {
      name: 'icon',
      type: 'select',
      defaultValue: 'spark',
      options: ['strategy', 'grid', 'motion', 'code', 'pen', 'layers', 'camera', 'spark'],
      admin: { position: 'sidebar', description: 'Stroke icon shown next to the service name' },
    },
    { name: 'order', type: 'number', defaultValue: 0, admin: { position: 'sidebar' } },
  ],
}
