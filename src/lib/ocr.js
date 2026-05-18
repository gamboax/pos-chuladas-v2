export async function recognizeCodesFromImage(imageDataUrl) {
  const { recognize } = await import('tesseract.js')
  const result = await recognize(imageDataUrl, 'eng', {
    logger: () => {}
  })

  return result?.data?.text || ''
}

export function preprocessCanvasForOcr(sourceCanvas) {
  const maxWidth = 1400
  const scale = Math.min(1, maxWidth / Math.max(sourceCanvas.width, 1))
  const targetWidth = Math.max(1, Math.round(sourceCanvas.width * scale))
  const targetHeight = Math.max(1, Math.round(sourceCanvas.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })

  context.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight)

  const image = context.getImageData(0, 0, targetWidth, targetHeight)
  const data = image.data

  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128))
    const sharpened = contrasted > 155 ? 255 : contrasted < 88 ? 0 : contrasted
    data[index] = sharpened
    data[index + 1] = sharpened
    data[index + 2] = sharpened
  }

  context.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}
