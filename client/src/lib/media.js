// Shared client-side photo compression. Used by Film Roll uploads and by
// the optional image attachment on Notes. Resizes to a max dimension and
// re-encodes as JPEG at 85% quality — typically takes a 5 MB phone photo
// down to ~500 KB without visible quality loss.

const MAX_PHOTO_DIMENSION = 1920
const PHOTO_QUALITY = 0.85

export async function compressPhoto(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const ratio = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(img.width, img.height))
    const w = Math.round(img.width * ratio)
    const h = Math.round(img.height * ratio)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(img, 0, 0, w, h)
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob
          ? resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
          : reject(new Error('compression failed')),
        'image/jpeg',
        PHOTO_QUALITY,
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
