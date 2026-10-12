import imageCompression from 'browser-image-compression'
import exifr from 'exifr'

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
