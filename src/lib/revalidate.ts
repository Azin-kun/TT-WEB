import { revalidateTag } from 'next/cache'
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, GlobalAfterChangeHook } from 'payload'

// revalidateTag throws outside a Next request context (e.g. `payload run` seed
// scripts) — swallow there, it only matters for the live app.
export const safeRevalidate = (...tags: string[]) => {
  for (const tag of tags) {
    try {
      revalidateTag(tag)
    } catch {
      /* not in Next runtime */
    }
  }
}

export const revalidateHooks = (
  ...tags: string[]
): {
  afterChange: CollectionAfterChangeHook[]
  afterDelete: CollectionAfterDeleteHook[]
} => ({
  afterChange: [() => safeRevalidate(...tags)],
  afterDelete: [() => safeRevalidate(...tags)],
})

export const globalRevalidateHook =
  (...tags: string[]): GlobalAfterChangeHook =>
  ({ doc }) => {
    safeRevalidate(...tags)
    return doc
  }
