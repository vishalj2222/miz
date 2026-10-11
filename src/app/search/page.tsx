import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { ensureProfile, isAllowedEmail } from '@/lib/auth'
import { COOKS_BUCKET } from '@/lib/queue'
import { embed, toVector } from '@/lib/embedding'
import { dishMeta } from '@/lib/feed'
import { CookDate } from '@/components/cook-date'
import { CuisineTag } from '@/components/cuisine-tag'

const SIGNED_URL_SECONDS = 60 * 60 * 24 * 7

type Result = {
  id: string
  cookedAt: string
  photoUrl: string | null
  dishName: string | null
  cuisine: string | null
  note: string
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>
}) {
  const supabase = await createServerClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user || !isAllowedEmail(data.user.email)) redirect('/login')
  await ensureProfile(supabase)

  const { q: rawQ, view } = await searchParams
  const q = (rawQ ?? '').trim().slice(0, 300)

  // Same selector rule as the feed: you search the log you're looking at.
  const { data: memberRows } = await supabase.rpc('list_profiles')
  const members = (memberRows ?? []) as { id: string; display_name: string | null }[]
  const viewed = view ? members.find((m) => m.id === view && m.id !== data.user!.id) : undefined
  const ownerId = viewed?.id ?? data.user.id

  let results: Result[] = []
  let error: string | null = null
  if (q) {
    try {
      const [vec] = await embed([q], 'query')
      const { data: matches, error: rpcError } = await supabase.rpc('match_cooks', {
        query_embedding: toVector(vec),
        p_owner: ownerId,
        match_count: 20,
      })
      if (rpcError) throw rpcError
      const ids = ((matches ?? []) as { id: string }[]).map((m) => m.id)
      if (ids.length) {
        const { data: cooks } = await supabase
          .from('cook')
          .select('id, cooked_at, note_raw, extraction, photo(storage_path), dish(canonical_name, cuisine)')
          .in('id', ids)
        const byId = new Map((cooks ?? []).map((c) => [c.id, c]))
        results = await Promise.all(
          ids
            .map((id) => byId.get(id))
            .filter((c) => c != null)
            .map(async (c): Promise<Result> => {
              const photo = c.photo?.[0]
              let photoUrl: string | null = null
              if (photo) {
                const { data: signed } = await supabase.storage
                  .from(COOKS_BUCKET)
                  .createSignedUrl(photo.storage_path, SIGNED_URL_SECONDS)
                photoUrl = signed?.signedUrl ?? null
              }
              const cleaned = c.extraction?.cleaned_note
              return {
                id: c.id,
                cookedAt: c.cooked_at,
                photoUrl,
                note: typeof cleaned === 'string' && cleaned ? cleaned : c.note_raw,
                ...dishMeta(c.dish),
              }
            }),
        )
      }
    } catch (err) {
      console.warn('search failed', err)
      error = 'Search is unavailable right now.'
    }
  }

  const back = viewed ? `/?view=${viewed.id}` : '/'

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-paper px-5 pb-40 pt-5">
      <header className="flex items-baseline justify-between border-b border-hairline pb-5">
        <Link href={back} className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-graphite">
          ← Mise
        </Link>
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-graphite">
          {viewed ? `${viewed.display_name ?? 'Shared'}'s log` : 'My log'}
        </p>
      </header>

      {q && !error && (
        <p className="mt-4 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-graphite">
          {results.length} {results.length === 1 ? 'match' : 'matches'}
        </p>
      )}
      {error && <p className="mt-4 text-graphite">{error}</p>}
      {!q && (
        <p className="mt-6 text-graphite">
          Describe it however you remember it — &ldquo;that spicy peanut noodle thing from spring&rdquo;.
        </p>
      )}

      <ul className="mt-4 flex flex-col">
        {results.map((r) => (
          <li key={r.id} className="border-b border-hairline">
            <Link href={`/cooks/${r.id}`} className="flex gap-4 py-4">
              <div className="h-20 w-16 shrink-0 overflow-hidden bg-hairline">
                {r.photoUrl && <img src={r.photoUrl} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg leading-tight font-medium tracking-[-0.02em]">
                  {r.dishName ?? (r.note.split('\n')[0] || 'Untitled cook')}
                </h2>
                <div className="mt-1.5 flex items-center gap-3">
                  {r.cuisine && <CuisineTag cuisine={r.cuisine} />}
                  <span className="font-mono text-[0.7rem] text-graphite">
                    <CookDate iso={r.cookedAt} />
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* Thumb zone: the query field lives at the bottom of the screen. */}
      <form
        action="/search"
        className="fixed inset-x-0 bottom-0 border-t border-hairline bg-paper px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
      >
        <div className="mx-auto flex max-w-md gap-2">
          {viewed && <input type="hidden" name="view" value={viewed.id} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            autoFocus={!q}
            enterKeyHint="search"
            placeholder="What was that thing…"
            aria-label="Search cooks"
            className="min-h-12 flex-1 border border-hairline bg-paper px-3 text-base text-ink placeholder:text-graphite focus:border-ink focus:outline-none"
          />
          <button
            type="submit"
            className="min-h-12 bg-ink px-4 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-paper"
          >
            Find
          </button>
        </div>
      </form>
    </main>
  )
}
