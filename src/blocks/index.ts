import type { Block } from 'payload'

// Homepage layout blocks (spec §6 / Synapser §1.2). The owner reorders these
// in /admin; RenderBlocks maps slugs to section components.

export const HeroBlock: Block = {
  slug: 'hero',
  labels: { singular: 'Hero', plural: 'Heroes' },
  fields: [
    { name: 'line1', type: 'text', localized: true, required: true },
    { name: 'line2', type: 'text', localized: true },
    { name: 'locationLine', type: 'text', localized: true },
    { name: 'scrollCue', type: 'text', localized: true },
    {
      name: 'constellationEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Floating "margin note" words tethered to the logo by pencil strings (decorative; hero looks complete without them)',
      },
    },
    {
      name: 'mobileWordLimit',
      type: 'number',
      defaultValue: 8,
      min: 4,
      max: 18,
      admin: {
        description:
          'How many words a phone shows. The hero is one screen tall there, so the full list overcrowds the logo — the first N in the list survive, the rest are desktop-only and marked as such in the list below.',
        condition: (_, siblingData) => siblingData?.constellationEnabled !== false,
      },
    },
    {
      name: 'floatingWords',
      type: 'array',
      localized: true,
      minRows: 4,
      maxRows: 18,
      labels: { singular: 'Word', plural: 'Words' },
      admin: {
        description:
          'Short words orbiting the logo — 8 to 12 reads best. Order is the setting, not decoration: a phone shows only the first few (see the limit above), so lead with the words that matter and let the rest trail.',
        condition: (_, siblingData) => siblingData?.constellationEnabled !== false,
        components: {
          // Default label is the row number alone, which is useless for a field
          // whose whole job is ordering. See the component for the reasoning.
          RowLabel: '@/admin/FloatingWordRowLabel#FloatingWordRowLabel',
        },
      },
      fields: [{ name: 'word', type: 'text', required: true, maxLength: 24 }],
    },
  ],
}

export const ManifestoStripBlock: Block = {
  slug: 'manifestoStrip',
  labels: { singular: 'Manifesto strip', plural: 'Manifesto strips' },
  fields: [{ name: 'heading', type: 'text', localized: true }],
}

export const FeaturedWorksBlock: Block = {
  slug: 'featuredWorks',
  labels: { singular: 'Featured works', plural: 'Featured works' },
  fields: [{ name: 'heading', type: 'text', localized: true }],
}

export const ServicesRowsBlock: Block = {
  slug: 'servicesRows',
  labels: { singular: 'Services rows', plural: 'Services rows' },
  fields: [{ name: 'heading', type: 'text', localized: true }],
}

export const ArchiveTeaserBlock: Block = {
  slug: 'archiveTeaser',
  labels: { singular: 'Archive teaser', plural: 'Archive teasers' },
  fields: [
    // "{{count}} projects in the archive" — {{count}} replaced at render
    { name: 'countTemplate', type: 'text', localized: true },
  ],
}

export const ContactMailtoBlock: Block = {
  slug: 'contactMailto',
  labels: { singular: 'Contact (mailto)', plural: 'Contacts (mailto)' },
  fields: [
    { name: 'heading', type: 'text', localized: true },
    { name: 'emailOverride', type: 'email' },
  ],
}

export const RichTextBlock: Block = {
  slug: 'richText',
  fields: [{ name: 'content', type: 'richText', localized: true }],
}

export const MediaFullBlock: Block = {
  slug: 'mediaFull',
  fields: [
    { name: 'media', type: 'upload', relationTo: 'media' },
    { name: 'caption', type: 'text', localized: true },
  ],
}

export const pageBlocks = [
  HeroBlock,
  ManifestoStripBlock,
  FeaturedWorksBlock,
  ServicesRowsBlock,
  ArchiveTeaserBlock,
  ContactMailtoBlock,
  RichTextBlock,
  MediaFullBlock,
]
