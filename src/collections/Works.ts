import type { CollectionConfig } from 'payload'
import { revalidateHooks } from '../lib/revalidate'

export const Works: CollectionConfig = {
  slug: 'works',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'category', 'year', 'featured', 'order'] },
  access: { read: () => true },
  hooks: revalidateHooks('works'),
  fields: [
    { name: 'title', type: 'text', localized: true, required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    {
      name: 'category',
      type: 'select',
      required: true,
      options: [
        { label: 'Brand', value: 'brand' },
        { label: 'Web', value: 'web' },
        { label: 'Motion', value: 'motion' },
        { label: 'Engineering', value: 'engineering' },
      ],
    },
    { name: 'year', type: 'number', required: true },
    { name: 'oneLiner', type: 'text', localized: true },
    { name: 'cover', type: 'upload', relationTo: 'media' },
    { name: 'featured', type: 'checkbox', defaultValue: false },
    {
      name: 'archiveSlot',
      type: 'group',
      admin: { description: 'Position on the drag-canvas archive (canvas units)' },
      fields: [
        { name: 'x', type: 'number', defaultValue: 0 },
        { name: 'y', type: 'number', defaultValue: 0 },
        { name: 'scale', type: 'number', defaultValue: 1 },
      ],
    },
    { name: 'order', type: 'number', defaultValue: 0, admin: { position: 'sidebar' } },
  ],
}
