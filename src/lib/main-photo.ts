// Choosing an imported cook's main photo: the AI looks at every shot and
// names the finished dish; when the photos were taken is the cross-check.

export type TimedPhoto = { storage_path: string; taken_at?: string | null; created_at?: string | null }
export type Confidence = 'high' | 'medium' | 'low'

const when = (p: TimedPhoto) => p.taken_at ?? p.created_at ?? ''

export function byTimeTaken<T extends TimedPhoto>(photos: T[]): T[] {
  return [...photos].sort((a, b) => when(a).localeCompare(when(b)))
}

// The vision budget is capped. The plate is nearly always near the end of a
// session, so a long series keeps its opening shots and all of its last ones.
export function sampleForChoice<T extends TimedPhoto>(photos: T[], max = 8): T[] {
  const sorted = byTimeTaken(photos)
  if (sorted.length <= max) return sorted
  const head = Math.floor(max / 3)
  return [...sorted.slice(0, head), ...sorted.slice(sorted.length - (max - head))]
}

// "Photo 3 · 42 min in" — so the model can weigh timing too.
export function timingLabel(photos: TimedPhoto[], i: number): string {
  const start = Date.parse(when(photos[0]))
  const t = Date.parse(when(photos[i]))
  if (Number.isNaN(start) || Number.isNaN(t)) return ''
  return `${Math.round((t - start) / 60000)} min in`
}

/**
 * The AI's pick (1-based `pick` into `sent`, time-ordered), double-checked by
 * timing: a confident pick stands; a medium one must come from the later half
 * of the session; otherwise the last photo taken (usually the plate) wins.
 */
export function chooseMain<T extends TimedPhoto>(sent: T[], pick: unknown, confidence: unknown): T | undefined {
  if (sent.length === 0) return undefined
  const last = sent[sent.length - 1]
  const i = typeof pick === 'number' && Number.isInteger(pick) ? pick - 1 : -1
  if (i < 0 || i >= sent.length) return last
  if (confidence === 'high') return sent[i]
  if (confidence === 'medium' && i >= Math.floor(sent.length / 2)) return sent[i]
  return last
}
