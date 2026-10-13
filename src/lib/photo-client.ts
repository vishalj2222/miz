import imageCompression from 'browser-image-compression'
import exifr from 'exifr'
import type { createClient } from '@/lib/supabase/client'

const MAX_SIDE = 1600

// Fast path: createImageBitmap decodes off the main thread (EXIF rotation
// applied) and toBlob encodes asynchronously, so the page stays responsive.
// Only the small 1600px draw runs on the main thread.
async function shrink(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    canvas.width = canvas.height = 0 // release the backing store now; iOS caps canvas memory
    if (!blob) throw new Error('encode failed')
    return blob
  } finally {
    bitmap.close()
  }
}

// Browser-side: shrink to ≤1600px JPEG (HEIC-safe) and read when it was taken.
export async function preparePhoto(file: File): Promise<{ blob: Blob; takenAt: string | null }> {
  const exif = await exifr.parse(file, { pick: ['DateTimeOriginal'] }).catch(() => null)
  const takenAt = exif?.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal.toISOString() : null
  const blob = await shrink(file).catch(() =>
    // Fallback for formats createImageBitmap can't decode: slower, main thread.
    imageCompression(new File([file], 'photo.jpg', { type: file.type || 'image/jpeg' }), {
      maxSizeMB: 1,
      maxWidthOrHeight: MAX_SIDE,
      useWebWorker: false, // WebKit PWA workers are flaky
      fileType: 'image/jpeg',
    }),
  )
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
