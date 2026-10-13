import { createClient } from '@/lib/supabase/client'
import { COOKS_BUCKET } from '@/lib/queue'
import { preparePhoto } from '@/lib/photo-client'
import { groupIntoCooks } from '@/lib/import-groups'

// Upload with several photos: each group of shots taken together becomes one
// cook. The last shot (the plate) is the main photo, the rest are process
// shots. Uploads go straight to storage; /api/enrich labels each cook.
export async function runImport(
  files: File[],
  ownerId: string,
  onProgress: (done: number, total: number) => void,
): Promise<number> {
  const supabase = createClient()
  const prepared = await Promise.all(files.map(async (file) => ({ file, ...(await preparePhoto(file)) })))
  const groups = groupIntoCooks(prepared)
  let imported = 0
  onProgress(0, groups.length)
  for (const group of groups) {
    try {
      const cookId = crypto.randomUUID()
      const cover = group.at(-1)!
      const { error: rpcError } = await supabase.rpc('create_cook', {
        p_cook_id: cookId,
        p_cooked_at: cover.takenAt ?? new Date().toISOString(),
        p_note: '',
        p_storage_path: null,
        p_source: 'backfill',
      })
      if (rpcError) throw rpcError
      // The last shot is only a placeholder main photo; enrichment picks the
      // finished dish from the whole set.
      if (group.length > 1) {
        const { error } = await supabase.from('cook').update({ cover_auto: true }).eq('id', cookId)
        if (error) throw error
      }
      const rows = await Promise.all(
        group.map(async (p) => {
          const id = crypto.randomUUID()
          const path = `${ownerId}/${cookId}/${id}.jpg`
          const { error } = await supabase.storage
            .from(COOKS_BUCKET)
            .upload(path, p.blob, { contentType: 'image/jpeg' })
          if (error) throw error
          return { id, cook_id: cookId, storage_path: path, is_cover: p === cover, taken_at: p.takenAt }
        }),
      )
      const { error: insertError } = await supabase.from('photo').insert(rows)
      if (insertError) throw insertError
      // Awaited so cooks are labelled one at a time and progress is honest;
      // a failure here leaves the cook queued for the next sweep.
      await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookId }),
      }).catch(() => {})
      imported++
    } catch (err) {
      console.warn('import failed', err)
    }
    onProgress(imported, groups.length)
  }
  return imported
}
