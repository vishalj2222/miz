/**
 * Cuisine as colour: the chrome is neutral, every hue below belongs to data.
 * Fixed hues for known cuisines, deterministic hash for the rest — same S/L
 * so no cuisine shouts louder.
 */
const cuisineHue: Record<string, number> = {
  Thai: 148,
  Chinese: 6,
  Japanese: 258,
  Korean: 26,
  'Sri Lankan': 46,
  Vietnamese: 192,
  Mexican: 322,
  Indian: 92,
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function cuisineColor(cuisine: string): string {
  const hue = cuisineHue[cuisine] ?? hash(cuisine) % 360
  return `hsl(${hue} 58% 44%)`
}

const words = (s: string) => s.toLowerCase().split(/[\s-]+/).filter(Boolean)

/**
 * Folds a regional variant into a cuisine already in use, so the cuisine boxes
 * don't split: "Southern Italian" or "Italian-American" → "Italian" when
 * "Italian" exists. Matches whole words only; the earliest match wins.
 */
export function mergeCuisine(cuisine: string, known: string[]): string {
  const target = words(cuisine)
  let best: { name: string; at: number } | null = null
  for (const k of known) {
    const kw = words(k)
    if (kw.length === 0 || kw.length >= target.length) continue
    for (let i = 0; i + kw.length <= target.length; i++) {
      if (kw.every((w, j) => target[i + j] === w)) {
        if (!best || i < best.at) best = { name: k, at: i }
        break
      }
    }
  }
  return best?.name ?? cuisine
}
