'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { COOKS_BUCKET } from '@/lib/queue'

const btn = 'font-mono text-[0.65rem] uppercase tracking-[0.12em] text-graphite underline decoration-hairline underline-offset-4 min-h-11 px-1'

// Owner controls under a process photo. Remove asks for a second tap instead
// of a modal dialog.
export function PhotoActions({ photoId, storagePath }: { photoId: string; storagePath: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function run(action: () => Promise<{ error: unknown }>) {
    setBusy(true)
    setError(false)
    const { error: err } = await action()
    if (err) setError(true)
    else router.refresh()
    setBusy(false)
    setConfirming(false)
  }

  const supabase = createClient()
  const makeMain = () => run(async () => supabase.rpc('set_cover_photo', { p_photo_id: photoId }))
  const remove = () =>
    run(async () => {
      const res = await supabase.from('photo').delete().eq('id', photoId)
      if (!res.error) await supabase.storage.from(COOKS_BUCKET).remove([storagePath]) // best-effort file cleanup
      return res
    })

  return (
    <div className="flex items-center justify-end gap-4">
      {error && <span className="font-mono text-[0.65rem] text-graphite">Didn&apos;t work — try again</span>}
      <button type="button" disabled={busy} onClick={makeMain} className={btn}>
        Make main
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => (confirming ? remove() : setConfirming(true))}
        className={confirming ? `${btn} text-ink` : btn}
      >
        {confirming ? 'Tap to remove' : 'Remove'}
      </button>
    </div>
  )
}
