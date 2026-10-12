// Default display name from an email: the leading letters of the local part,
// capitalised ('sahil.joshi4@…' -> 'Sahil'). Falls back to the whole local part.
export function firstNameFromEmail(email: string | undefined): string | null {
  const local = email?.split('@')[0] ?? ''
  const letters = local.match(/^[a-z]+/i)?.[0] ?? local
  if (!letters) return null
  return letters[0].toUpperCase() + letters.slice(1).toLowerCase()
}
