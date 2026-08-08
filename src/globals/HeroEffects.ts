import type { GlobalConfig } from 'payload'
import { globalRevalidateHook } from '../lib/revalidate'

// Payload has no native colour field; validate a 6-digit hex string instead.
const hexColour = (value: unknown) =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
    ? true
    : 'Use a 6-digit hex colour, e.g. #B4571C'

/**
 * Physics and material settings for the hero logo separation.
 * NOT localized — these are numbers, identical in EN and ID.
 * Ranges mirror the dev bench sliders at /[locale]/dev/shatter and are enforced
 * by Payload on the REST API as well as in the admin UI.
 */
export const HeroEffects: GlobalConfig = {
  slug: 'hero-effects',
  label: 'Hero Effects',
  access: { read: () => true },
  hooks: { afterChange: [globalRevalidateHook('hero-effects')] },
  fields: [
    {
      name: 'separationEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Lets visitors press and hold the logo to pull it apart. Turning this off keeps the glass look, hatching and light wash — it only disables the interaction.',
      },
    },
    {
      name: 'timing',
      type: 'group',
      admin: { description: 'How long the charge and the reassembly take' },
      fields: [
        { name: 'chargeMs', type: 'number', defaultValue: 950, min: 300, max: 4000 },
        { name: 'reformMs', type: 'number', defaultValue: 2500, min: 100, max: 2500 },
        {
          name: 'separateStart',
          type: 'number',
          defaultValue: 0.65,
          min: 0,
          max: 0.9,
          admin: { description: 'Fraction of the charge that passes before anything moves' },
        },
        { name: 'staggerMax', type: 'number', defaultValue: 0.2, min: 0, max: 0.5 },
      ],
    },
    {
      name: 'motion',
      type: 'group',
      admin: { description: 'How far and how the six faces travel' },
      fields: [
        {
          name: 'spreadFrac',
          type: 'number',
          defaultValue: 1.6,
          min: 0,
          max: 2,
          admin: {
            description:
              'Drift distance as a multiple of logo height. Above ~1.0 the faces leave the screen before you can watch them.',
          },
        },
        { name: 'spreadVar', type: 'number', defaultValue: 0.8, min: 0, max: 0.9 },
        { name: 'lateralDrift', type: 'number', defaultValue: 0.75, min: 0, max: 1.5 },
        { name: 'spinMin', type: 'number', defaultValue: 0.18, min: 0, max: 1 },
        { name: 'spinMax', type: 'number', defaultValue: 0.21, min: 0, max: 1.5 },
        {
          name: 'capNormalMin',
          type: 'number',
          defaultValue: 0.79,
          min: 0.5,
          max: 0.99,
          admin: { description: 'Cutoff deciding whether a surface is a flat face or a side wall' },
        },
      ],
    },
    {
      name: 'material',
      type: 'group',
      admin: { description: 'Pencil hatching and the sweeping light wash' },
      fields: [
        { name: 'normalFollow', type: 'number', defaultValue: 0.55, min: 0, max: 1 },
        { name: 'hatchStrength', type: 'number', defaultValue: 0.65, min: 0, max: 1 },
        {
          name: 'hatchScale',
          type: 'number',
          defaultValue: 0.5,
          min: 0.5,
          max: 4,
          admin: { description: 'Higher = coarser strokes, lower = denser' },
        },
        { name: 'shineStrength', type: 'number', defaultValue: 0.3, min: 0, max: 1 },
        { name: 'shineWidth', type: 'number', defaultValue: 0.05, min: 0.05, max: 1 },
        { name: 'shineSpeed', type: 'number', defaultValue: 0.9, min: 0, max: 3 },
        { name: 'shineChargeBoost', type: 'number', defaultValue: 1, min: 0, max: 4 },
        {
          name: 'shineWarm',
          type: 'text',
          defaultValue: '#B4571C',
          validate: hexColour,
          admin: { description: 'Warm end of the light wash, 6-digit hex' },
        },
        {
          name: 'shineBright',
          type: 'text',
          defaultValue: '#FFF8E0',
          validate: hexColour,
          admin: { description: 'Hot end of the light wash, 6-digit hex' },
        },
      ],
    },
    {
      name: 'body',
      type: 'group',
      admin: { description: 'The glass skin and the ghost logo left behind' },
      fields: [
        {
          name: 'skinOpacity',
          type: 'number',
          defaultValue: 0.6,
          min: 0.05,
          max: 1,
          admin: {
            description:
              'Below ~0.5 the black and red wash out against the paper background.',
          },
        },
        {
          name: 'bodyOpacity',
          type: 'number',
          defaultValue: 0,
          min: 0,
          max: 1,
          admin: { description: 'At 0 only the wireframe outline of the ghost logo is drawn' },
        },
        { name: 'bodyEdgeOpacity', type: 'number', defaultValue: 0.9, min: 0, max: 1 },
        {
          name: 'bodyEdgeAngle',
          type: 'number',
          defaultValue: 26,
          min: 1,
          max: 60,
          admin: { description: 'Degrees. Lower draws more edges and gets noisy quickly.' },
        },
      ],
    },
    {
      name: 'feel',
      type: 'group',
      admin: { description: 'Shake while charging, and drag sensitivity' },
      fields: [
        { name: 'vibrateFrac', type: 'number', defaultValue: 0.006, min: 0, max: 0.05 },
        { name: 'vibratePhaseStep', type: 'number', defaultValue: 1.1, min: 0, max: 3 },
        {
          name: 'dragThresholdPx',
          type: 'number',
          defaultValue: 6,
          min: 2,
          max: 20,
          admin: { description: 'Pointer travel that turns a hold into a drag' },
        },
      ],
    },
  ],
}
