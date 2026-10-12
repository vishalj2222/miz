import { createServerClient } from '@/lib/supabase/server'
import { COOKS_BUCKET } from '@/lib/queue'
import { coverPhoto, dishMeta, type FeedItem } from '@/lib/feed'

const SIGNED_URL_SECONDS = 60 * 60 * 24 * 7 // 7 days; refreshed whenever the feed refetches

// One owner's cooks (camera-roll imports included), most recently cooked
// first — imports land at their photo date, not the import date.
// With `cuisine`, only cooks whose dish has exactly that cuisine.
export async function fetchItems(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  ownerId: string,
  opts?: { cuisine?: string },
): Promise<FeedItem[]> {
  const dish = opts?.cuisine ? 'dish!inner(canonical_name, cuisine)' : 'dish(canonical_name, cuisine)'
  let query = supabase
    .from('cook')
    .select(`id, cooked_at, created_at, note_raw, tags, enrichment_status, photo(storage_path, is_cover), ${dish}`)
    .eq('owner_id', ownerId)
  if (opts?.cuisine) query = query.eq('dish.cuisine', opts.cuisine)
  const { data: cooks } = await query.order('cooked_at', { ascending: false })

  return Promise.all(
    (cooks ?? []).map(async (c) => {
      const photo = coverPhoto(c.photo)
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
        photoCount: c.photo?.length ?? 0,
        enrichmentStatus: c.enrichment_status,
        ...dishMeta(c.dish),
      }
    }),
  )
}
