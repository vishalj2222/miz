'use client'

import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { flushPending, COOKS_BUCKET } from '@/lib/queue'
import { db, pendingItems } from '@/lib/db'
import { CookCard } from './cook-card'
import { CuisineRow } from './cuisine-row'
import { coverPhoto, dishMeta, isIdentifying, type FeedItem } from '@/lib/feed'

// `known` holds URLs already on screen. Signed URLs differ on every signing,
// so re-signing would make the phone download every photo again on each
// refetch (and every 4s while polling). Only new photos get signed.
async function fetchFeed(ownerId: string, known: FeedItem[] = []): Promise<FeedItem[]> {
  const supabase = createClient()
  const knownUrl = new Map(known.filter((k) => k.photoPath && k.photoUrl).map((k) => [k.photoPath!, k.photoUrl!]))
  const { data } = await supabase
    .from('cook')
    .select(
      'id, cooked_at, created_at, note_raw, tags, enrichment_status, photo(storage_path, is_cover), dish(canonical_name, cuisine)',
    )
    .eq('owner_id', ownerId)
    .order('cooked_at', { ascending: false })
  const fresh = [
    ...new Set(
      (data ?? []).map((c) => coverPhoto(c.photo)?.storage_path).filter((p): p is string => !!p && !knownUrl.has(p)),
    ),
  ]
  if (fresh.length) {
    const { data: signed } = await supabase.storage.from(COOKS_BUCKET).createSignedUrls(fresh, 60 * 60 * 24 * 7)
    for (const s of signed ?? []) if (s.path && s.signedUrl) knownUrl.set(s.path, s.signedUrl)
  }
  return (data ?? []).map((c): FeedItem => {
    const photoPath = coverPhoto(c.photo)?.storage_path ?? null
    return {
      id: c.id,
      cookedAt: c.cooked_at,
      note: c.note_raw,
      photoUrl: photoPath ? (knownUrl.get(photoPath) ?? null) : null,
      photoPath,
      tags: c.tags ?? [],
      photoCount: c.photo?.length ?? 0,
      enrichmentStatus: c.enrichment_status,
      ...dishMeta(c.dish),
    }
  })
}

// Poll while a card is still being identified, so its label lands within
// seconds. Capped so a stuck row can't poll forever.
const POLL_FOR_MS = 120_000
function pollInterval(items: FeedItem[] | undefined, until: number): number | false {
  if (Date.now() > until) return false
  return (items ?? []).some((i) => !i.syncError && isIdentifying(i)) ? 4000 : false
}

export function Feed({
  initialItems,
  ownerId,
  isOwn = false,
}: {
  initialItems: FeedItem[]
  ownerId: string
  isOwn?: boolean
}) {
  const queryClient = useQueryClient()
  const key = ['feed', ownerId]
  // Set after mount (not during render); 0 means "not yet mounted, don't poll".
  const pollUntil = useRef(0)
  useEffect(() => {
    pollUntil.current = Date.now() + POLL_FOR_MS
  }, [])
  const { data: items } = useQuery({
    queryKey: key,
    queryFn: () => fetchFeed(ownerId, queryClient.getQueryData<FeedItem[]>(key)),
    initialData: initialItems,
    refetchInterval: (query) => (isOwn ? pollInterval(query.state.data, pollUntil.current) : false),
  })

  useEffect(() => {
    if (!isOwn) return
    const sync = async () => {
      await flushPending(createClient())
      // refetchQueries settles without throwing on network failure (errors are
      // captured per-query), so the pending merge below still runs in airplane mode.
      await queryClient.refetchQueries({ queryKey: ['feed', ownerId] })
      const pending = await pendingItems()
      // Airplane-mode reload: unsynced captures still show, from IndexedDB.
      const pendingFeed: FeedItem[] = pending.map((p) => ({
        id: p.id,
        cookedAt: p.cookedAt,
        note: p.note,
        photoUrl: p.photoBlob ? URL.createObjectURL(p.photoBlob) : null,
        syncError: p.syncError,
      }))
      queryClient.setQueryData<FeedItem[]>(['feed', ownerId], (old = []) => {
        const ids = new Set(old.map((o) => o.id))
        return [...pendingFeed.filter((p) => !ids.has(p.id)), ...old]
      })
      // Fire-and-forget sweep; refetchInterval picks up the label when it lands.
      void fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }).catch(() => {})
    }
    void sync()
  }, [queryClient, ownerId, isOwn])

  return (
    <>
      <CuisineRow items={items ?? []} viewId={isOwn ? undefined : ownerId} />
      <div className="flex flex-col gap-12">
        {items?.map((item) => (
          <CookCard
            key={item.id}
            item={item}
            syncError={item.syncError}
            onDiscard={async (id) => {
              await db.pendingCooks.delete(id)
              queryClient.setQueryData<FeedItem[]>(key, (old = []) => old.filter((f) => f.id !== id))
            }}
          />
        ))}
      </div>
    </>
  )
}
