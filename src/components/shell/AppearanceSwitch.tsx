'use client'

import { useAppearance } from '../providers/AppearanceProvider'

export function AppearanceSwitch({
  labels,
}: {
  labels: { atelier?: string | null; obsidian?: string | null }
}) {
  const { appearance, request, locked } = useAppearance()
  const other = appearance === 'atelier' ? 'obsidian' : 'atelier'

  return (
    <button
      type="button"
      className="tt-switch"
      aria-pressed={appearance === 'obsidian'}
      aria-label={`Switch appearance to ${other}`}
      disabled={locked}
      onClick={() => request(other)}
      data-cursor="switch"
    >
      <span className={`side ${appearance === 'atelier' ? 'on' : ''}`}>
        <span aria-hidden>✏</span> {labels.atelier || 'Atelier'}
      </span>
      <span className={`side ${appearance === 'obsidian' ? 'on' : ''}`}>
        <span aria-hidden>◇</span> {labels.obsidian || 'Obsidian'}
      </span>
    </button>
  )
}
