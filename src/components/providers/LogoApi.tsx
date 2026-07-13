'use client'

import React, { createContext, useContext, useRef } from 'react'
import type { MaterialMode } from '../../lib/three/LogoEngine'

// Registry so a deeply-nested LogoCanvas can expose imperative controls to the
// AppearanceProvider / transition (Phase 4) mounted far above it in the tree.
export type LogoApi = {
  setMaterialMode: (mode: MaterialMode) => void
  getMesh: () => unknown | null
}

const LogoApiContext = createContext<React.MutableRefObject<LogoApi | null>>({ current: null })

export function LogoApiProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<LogoApi | null>(null)
  return <LogoApiContext.Provider value={ref}>{children}</LogoApiContext.Provider>
}

export const useLogoApiRef = () => useContext(LogoApiContext)
