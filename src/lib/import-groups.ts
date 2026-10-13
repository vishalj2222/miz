// Upload with several photos: shots taken close together are one cook (the
// process, then the plate); a long gap starts the next cook.
export const COOK_GAP_MS = 3 * 60 * 60 * 1000

export function groupIntoCooks<T extends { takenAt: string | null }>(photos: T[], gapMs = COOK_GAP_MS): T[][] {
  // No EXIF date: nothing to group by, so each is its own cook.
  const undated = photos.filter((p) => !p.takenAt).map((p) => [p])
  const dated = photos
    .filter((p) => p.takenAt)
    .sort((a, b) => a.takenAt!.localeCompare(b.takenAt!))
  const groups: T[][] = []
  for (const p of dated) {
    const last = groups.at(-1)
    const prev = last?.at(-1)
    if (last && prev && Date.parse(p.takenAt!) - Date.parse(prev.takenAt!) <= gapMs) last.push(p)
    else groups.push([p])
  }
  return [...groups, ...undated]
}
