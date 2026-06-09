/**
 * Compresses an image using the Canvas API before sending to OCR.
 * Reduces phone camera photos (3–8 MB) to ~200–500 KB without losing text legibility.
 * Improves Gemini reliability: smaller payloads = faster + fewer 429/413 errors.
 */
export async function compressImage(
  file: File,
  maxDimension = 1600,
  quality = 0.82
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      let { width, height } = img
      if (Math.max(width, height) > maxDimension) {
        const scale = maxDimension / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas no disponible')); return }
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        blob => {
          if (!blob) { reject(new Error('Compresión fallida')); return }
          const reader = new FileReader()
          reader.onload = () => {
            const [header, base64] = (reader.result as string).split(',')
            resolve({ base64, mimeType: header.split(':')[1].split(';')[0] })
          }
          reader.onerror = () => reject(new Error('Error leyendo imagen comprimida'))
          reader.readAsDataURL(blob)
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    img.src = objectUrl
  })
}
