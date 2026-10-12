export interface FeedItem {
  id: string
  cookedAt: string
  note: string
  photoUrl: string | null
  dishName?: string | null
  cuisine?: string | null
  tags?: string[]
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
