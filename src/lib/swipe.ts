// Edge swipe-back thresholds, kept pure so they're testable.
export const EDGE_PX = 24 // a swipe must start this close to the left edge
const ENGAGE_PX = 10 // horizontal travel before we claim the gesture
const COMMIT_FRACTION = 0.33 // of screen width
const FLICK_PX_PER_MS = 0.5

// Early in a drag: is this a back swipe, a vertical scroll, or undecided?
export function classifyDrag(dx: number, dy: number): 'swipe' | 'scroll' | 'undecided' {
  if (Math.abs(dy) > ENGAGE_PX && Math.abs(dy) > Math.abs(dx)) return 'scroll'
  if (dx > ENGAGE_PX && dx > Math.abs(dy)) return 'swipe'
  return 'undecided'
}

// On release: go back if dragged far enough, or flicked fast enough.
export function shouldGoBack(dx: number, ms: number, width: number): boolean {
  if (dx <= 0) return false
  return dx > width * COMMIT_FRACTION || dx / Math.max(ms, 1) > FLICK_PX_PER_MS
}
