'use client'

import { useFormFields, useRowLabel } from '@payloadcms/ui'

/**
 * Row label for the hero's `floatingWords` array.
 *
 * Payload's default label is the row number alone, which for this field is
 * close to useless: order IS the setting (the first N words are the ones a
 * phone shows), so the owner's job is reordering, and eighteen collapsed rows
 * reading "Floating Words 01…18" have to be opened one at a time to find out
 * what is being reordered.
 *
 * This shows the word itself, and marks every row that falls past the block's
 * `mobileWordLimit` — so where the phone cutoff lands is visible in the list
 * instead of being a number in a field description.
 */
export function FloatingWordRowLabel() {
  const { data, path, rowNumber } = useRowLabel<{ word?: string }>()

  // path is e.g. `layout.0.floatingWords.3`; the limit lives on the same block,
  // so drop the array name and the index to get back to `layout.0`.
  const blockPath = path.split('.').slice(0, -2).join('.')
  const limit = useFormFields(([fields]) => {
    const value = fields?.[`${blockPath}.mobileWordLimit`]?.value
    return typeof value === 'number' ? value : 8
  })

  const index = typeof rowNumber === 'number' ? rowNumber : 0
  const word = data?.word?.trim()
  const number = String(index + 1).padStart(2, '0')

  if (!word) return <span>{number} · (empty)</span>

  return (
    <span>
      {number} · {word}
      {index >= limit ? <em style={{ opacity: 0.6 }}> · desktop only</em> : null}
    </span>
  )
}
