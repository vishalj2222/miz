import Anthropic from '@anthropic-ai/sdk'
import type { createServerClient } from './supabase/server'
import { COOKS_BUCKET } from './queue'
import { cookDocument, embed, toVector } from './embedding'

export type Supabase = Awaited<ReturnType<typeof createServerClient>>

export type EnrichResult = {
  dish_name: string
  cuisine: string
  sub_region: string
  ingredients: { name: string; amount: string }[]
  techniques: string[]
  confidence: { dish_name: 'high' | 'medium' | 'low'; cuisine: 'high' | 'medium' | 'low' }
  cleaned_note: string
}

export type CookRow = {
  id: string
  note_raw: string
  cooked_at?: string
  source: string | null
  photo: { storage_path: string }[] | null
}

export function modelForCook(cook: { source: string | null }): 'claude-sonnet-5' | 'claude-haiku-4-5' {
  return cook.source === 'backfill' ? 'claude-haiku-4-5' : 'claude-sonnet-5'
}

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
      },
    },
  },
}

// Empty context -> no block appended, so prompts stay byte-identical to the pre-context versions.
const contextBlock = (context: string) =>
  context ? `\n\nKnown dishes from this cook's own log: ${context}` : ''

const ENRICH_PROMPT = (note: string, context: string) =>
  `You are classifying a home cook's meal. From the note (and photo), extract the dish. Be specific and honest: 'Singapore black pepper prawns' not 'seafood'. Use the cook's own vocabulary. Unknown values: empty string / empty array, never invented. Also rewrite the note as \`cleaned_note\`: fix dictation errors, restore punctuation, and structure it as bullets when it has multiple points. Note: ${note}${contextBlock(context)}`

const DEEPSEEK_SYSTEM =
  "You are classifying a home cook's meal. From the note, extract the dish. Be specific and honest: 'Singapore black pepper prawns' not 'seafood'. Use the cook's own vocabulary. Unknown values: empty string / empty array, never invented. Also rewrite the note as `cleaned_note`: fix dictation errors, restore punctuation, and structure it as bullets when it has multiple points. Respond in JSON."

const anthropic = new Anthropic()

async function photoToBase64(supabase: Supabase, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(COOKS_BUCKET).download(path)
  if (error || !data) return null // download error -> treat as no photo (DeepSeek path)
  return Buffer.from(await data.arrayBuffer()).toString('base64')
}

async function claudeExtract(
  photoB64: string,
  note: string,
  context: string,
  model: string,
): Promise<EnrichResult> {
  const msg = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: ENRICH_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photoB64 } },
          { type: 'text', text: ENRICH_PROMPT(note, context) },
        ],
      },
    ],
  })
  if (msg.stop_reason === 'refusal') throw new Error('claude refusal')
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return JSON.parse(text)
}

async function deepseekExtract(note: string, context: string): Promise<EnrichResult> {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: `${DEEPSEEK_SYSTEM}${contextBlock(context)}` },
        { role: 'user', content: note },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
    }),
  })
  if (!res.ok) throw new Error(`deepseek ${res.status}`)
  const body = await res.json()
  return JSON.parse(body.choices[0].message.content)
}

// Owner's dish names as personal context for both prompts. RLS (can_view)
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

// Downloads the photo (falls back to the text-only DeepSeek path) and returns
// the raw parsed model output. Throws on any failure — callers decide.
export async function enrichCookWith(
  supabase: Supabase,
  user: { id: string },
  cook: CookRow,
  opts?: { model?: string },
): Promise<EnrichResult> {
  const photoPath = cook.photo?.[0]?.storage_path
  const photoB64 = photoPath ? await photoToBase64(supabase, photoPath) : null
  const context = await buildContext(supabase, user)
  // Raw model output goes into extraction as-is — never trimmed or reshaped.
  return photoB64
    ? await claudeExtract(photoB64, cook.note_raw, context, opts?.model ?? modelForCook(cook))
    : await deepseekExtract(cook.note_raw, context)
}

// Dish match/insert + tags derivation + cook update. Throws on failure.
export async function writeEnrichment(
  supabase: Supabase,
  user: { id: string },
  cook: CookRow,
  extraction: EnrichResult,
): Promise<void> {
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
      const { data: inserted, error: insertError } = await supabase
        .from('dish')
        .insert({ canonical_name: dishName, cuisine: extraction.cuisine, sub_region: extraction.sub_region })
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
      [cookDocument({ cooked_at: cook.cooked_at ?? '', note_raw: cook.note_raw, extraction })],
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
    .select('id, cooked_at, note_raw, extraction')
    .eq('owner_id', user.id)
    .eq('enrichment_status', 'done')
    .is('embedding', null)
    .limit(limit)
  if (!cooks?.length) return 0
  const vecs = await embed(cooks.map((c) => cookDocument(c)), 'document')
  let done = 0
  for (const [i, c] of cooks.entries()) {
    const { error } = await supabase.from('cook').update({ embedding: toVector(vecs[i]) }).eq('id', c.id)
    if (!error) done++
  }
  return done
}
