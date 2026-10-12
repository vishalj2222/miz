import { createServerClient } from '@/lib/supabase/server'
import { COOKS_BUCKET } from '@/lib/queue'
import { dishMeta, type FeedItem } from '@/lib/feed'

const SIGNED_URL_SECONDS = 60 * 60 * 24 * 7 // 7 days; refreshed whenever the feed refetches

// One owner's visible cooks, newest first. Backfill rows stay out (they're
// search-only). With `cuisine`, only cooks whose dish has exactly that cuisine.
export async function fetchItems(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  ownerId: string,
  opts?: { cuisine?: string },
): Promise<FeedItem[]> {
  const dish = opts?.cuisine ? 'dish!inner(canonical_name, cuisine)' : 'dish(canonical_name, cuisine)'
  let query = supabase
    .from('cook')
    .select(`id, cooked_at, created_at, note_raw, tags, enrichment_status, photo(storage_path), ${dish}`)
    .eq('owner_id', ownerId)
    .neq('source', 'backfill')
  if (opts?.cuisine) query = query.eq('dish.cuisine', opts.cuisine)
  const { data: cooks } = await query.order('created_at', { ascending: false })

  return Promise.all(
    (cooks ?? []).map(async (c) => {
      const photo = c.photo?.[0]
      let photoUrl: string | null = null
      if (photo) {
        const { data: signed } = await supabase.storage
          .from(COOKS_BUCKET)
          .createSignedUrl(photo.storage_path, SIGNED_URL_SECONDS)
        photoUrl = signed?.signedUrl ?? null
      }
      return {
        id: c.id,
        cookedAt: c.cooked_at,
        note: c.note_raw,
        photoUrl,
        tags: c.tags ?? [],
        enrichmentStatus: c.enrichment_status,
        ...dishMeta(c.dish),
      }
    }),
  )
}
