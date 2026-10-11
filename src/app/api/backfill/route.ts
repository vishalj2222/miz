import { createServerClient } from '@/lib/supabase/server'
import { isAllowedEmail } from '@/lib/auth'
import { COOKS_BUCKET, cookPhotoPath } from '@/lib/queue'
import { enrichCookWith, writeEnrichment, type CookRow } from '@/lib/enrichment'

// Backfill enriches inline per chunk of 3 (vision + storage uploads), so it
// needs the long function budget.
export const maxDuration = 60

type Photo = { dataUrl: string; cookedAt: string; fileName: string }

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !isAllowedEmail(user.email)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { photos } = (await req.json().catch(() => ({}))) as { photos?: Photo[] }
  if (!Array.isArray(photos) || photos.length === 0 || photos.length > 3) {
    return Response.json({ error: 'photos must be 1-3 items' }, { status: 400 })
  }

  let imported = 0
  for (const photo of photos) {
    const cookId = crypto.randomUUID()
    const path = cookPhotoPath(user.id, cookId)
    try {
      const buf = Buffer.from((photo.dataUrl ?? '').split(',')[1] ?? '', 'base64')
      if (buf.length === 0) throw new Error('empty image data')
      const { error: uploadError } = await supabase.storage
        .from(COOKS_BUCKET)
        .upload(path, new Blob([buf], { type: 'image/jpeg' }), { upsert: true })
      if (uploadError) throw uploadError

      const { error: rpcError } = await supabase.rpc('create_cook', {
        p_cook_id: cookId,
        p_cooked_at: photo.cookedAt,
        p_note: '',
        p_storage_path: path,
        p_source: 'backfill',
      })
      if (rpcError) throw rpcError

      // Constructed directly — the row was just created by us, no re-fetch needed.
      const cookObj: CookRow = { id: cookId, note_raw: '', cooked_at: photo.cookedAt, photo: [{ storage_path: path }], source: 'backfill' }
      const extraction = await enrichCookWith(supabase, user, cookObj)
      await writeEnrichment(supabase, user, cookObj, extraction)
      imported++
    } catch (err) {
      console.warn(`backfill ${cookId} failed`, err)
      try {
        await supabase
          .from('cook')
          .update({ enrichment_status: 'failed' })
          .eq('id', cookId)
      } catch {
        // best-effort: the row exists with the photo; a later sweep could retry
      }
    }
  }
  return Response.json({ imported })
}
