import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { ensureProfile, isAllowedEmail } from '@/lib/auth'
import { COOKS_BUCKET } from '@/lib/queue'
import { Feed } from '@/components/feed'
import { CaptureButton } from '@/components/capture-button'
import { dishMeta, type FeedItem } from '@/lib/feed'

const SIGNED_URL_SECONDS = 60 * 60 * 24 * 7 // 7 days; refreshed whenever the feed refetches

async function fetchItems(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  ownerId?: string,
): Promise<FeedItem[]> {
  let query = supabase
    .from('cook')
    .select('id, cooked_at, created_at, note_raw, tags, photo(storage_path), dish(canonical_name, cuisine)')
  if (ownerId) query = query.eq('owner_id', ownerId)
  query = query.neq('source', 'backfill')
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
        ...dishMeta(c.dish),
      }
    }),
  )
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const supabase = await createServerClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user || !isAllowedEmail(data.user.email)) redirect('/login')
  await ensureProfile(supabase)
  const user = data.user

  // Communal by default: every member (anyone who has logged in once) appears
  // in the selector; any member may view any log, read-only.
  const { data: memberRows } = await supabase.rpc('list_profiles')
  const others = ((memberRows ?? []) as { id: string; display_name: string | null }[]).filter(
    (m) => m.id !== user.id,
  )

  const view = (await searchParams).view
  const viewId = view && others.some((m) => m.id === view) ? view : undefined
  if (view && viewId === undefined) redirect('/')

  const items = await fetchItems(supabase, viewId ?? user.id)

  const base = 'font-mono text-[0.7rem] uppercase tracking-[0.14em] px-2 py-1'
  const active = `${base} bg-ink text-paper`
  const idle = `${base} text-graphite hover:text-ink`

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-paper px-5 pb-12 pt-5">
      <header className={others.length > 0 ? '' : 'border-b border-hairline pb-5'}>
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-2xl font-semibold tracking-[-0.03em]">Mise</h1>
          <div className="flex items-baseline gap-4">
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-graphite">
              {items.length} cooks
            </p>
            <Link
              href={viewId ? `/search?view=${viewId}` : '/search'}
              className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-ink underline decoration-hairline underline-offset-4"
            >
              Search
            </Link>
          </div>
        </div>
        {others.length > 0 && (
          <nav className="flex gap-1 border-b border-hairline pb-2 mb-4">
            <Link href="/" className={viewId ? idle : active}>
              My log
            </Link>
            {others.map((m) => (
              <Link
                key={m.id}
                href={`/?view=${m.id}`}
                className={viewId === m.id ? active : idle}
              >
                {m.display_name ?? 'Shared'}&apos;s log
              </Link>
            ))}
          </nav>
        )}
      </header>
      <Feed initialItems={items} ownerId={viewId ?? user.id} isOwn={!viewId} />
      {!viewId && <CaptureButton />}
    </main>
  )
}
