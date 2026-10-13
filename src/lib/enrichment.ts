import type { createServerClient } from './supabase/server'
import { COOKS_BUCKET } from './queue'
import { cookDocument, embed, toVector } from './embedding'
import { coverPhoto } from './feed'
import { mergeCuisine } from './cuisine'
import { chooseMain, sampleForChoice, timingLabel, type Confidence } from './main-photo'

export type Supabase = Awaited<ReturnType<typeof createServerClient>>

export type EnrichResult = {
  dish_name: string
  cuisine: string
  sub_region: string
  ingredients: { name: string; amount: string }[]
  techniques: string[]
  confidence: { dish_name: Confidence; cuisine: Confidence; main_photo?: Confidence }
  cleaned_note: string
  // Only asked for when choosing an imported cook's main photo (1-based).
  main_photo?: number
}

export type CookRow = {
  id: string
  note_raw: string
  cooked_at?: string
  source: string | null
  cover_auto?: boolean | null
  photo: CookPhoto[] | null
}

export type CookPhoto = {
  storage_path: string
  is_cover?: boolean | null
  caption?: string | null
  taken_at?: string | null
  created_at?: string | null
}

// The photo columns enrichment needs, for every select that feeds a CookRow.
export const COOK_PHOTO_SELECT = 'photo(storage_path, is_cover, caption, taken_at, created_at)'

// Main shot first, then process shots in the order they were taken. Vision
// cost grows per image, so a long process series is capped.
const MAX_IMAGES = 5
const MAX_IMAGES_CHOOSING = 8
export function orderedPhotos(photos: CookPhoto[] | null): CookPhoto[] {
  const cover = coverPhoto(photos)
  if (!cover) return []
  const key = (p: CookPhoto) => p.taken_at ?? p.created_at ?? ''
  const process = (photos ?? []).filter((p) => p !== cover).sort((a, b) => key(a).localeCompare(key(b)))
  return [cover, ...process]
}

const captionsOf = (cook: CookRow) =>
  orderedPhotos(cook.photo)
    .map((p) => (p.caption ?? '').trim())
    .filter(Boolean)

// DeepSeek-V4.1-Flash: one cheap model for every cook, photo or not.
export const ENRICH_MODEL = 'deepseek-flash'

const ENRICH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'dish_name',
    'cuisine',
    'sub_region',
    'ingredients',
    'techniques',
    'confidence',
    'cleaned_note',
  ],
  properties: {
    dish_name: { type: 'string' },
    cuisine: { type: 'string' },
    sub_region: { type: 'string' },
    cleaned_note: {
      type: 'string',
      description:
        'The note rewritten: dictation mishearings corrected (e.g. "Singaporg" → "Singapore"), punctuation restored, structured as short bullet points ("• …") when the note contains multiple points. Keep the cook\'s own wording otherwise. Empty string if the note is empty.',
    },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'amount'],
        properties: {
          name: { type: 'string' },
          amount: { type: 'string' },
        },
      },
    },
    techniques: { type: 'array', items: { type: 'string' } },
    confidence: {
      type: 'object',
      additionalProperties: false,
      required: ['dish_name', 'cuisine'],
      properties: {
        dish_name: { type: 'string', enum: ['high', 'medium', 'low'] },
        cuisine: { type: 'string', enum: ['high', 'medium', 'low'] },
        main_photo: { type: 'string', enum: ['high', 'medium', 'low'] },
      },
    },
    main_photo: {
      type: 'integer',
      description:
        'Only when asked to choose the main photo: the number of the photo showing the finished, plated dish.',
    },
  },
}

// Empty context -> no block appended, so prompts stay byte-identical to the pre-context versions.
const contextBlock = (context: string) =>
  context ? `\n\nKnown dishes from this cook's own log: ${context}` : ''
const cuisineBlock = (cuisines: string[]) =>
  cuisines.length
    ? `\n\nCuisines already in use: ${cuisines.join(', ')}. Reuse one of these exactly when it fits.`
    : ''

// json_object mode doesn't enforce a schema, so the shape goes in the prompt.
const ENRICH_SYSTEM = (context: string, cuisines: string[]) =>
  `You are classifying a home cook's meal. From the photos (if any) and the note, extract the dish. Unless told otherwise, the first photo is the finished dish; any further photos are process shots taken while cooking, in order, possibly with the cook's captions — use them to identify techniques and ingredients. Be specific and honest: 'Singapore black pepper prawns' not 'seafood'. Use the cook's own vocabulary. \`cuisine\` is the broad national or regional cuisine ('Italian', 'Japanese', 'Middle Eastern'); put anything narrower ('Sicilian', 'Italian-American') in \`sub_region\`. Unknown values: empty string / empty array, never invented. Also rewrite the note as \`cleaned_note\`: fix dictation errors, restore punctuation, and structure it as bullets when it has multiple points. Respond with a single JSON object matching this JSON schema exactly: ${JSON.stringify(ENRICH_SCHEMA)}${contextBlock(context)}${cuisineBlock(cuisines)}`

async function photoToBase64(supabase: Supabase, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(COOKS_BUCKET).download(path)
  if (error || !data) return null // download error -> treat as no photo (note-only)
  return Buffer.from(await data.arrayBuffer()).toString('base64')
}

type Image = { b64: string; caption: string; timing: string }

const CHOOSE_MAIN =
  'These photos are one cooking session in the order they were taken, and none is marked as the finished dish yet. ' +
  'Decide which photo shows the finished, plated dish this cook is about — the others are process shots (raw ingredients, prep, pans on the stove). ' +
  'Return its number as `main_photo` and how sure you are as `confidence.main_photo`. The plate is usually one of the last photos taken, ' +
  "but trust what's in the pictures over the order. Base dish_name on that photo."

async function deepseekExtract(
  images: Image[],
  note: string,
  context: string,
  cuisines: string[],
  choosing: boolean,
): Promise<EnrichResult> {
  const lines = images
    .map((img, i) => {
      const bits = [choosing ? img.timing : '', img.caption ? `caption: ${img.caption}` : ''].filter(Boolean)
      return bits.length ? `Photo ${i + 1} — ${bits.join(', ')}` : ''
    })
    .filter(Boolean)
  const text = [
    choosing ? CHOOSE_MAIN : '',
    note ? `Note: ${note}` : 'No note — classify from the photos alone.',
    ...lines,
  ]
    .filter(Boolean)
    .join('\n')
  // JSON mode occasionally returns empty content (documented by DeepSeek);
  // one retry clears it. A second failure throws to the caller.
  for (let attempt = 1; ; attempt++) {
    try {
      return await deepseekCall(images, text, context, cuisines)
    } catch (err) {
      if (attempt >= 2 || !(err instanceof SyntaxError)) throw err
    }
  }
}

async function deepseekCall(images: Image[], text: string, context: string, cuisines: string[]): Promise<EnrichResult> {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: ENRICH_MODEL,
      messages: [
        { role: 'system', content: ENRICH_SYSTEM(context, cuisines) },
        {
          role: 'user',
          content: images.length
            ? [
                ...images.map((img) => ({
                  type: 'image_url',
                  image_url: { url: `data:image/jpeg;base64,${img.b64}` },
                })),
                { type: 'text', text },
              ]
            : text,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
    }),
  })
  if (!res.ok) throw new Error(`deepseek ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = await res.json()
  return JSON.parse(body.choices[0].message.content)
}

// Owner's dish names as personal context for the prompt. RLS (can_view)
// scopes this to rows the caller owns or has a share for; user stays in the
// signature for the backfill sweep.
export async function buildContext(supabase: Supabase, user: { id: string }): Promise<string> {
  const { data } = await supabase
    .from('dish')
    .select('canonical_name')
    .order('cook_count', { ascending: false })
    .limit(30)
  return (data ?? []).map((d) => d.canonical_name).join(', ')
}

// Cuisines already on the shared log (RLS: every member's dishes are visible),
// so new cooks land in an existing box instead of a near-duplicate.
export async function knownCuisines(supabase: Supabase): Promise<string[]> {
  const { data } = await supabase.from('dish').select('cuisine').not('cuisine', 'is', null)
  return [...new Set((data ?? []).map((d) => String(d.cuisine).trim()).filter(Boolean))]
}

export type Enrichment = {
  extraction: EnrichResult
  // The photos the model saw, in the order it saw them — main_photo indexes this.
  sent: CookPhoto[]
  choosing: boolean
}

// Downloads the photos (if any) and returns the raw parsed model output.
// Imported cooks with several shots (cover_auto) also get their main photo
// chosen. Throws on any failure — callers decide.
export async function enrichCookWith(
  supabase: Supabase,
  user: { id: string },
  cook: CookRow,
): Promise<Enrichment> {
  const choosing = Boolean(cook.cover_auto) && (cook.photo?.length ?? 0) > 1
  const candidates = choosing
    ? sampleForChoice(cook.photo ?? [], MAX_IMAGES_CHOOSING)
    : orderedPhotos(cook.photo).slice(0, MAX_IMAGES)
  const [b64s, context, cuisines] = await Promise.all([
    Promise.all(candidates.map((p) => photoToBase64(supabase, p.storage_path))),
    buildContext(supabase, user),
    knownCuisines(supabase),
  ])
  // A photo that fails to download is skipped, not fatal.
  const sent = candidates.filter((_, i) => b64s[i])
  const images = sent.map((p, i) => ({
    b64: b64s[candidates.indexOf(p)]!,
    caption: (p.caption ?? '').trim(),
    timing: choosing ? timingLabel(sent, i) : '', // sent is time-ordered when choosing
  }))
  // Raw model output goes into extraction as-is — never trimmed or reshaped.
  const extraction = await deepseekExtract(images, cook.note_raw, context, cuisines, choosing)
  return { extraction, sent, choosing }
}

// Dish match/insert + tags derivation + cook update. Throws on failure.
export async function writeEnrichment(
  supabase: Supabase,
  user: { id: string },
  cook: CookRow,
  { extraction, sent, choosing }: Enrichment,
): Promise<void> {
  // Before the label lands, so the card fills in with the right photo. The
  // RPC is a no-op if the owner has picked a main photo by hand meanwhile.
  if (choosing) {
    const main = chooseMain(sent, extraction.main_photo, extraction.confidence?.main_photo)
    if (main) {
      const { error } = await supabase.rpc('auto_cover_photo', { p_cook_id: cook.id, p_storage_path: main.storage_path })
      if (error) console.warn(`auto cover ${cook.id} failed`, error)
    }
  }

  const dishName = String(extraction.dish_name ?? '').trim()
  let dishId: string | null = null
  if (dishName) {
    const { data: existing } = await supabase
      .from('dish')
      .select('id')
      .ilike('canonical_name', dishName)
      .limit(1)
    dishId = existing?.[0]?.id ?? null
    if (!dishId) {
      // Fold "Southern Italian" into an existing "Italian"; the specific name
      // survives as the sub-region.
      const rawCuisine = String(extraction.cuisine ?? '').trim()
      const cuisine = rawCuisine ? mergeCuisine(rawCuisine, await knownCuisines(supabase)) : rawCuisine
      const subRegion =
        String(extraction.sub_region ?? '').trim() || (cuisine !== rawCuisine ? rawCuisine : '')
      const { data: inserted, error: insertError } = await supabase
        .from('dish')
        .insert({ canonical_name: dishName, cuisine, sub_region: subRegion })
        .select('id')
        .single()
      if (insertError) throw insertError // failed -> enrichment_status='failed' in the caller
      dishId = inserted?.id ?? null
    }
  }

  const tags = Array.from(new Set((extraction.ingredients ?? []).map((i) => (i?.name ?? '').trim()).filter(Boolean))).slice(0, 8)

  const { error } = await supabase
    .from('cook')
    .update({ extraction, enrichment_status: 'done', dish_id: dishId, tags })
    .eq('id', cook.id)
  if (error) throw error

  // Best-effort: a missing embedding only hides the cook from search until
  // the sweep's embedMissing() catches it up. Never fails enrichment.
  try {
    const [vec] = await embed(
      [cookDocument({ cooked_at: cook.cooked_at ?? '', note_raw: cook.note_raw, extraction, captions: captionsOf(cook) })],
      'document',
    )
    await supabase.from('cook').update({ embedding: toVector(vec) }).eq('id', cook.id)
  } catch (err) {
    console.warn(`embed ${cook.id} failed`, err)
  }
}

// Embeds the caller's enriched cooks that have no embedding yet (older rows,
// or ones whose inline embed failed). One Voyage call per batch.
export async function embedMissing(supabase: Supabase, user: { id: string }, limit = 50): Promise<number> {
  const { data: cooks } = await supabase
    .from('cook')
    .select(`id, cooked_at, note_raw, extraction, source, ${COOK_PHOTO_SELECT}`)
    .eq('owner_id', user.id)
    .eq('enrichment_status', 'done')
    .is('embedding', null)
    .limit(limit)
  if (!cooks?.length) return 0
  const vecs = await embed(
    (cooks as (CookRow & { cooked_at: string; extraction: EnrichResult | null })[]).map((c) =>
      cookDocument({ ...c, captions: captionsOf(c) }),
    ),
    'document',
  )
  let done = 0
  for (const [i, c] of cooks.entries()) {
    const { error } = await supabase.from('cook').update({ embedding: toVector(vecs[i]) }).eq('id', c.id)
    if (!error) done++
  }
  return done
}
