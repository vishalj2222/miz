import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { ensureProfile, isAllowedEmail } from '@/lib/auth'
import { COOKS_BUCKET } from '@/lib/queue'
import { CookDate } from '@/components/cook-date'
import { CuisineTag } from '@/components/cuisine-tag'
import { NoteEditor } from '@/components/note-editor'
import { coverPhoto, dishMeta } from '@/lib/feed'
import { PhotoAdder } from '@/components/photo-adder'
import { PhotoActions } from '@/components/photo-actions'

const SIGNED_URL_SECONDS = 60 * 60 * 24 * 7 // 7 days; refreshed whenever the feed refetches

export default async function CookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user || !isAllowedEmail(data.user.email)) redirect('/login')
  await ensureProfile(supabase)

  const { data: cook } = await supabase
    .from('cook')
    .select(
      'id, cooked_at, owner_id, enrichment_status, note_raw, tags, extraction, photo(id, storage_path, is_cover, taken_at, created_at), dish(canonical_name, cuisine)',
    )
    .eq('id', id)
    .maybeSingle()
  if (!cook) notFound()

  const isOwner = cook.owner_id === data.user?.id

  const cleanedNote =
    typeof cook.extraction?.cleaned_note === 'string' && cook.extraction.cleaned_note.length > 0
      ? cook.extraction.cleaned_note
      : null
  // While re-enrichment is queued the stored cleaned note is stale — show the
  // just-edited raw text until the sweep lands.
  const mainNote =
    cook.enrichment_status === 'queued' ? cook.note_raw : cleanedNote ?? cook.note_raw

  const { dishName, cuisine } = dishMeta(cook.dish)
  type Photo = { id: string; storage_path: string; is_cover: boolean; taken_at: string | null; created_at: string }
  const photos = (cook.photo ?? []) as Photo[]
  const cover = coverPhoto(photos)
  // Process shots in the order they were taken (upload order as fallback).
  const process = photos
    .filter((p) => p !== cover)
    .sort((a, b) => (a.taken_at ?? a.created_at).localeCompare(b.taken_at ?? b.created_at))
  const { data: signedRows } = photos.length
    ? await supabase.storage
        .from(COOKS_BUCKET)
        .createSignedUrls(photos.map((p) => p.storage_path), SIGNED_URL_SECONDS)
    : { data: [] }
  const urlFor = new Map((signedRows ?? []).map((r) => [r.path, r.signedUrl]))
  const photoUrl = cover ? urlFor.get(cover.storage_path) ?? null : null

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-paper px-5 pb-12 pt-5">
      <header className="border-b border-hairline pb-5">
        <Link
          href="/"
          className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-graphite"
        >
          ← Mise
        </Link>
      </header>
      {dishName && (
        <h1 className="mt-5 font-display text-3xl font-medium tracking-[-0.025em]">{dishName}</h1>
      )}
      {cuisine && (
        <div className="mt-2">
          <CuisineTag cuisine={cuisine} />
        </div>
      )}
      {photoUrl && (
        <div className="mt-5 overflow-hidden bg-hairline">
          <img src={photoUrl} alt="" className="aspect-[4/5] w-full object-cover" />
        </div>
      )}
      {mainNote && <p className="mt-5 whitespace-pre-wrap text-lg leading-snug">{mainNote}</p>}
      <p className="mt-2 font-mono text-[0.7rem] text-graphite">
        <CookDate iso={cook.cooked_at} />
      </p>
      {cook.tags?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(cook.tags as string[]).map((tag) => (
            <span
              key={tag}
              className="border border-hairline px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.08em] text-graphite"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {cook.extraction?.techniques?.length ? (
        <p className="mt-3 font-mono text-[0.7rem] text-graphite">
          Techniques: {cook.extraction.techniques.join(', ')}
        </p>
      ) : null}
      {process.length > 0 && (
        <section className="mt-10 border-t border-hairline pt-5">
          <h2 className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-graphite">
            Process · {process.length}
          </h2>
          <div className="mt-4 flex flex-col gap-6">
            {process.map((p) => (
              <figure key={p.id}>
                <div className="overflow-hidden bg-hairline">
                  <img src={urlFor.get(p.storage_path) ?? undefined} alt="" className="w-full object-cover" />
                </div>
                {isOwner && <PhotoActions photoId={p.id} storagePath={p.storage_path} />}
              </figure>
            ))}
          </div>
        </section>
      )}
      {isOwner && <PhotoAdder cookId={cook.id} ownerId={cook.owner_id} />}
      <div className="mt-6">
        {isOwner && <NoteEditor cookId={cook.id} initialNote={cook.note_raw} />}
      </div>
    </main>
  )
}
