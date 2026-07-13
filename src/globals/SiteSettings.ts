import type { GlobalConfig } from 'payload'
import { globalRevalidateHook } from '../lib/revalidate'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  access: { read: () => true },
  hooks: { afterChange: [globalRevalidateHook('settings')] },
  fields: [
    { name: 'siteName', type: 'text', defaultValue: 'TAMPA TARUNO' },
    { name: 'email', type: 'email' },
    { name: 'locationLine', type: 'text', localized: true },
    {
      name: 'timezone',
      type: 'text',
      defaultValue: 'Asia/Jakarta',
      admin: { description: 'IANA timezone for the live clock in the contact section' },
    },
    {
      name: 'socials',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'url', type: 'text', required: true },
      ],
    },
    {
      name: 'navLabels',
      type: 'group',
      admin: { description: 'Labels for the numbered nav (001/002/003 numbering is automatic)' },
      fields: [
        { name: 'home', type: 'text', localized: true },
        { name: 'manifesto', type: 'text', localized: true },
        { name: 'archive', type: 'text', localized: true },
      ],
    },
    { name: 'archiveCountTemplate', type: 'text', localized: true },
    {
      name: 'seo',
      type: 'group',
      fields: [
        { name: 'title', type: 'text', localized: true },
        { name: 'description', type: 'textarea', localized: true },
      ],
    },
  ],
}
