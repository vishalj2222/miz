'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { COOKS_BUCKET } from '@/lib/queue'
import { preparePhoto, requeueEnrichment } from '@/lib/photo-client'

// Adds process shots to an existing cook. Not the capture path, so it uploads
// directly rather than via the offline queue; previews show instantly.
export function PhotoAdder({ cookId, ownerId }: { cookId: string; ownerId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [previews, setPreviews] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  async function upload({ blob, takenAt }: { blob: Blob; takenAt: string | null }): Promise<boolean> {
    try {
      const supabase = createClient()
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
      return true
    } catch (err) {
      console.warn('add photo failed', err)
      return false
    }
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setError(null)
    const urls = files.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    const supabase = createClient()
    // Shrink one photo at a time (several at once can exhaust iOS memory);
    // each upload runs in the background while the next one shrinks.
    const uploads: Promise<boolean>[] = []
    for (const file of files) {
      const prepared = await preparePhoto(file).catch((err) => {
        console.warn('prepare photo failed', err)
        return null
      })
      if (!prepared) {
        uploads.push(Promise.resolve(false))
        continue
      }
      uploads.push(upload(prepared))
    }
    const failed = (await Promise.all(uploads)).filter((ok) => !ok).length
    // New process shots can reveal techniques — re-label with them.
    if (failed < files.length) await requeueEnrichment(supabase, cookId)
    if (failed) setError(`${failed} photo${failed === 1 ? '' : 's'} didn't upload — try again`)
    router.refresh()
    setPreviews([])
    urls.forEach((u) => URL.revokeObjectURL(u)) // free the full-size originals
  }

  return (
    <div className="mt-6">
      {previews.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          {previews.map((src) => (
            <img key={src} src={src} alt="" decoding="async" className="aspect-square w-full bg-hairline object-cover opacity-60" />
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
