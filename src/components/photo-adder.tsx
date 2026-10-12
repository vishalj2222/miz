'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { COOKS_BUCKET } from '@/lib/queue'
import { preparePhoto } from '@/lib/photo-client'

// Adds process shots to an existing cook. Not the capture path, so it uploads
// directly rather than via the offline queue; previews show instantly.
export function PhotoAdder({ cookId, ownerId }: { cookId: string; ownerId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [previews, setPreviews] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setError(null)
    setPreviews(files.map((f) => URL.createObjectURL(f)))
    const supabase = createClient()
    let failed = 0
    for (const file of files) {
      try {
        const { blob, takenAt } = await preparePhoto(file)
        const id = crypto.randomUUID()
        const path = `${ownerId}/${cookId}/${id}.jpg`
        const { error: uploadError } = await supabase.storage
          .from(COOKS_BUCKET)
          .upload(path, blob, { contentType: 'image/jpeg' })
        if (uploadError) throw uploadError
        const { error: insertError } = await supabase
          .from('photo')
          .insert({ id, cook_id: cookId, storage_path: path, is_cover: false, taken_at: takenAt })
        if (insertError) throw insertError
      } catch (err) {
        console.warn('add photo failed', err)
        failed++
      }
    }
    if (failed) setError(`${failed} photo${failed === 1 ? '' : 's'} didn't upload — try again`)
    router.refresh()
    setPreviews([])
  }

  return (
    <div className="mt-6">
      {previews.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          {previews.map((src) => (
            <img key={src} src={src} alt="" className="aspect-square w-full bg-hairline object-cover opacity-60" />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={previews.length > 0}
        className="h-12 w-full border border-ink font-mono text-[0.7rem] uppercase tracking-[0.14em] text-ink disabled:border-hairline disabled:text-graphite"
      >
        {previews.length > 0 ? `Adding ${previews.length}…` : 'Add photos'}
      </button>
      {error && <p className="mt-2 font-mono text-[0.65rem] text-graphite">{error}</p>}
      {/* No capture attr: iOS offers both camera and library. */}
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
    </div>
  )
}
