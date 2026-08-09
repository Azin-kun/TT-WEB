import type { GlobalConfig } from 'payload'
import { globalRevalidateHook } from '../lib/revalidate'

// Payload has no native colour field; validate a 6-digit hex string instead.
const hexColour = (value: unknown) =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
    ? true
    : 'Use a 6-digit hex colour, e.g. #B4571C'

/**
 * Physics and material settings for the hero logo: the hold-to-separate
 * interaction, and the electrical wireframe ignition that bridges the sketch
 * video and the rotating 3D logo.
 * NOT localized — identical in EN and ID (mostly numbers; the colour fields are
 * hex strings).
 * Ranges mirror the dev bench sliders at /[locale]/dev/shatter and
 * /[locale]/dev/ignition, and are enforced by Payload on the REST API as well
 * as in the admin UI.
 *
 * Ignition fields may be null on an existing install that has not been
 * reseeded — resolveIgnition() falls back to DEFAULT_IGNITION for every one of
 * them, so the effect runs correctly before anyone opens /admin.
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
    {
      name: 'ignitionEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Plays the electrical wireframe transition between the sketch video and the rotating 3D logo. Turning this off restores the plain crossfade.',
      },
    },
    {
      name: 'ignitionTiming',
      type: 'group',
      label: 'Ignition — timing',
      admin: {
        description:
          'Total length, and the phase boundaries as fractions of it. Changing the duration retimes everything proportionally.',
      },
      fields: [
        {
          name: 'ignitionMs',
          type: 'number',
          defaultValue: 2000,
          min: 600,
          max: 4000,
          admin: { description: 'Total length of the transition. The main pacing control.' },
        },
        {
          name: 'seedEnd',
          type: 'number',
          defaultValue: 0.12,
          min: 0,
          max: 0.5,
          admin: { description: 'Fraction where the core bloom ends and the front starts moving' },
        },
        {
          name: 'frontEnd',
          type: 'number',
          defaultValue: 0.78,
          min: 0.2,
          max: 1,
          admin: { description: 'Fraction where the charge front finishes crossing the logo' },
        },
        {
          name: 'cueFrac',
          type: 'number',
          defaultValue: 0.8,
          min: 0.1,
          max: 1,
          admin: { description: 'Fraction where the floating words / orbs are told to enter' },
        },
      ],
    },
    {
      name: 'ignitionShape',
      type: 'group',
      label: 'Ignition — shape',
      admin: { description: 'Where the charge starts and how wide its crest is' },
      fields: [
        { name: 'seedOffsetX', type: 'number', defaultValue: 0, min: -1, max: 1 },
        { name: 'seedOffsetY', type: 'number', defaultValue: 0, min: -1, max: 1 },
        { name: 'seedOffsetZ', type: 'number', defaultValue: 0, min: -1, max: 1 },
        {
          name: 'frontSoftness',
          type: 'number',
          defaultValue: 0.18,
          min: 0.02,
          max: 1,
          admin: { description: 'Width of the glowing crest, as a fraction of logo height' },
        },
        {
          name: 'wakeLag',
          type: 'number',
          defaultValue: 0.1,
          min: 0,
          max: 0.6,
          admin: { description: 'How far behind the crest the solid surfaces appear' },
        },
        { name: 'coreRadius', type: 'number', defaultValue: 0.22, min: 0, max: 1 },
        { name: 'coreStrength', type: 'number', defaultValue: 1, min: 0, max: 2 },
      ],
    },
    {
      name: 'ignitionCage',
      type: 'group',
      label: 'Ignition — cage',
      admin: { description: 'The scribble wireframe that carries the charge' },
      fields: [
        {
          name: 'cageDensity',
          type: 'number',
          defaultValue: 0.55,
          min: 0.05,
          max: 1,
          admin: {
            description:
              'Fraction of wireframe lines drawn. At 1 it looks like CAD; lower reads as pencil scribble.',
          },
        },
        {
          name: 'cageDensityMobile',
          type: 'number',
          defaultValue: 0.3,
          min: 0.05,
          max: 1,
          admin: { description: 'Same, on screens below 640px' },
        },
        { name: 'cageOpacity', type: 'number', defaultValue: 0.9, min: 0, max: 1 },
        {
          name: 'cageSeed',
          type: 'number',
          defaultValue: 1337,
          min: 0,
          max: 999999,
          admin: {
            description: 'Changes which lines are drawn. Same number = same cage every load.',
          },
        },
      ],
    },
    {
      name: 'ignitionColor',
      type: 'group',
      label: 'Ignition — colour',
      admin: { description: 'The graphite-to-hot ramp, and the dark mass that makes red readable' },
      fields: [
        {
          name: 'coldColor',
          type: 'text',
          defaultValue: '#2B2A27',
          validate: hexColour,
          admin: { description: 'Unlit cage — matches the pencil in the sketch video' },
        },
        { name: 'warmColor', type: 'text', defaultValue: '#8E1114', validate: hexColour },
        { name: 'hotColor', type: 'text', defaultValue: '#C8341A', validate: hexColour },
        {
          name: 'crestColor',
          type: 'text',
          defaultValue: '#FFF8E0',
          validate: hexColour,
          admin: { description: 'The very peak of the charge. Kept small and brief.' },
        },
        {
          name: 'darkMassOpacity',
          type: 'number',
          defaultValue: 0.12,
          min: 0,
          max: 0.6,
          admin: {
            description:
              'Faint dark fill shown only during the transition. Without it the red washes out against the paper background.',
          },
        },
        { name: 'glowDecay', type: 'number', defaultValue: 2.4, min: 0.2, max: 8 },
      ],
    },
    {
      name: 'ignitionOverlay',
      type: 'group',
      label: 'Ignition — cage overlay',
      admin: {
        description:
          'The cage appears over the still-drawing sketch video as a sphere, blooms outward into a polygon, then collapses into the logo shape.',
      },
      fields: [
        {
          name: 'overlayEnabled',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            description:
              'Turning this off starts the transition at the video cut instead, with no sphere beforehand.',
          },
        },
        {
          name: 'overlayLeadMs',
          type: 'number',
          defaultValue: 1000,
          min: 200,
          max: 4000,
          admin: { description: 'How long before the video ends the sphere appears' },
        },
        {
          name: 'sphereScale',
          type: 'number',
          defaultValue: 1,
          min: 1,
          max: 3,
          admin: { description: 'Starting sphere size, as a multiple of the logo' },
        },
        {
          name: 'bloomScale',
          type: 'number',
          defaultValue: 1.1,
          min: 1,
          max: 4,
          admin: {
            description:
              "The cage's TOTAL size when fully bloomed, as a multiple of the logo — measured corner to corner. Both this and the sphere are measured against the logo, so this number IS the final size rather than a multiplier on the sphere. Anything below the sphere size is raised to it.",
          },
        },
        {
          name: 'polySides',
          type: 'number',
          defaultValue: 8,
          min: 3,
          max: 16,
          admin: { description: 'Shape it blooms into. 8 is an octagon, 6 a hexagon.' },
        },
        { name: 'bloomStart', type: 'number', defaultValue: 0.15, min: 0, max: 1 },
        { name: 'bloomEnd', type: 'number', defaultValue: 0.6, min: 0, max: 1 },
        {
          name: 'morphStart',
          type: 'number',
          defaultValue: 0.6,
          min: 0,
          max: 1,
          admin: { description: 'When the bloomed shape starts collapsing into the logo' },
        },
      ],
    },
    {
      name: 'ignitionPulse',
      type: 'group',
      label: 'Ignition — hold pulses',
      admin: { description: 'Re-ignites while a visitor holds the logo and its skin peels away' },
      fields: [
        { name: 'pulseEnabled', type: 'checkbox', defaultValue: true },
        {
          name: 'pulseMs',
          type: 'number',
          defaultValue: 800,
          min: 200,
          max: 3000,
          admin: { description: 'Length of one pulse, and the gap before the next' },
        },
      ],
    },
    {
      name: 'ignitionLife',
      type: 'group',
      label: 'Ignition — wires and sparks',
      admin: { description: 'How much the cage writhes, and how it crackles' },
      fields: [
        {
          name: 'wireJitter',
          type: 'number',
          defaultValue: 0.03,
          min: 0,
          max: 0.3,
          admin: { description: 'How far the wires drift, as a fraction of the logo radius' },
        },
        { name: 'wireSpeed', type: 'number', defaultValue: 0.9, min: 0, max: 6 },
        {
          name: 'sparkStagger',
          type: 'number',
          defaultValue: 0.06,
          min: 0,
          max: 0.5,
          admin: { description: 'Randomness in the charge front. 0 gives a clean, even ring.' },
        },
        { name: 'sparkRate', type: 'number', defaultValue: 1.6, min: 0, max: 10 },
        {
          name: 'sparkDensity',
          type: 'number',
          defaultValue: 0.08,
          min: 0,
          max: 0.9,
          admin: { description: 'How many wires are lit at once. High values wash out.' },
        },
        {
          name: 'sparkIdle',
          type: 'number',
          defaultValue: 0.25,
          min: 0,
          max: 1,
          admin: { description: 'Sparking while the cage is still cold, over the video' },
        },
      ],
    },
    {
      name: 'ignitionEmbers',
      type: 'group',
      label: 'Ignition — ember dots',
      admin: { description: 'Glowing particles at the cage junctions' },
      fields: [
        { name: 'emberEnabled', type: 'checkbox', defaultValue: true },
        {
          name: 'emberDensity',
          type: 'number',
          defaultValue: 0.22,
          min: 0,
          max: 1,
          admin: { description: 'Fraction of cage junctions that carry an ember' },
        },
        { name: 'emberSize', type: 'number', defaultValue: 3.5, min: 0.5, max: 20 },
        { name: 'emberTwinkle', type: 'number', defaultValue: 2.5, min: 0, max: 12 },
        { name: 'emberOpacity', type: 'number', defaultValue: 0.95, min: 0, max: 1 },
      ],
    },
  ],
}
