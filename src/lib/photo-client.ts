import imageCompression from 'browser-image-compression'
import exifr from 'exifr'
import type { createClient } from '@/lib/supabase/client'

// Browser-side: shrink to ≤1600px JPEG (HEIC-safe) and read when it was taken.
export async function preparePhoto(file: File): Promise<{ blob: Blob; takenAt: string | null }> {
  const exif = await exifr.parse(file, { pick: ['DateTimeOriginal'] }).catch(() => null)
  const takenAt = exif?.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal.toISOString() : null
  const blob = await imageCompression(new File([file], 'photo.jpg', { type: file.type || 'image/jpeg' }), {
    maxSizeMB: 1,
    maxWidthOrHeight: 1600,
    useWebWorker: false, // WebKit PWA workers are flaky
    fileType: 'image/jpeg',
  })
  return { blob, takenAt }
}

// Photos and captions feed enrichment, so changing them re-labels the cook
// (techniques, search text). Fire-and-forget, like the note editor.
export async function requeueEnrichment(
  supabase: ReturnType<typeof createClient>,
  cookId: string,
): Promise<void> {
  await supabase.from('cook').update({ enrichment_status: 'queued' }).eq('id', cookId)
  void fetch('/api/enrich', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookId }),
  }).catch(() => {})
}
