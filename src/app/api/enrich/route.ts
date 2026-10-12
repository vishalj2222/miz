import { createServerClient } from '@/lib/supabase/server'
import { isAllowedEmail } from '@/lib/auth'
import { embedMissing, enrichCookWith, writeEnrichment, type CookRow, type Supabase } from '@/lib/enrichment'

// Enrichment is fire-and-forget from the client; the sweep fits comfortably
// inside the 60s function budget (2 cooks max).
export const maxDuration = 60

// Returns the extracted dish name on success, null on any failure (failure is
// recorded as enrichment_status='failed' so the sweep won't hot-loop).
async function enrichCook(
  supabase: Supabase,
  user: { id: string },
  cook: CookRow,
): Promise<string | null> {
  try {
    const extraction = await enrichCookWith(supabase, user, cook)
    await writeEnrichment(supabase, user, cook, extraction)
    return String(extraction.dish_name ?? '').trim()
  } catch (err) {
    console.warn(`enrich ${cook.id} failed`, err)
    try {
      await supabase
        .from('cook')
        .update({ enrichment_status: 'failed' })
        .eq('id', cook.id)
        // A concurrent run (save + sweep) may already have labelled it.
        .neq('enrichment_status', 'done')
    } catch {
      // best-effort: marking failed is the anti-hot-loop, but the sweep
      // re-picks 'queued' rows anyway
    }
    return null
  }
}

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !isAllowedEmail(user.email)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { cookId } = await req.json().catch(() => ({}))
  const select = 'id, note_raw, cooked_at, source, photo(storage_path, is_cover)'

  if (typeof cookId === 'string') {
    const { data: cook } = await supabase
      .from('cook')
      .select(select)
      .eq('id', cookId)
      .maybeSingle()
    if (!cook) return Response.json({ error: 'cook not found' }, { status: 404 })
    const dishName = await enrichCook(supabase, user, cook as CookRow)
    return Response.json({ dish_name: dishName })
  }

  // Sweep: oldest queued cooks first, max 2 per run.
  const { data: cooks } = await supabase
    .from('cook')
    .select(select)
    .eq('enrichment_status', 'queued')
    .eq('owner_id', user.id)
    .order('cooked_at', { ascending: true })
    .limit(2)
  if (cooks == null) return Response.json({ error: 'sweep failed' }, { status: 500 })
  let processed = 0
  for (const cook of cooks as CookRow[]) {
    await enrichCook(supabase, user, cook)
    processed++
  }
  // Catch up search embeddings; a Voyage outage must not fail the sweep.
  const embedded = await embedMissing(supabase, user).catch((err) => {
    console.warn('embed sweep failed', err)
    return 0
  })
  return Response.json({ processed, embedded })
}
