export interface FeedItem {
  id: string
  cookedAt: string
  note: string
  photoUrl: string | null
  dishName?: string | null
  cuisine?: string | null
  tags?: string[]
  photoCount?: number
  enrichmentStatus?: string
  syncError?: string
}

// PostgREST returns to-one relations (cook.dish_id → dish) as an object, but
// the untyped supabase-js parser types them as arrays — cast once, here.
export function dishMeta(
  dish: unknown,
): { dishName: string | null; cuisine: string | null } {
  const d = (dish ?? null) as { canonical_name?: string | null; cuisine?: string | null } | null
  return { dishName: d?.canonical_name ?? null, cuisine: d?.cuisine ?? null }
}

// True while the model is still working on a card (or it hasn't synced yet).
export function isIdentifying(item: FeedItem): boolean {
  return !item.dishName && item.enrichmentStatus !== 'done' && item.enrichmentStatus !== 'failed'
}

// Distinct cuisines in feed order (newest first), with how many cooks each.
export function cuisineCounts(items: FeedItem[]): { cuisine: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    const c = item.cuisine?.trim()
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  return [...counts].map(([cuisine, count]) => ({ cuisine, count }))
}

export type PhotoRow = { storage_path: string; is_cover?: boolean | null }

// The cook's main photo: the one flagged is_cover, else any (legacy rows).
export function coverPhoto<T extends PhotoRow>(photos: T[] | null | undefined): T | undefined {
  return photos?.find((p) => p.is_cover) ?? photos?.[0]
}
