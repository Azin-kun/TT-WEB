import { Inter, Space_Grotesk } from 'next/font/google'

export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

export const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
})

export const fontVariables = `${spaceGrotesk.variable} ${inter.variable}`
