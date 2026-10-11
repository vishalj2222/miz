// Voyage AI embeddings for semantic search (Claude has no embeddings endpoint).
// voyage-3.5 returns 1024 dims, matching cook.embedding vector(1024).
export const EMBED_MODEL = 'voyage-3.5'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
// Northern-hemisphere seasons, so "that thing I made in spring" can match.
const SEASONS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer',
  'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter']

type Extraction = {
  dish_name?: string
  cuisine?: string
  sub_region?: string
  ingredients?: { name?: string }[]
  techniques?: string[]
  cleaned_note?: string
}

// The text a cook is embedded as. Pure, so it's testable and stable.
export function cookDocument(cook: {
  cooked_at: string
  note_raw: string
  extraction: Extraction | null
}): string {
  const x = cook.extraction ?? {}
  const d = new Date(cook.cooked_at)
  const lines = [
    x.dish_name,
    [x.cuisine, x.sub_region].filter(Boolean).join(', '),
    x.ingredients?.length ? `Ingredients: ${x.ingredients.map((i) => i?.name).filter(Boolean).join(', ')}` : '',
    x.techniques?.length ? `Techniques: ${x.techniques.join(', ')}` : '',
    x.cleaned_note || cook.note_raw,
    Number.isNaN(d.getTime())
      ? ''
      : `Cooked in ${SEASONS[d.getUTCMonth()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
  ]
  return lines.map((l) => (l ?? '').trim()).filter(Boolean).join('\n')
}

// Throws on failure — callers decide whether that's fatal.
export async function embed(texts: string[], inputType: 'document' | 'query'): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts, input_type: inputType }),
  })
  if (!res.ok) throw new Error(`voyage ${res.status}`)
  const body = (await res.json()) as { data: { index: number; embedding: number[] }[] }
  return body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
}

// pgvector accepts the '[1,2,3]' text form over PostgREST.
export const toVector = (v: number[]) => `[${v.join(',')}]`
