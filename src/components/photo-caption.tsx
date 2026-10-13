'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { requeueEnrichment } from '@/lib/photo-client'

const MAX = 140

// A short line under a process photo. Owners edit it in place (no modal);
// everyone else just reads it.
export function PhotoCaption({
  photoId,
  cookId,
  initial,
  editable,
}: {
  photoId: string
  cookId: string
  initial: string
  editable: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function save() {
    const caption = value.trim().slice(0, MAX)
    if (caption === initial) return setEditing(false)
    setBusy(true)
    setError(false)
    const supabase = createClient()
    const { error: err } = await supabase.from('photo').update({ caption }).eq('id', photoId)
    setBusy(false)
    if (err) return setError(true)
    await requeueEnrichment(supabase, cookId)
    setEditing(false)
    router.refresh()
  }

  if (editing) {
    return (
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <input
          autoFocus
          value={value}
          maxLength={MAX}
          enterKeyHint="done"
          onChange={(e) => setValue(e.target.value)}
          placeholder="Searing at high heat…"
          aria-label="Photo caption"
          className="min-h-11 min-w-0 flex-1 border border-hairline bg-paper px-3 text-base text-ink placeholder:text-graphite focus:border-ink focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 bg-ink px-4 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-paper"
        >
          Save
        </button>
        {error && <span className="sr-only">Couldn&apos;t save</span>}
      </form>
    )
  }

  if (!editable) {
    return initial ? <figcaption className="mt-2 text-base leading-snug">{initial}</figcaption> : null
  }

  return (
    <figcaption className="mt-1">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={
          initial
            ? 'min-h-11 w-full text-left text-base leading-snug text-ink'
            : 'min-h-11 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-graphite underline decoration-hairline underline-offset-4'
        }
      >
        {initial || 'Add caption'}
      </button>
      {error && <p className="font-mono text-[0.65rem] text-graphite">Didn&apos;t save — try again</p>}
    </figcaption>
  )
}
