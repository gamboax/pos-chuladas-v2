const OCR_WHITELIST = 'APTDIERJCX0123456789OILZS?$.-_:/ '

export async function recognizeCodesFromImage(imageDataUrl, options = {}) {
  const { recognize } = await import('tesseract.js')
  const result = await recognize(imageDataUrl, 'eng', {
    logger: () => {},
    tessedit_char_whitelist: OCR_WHITELIST,
    tessedit_pageseg_mode: options.psm || '7'
  })

  return result?.data?.text || ''
}

export function createOcrImageVariants(sourceCanvas, region = null) {
  const cropped = cropCanvas(sourceCanvas, region)
  const normal = preprocessCanvasForOcr(cropped, { mode: 'normal' })
  const strong = preprocessCanvasForOcr(cropped, { mode: 'strong' })
  const inverted = preprocessCanvasForOcr(cropped, { mode: 'inverted' })

  return [
    { label: 'normal', psm: '7', image: normal },
    { label: 'threshold', psm: '7', image: strong },
    { label: 'invertido', psm: '7', image: inverted },
    { label: 'bloque', psm: '6', image: strong }
  ]
}

export function createAiLabelImage(sourceCanvas, region = null) {
  const cropped = cropCanvas(sourceCanvas, region)
  const maxSide = 900
  const scale = Math.min(1, maxSide / Math.max(cropped.width, cropped.height, 1))
  const width = Math.max(1, Math.round(cropped.width * scale))
  const height = Math.max(1, Math.round(cropped.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(cropped, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.72)
}

export function preprocessCanvasForOcr(sourceCanvas, options = {}) {
  const mode = options.mode || 'strong'
  const upscale = mode === 'normal' ? 2 : 3
  const targetWidth = Math.max(1, Math.round(sourceCanvas.width * upscale))
  const targetHeight = Math.max(1, Math.round(sourceCanvas.height * upscale))
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight)

  const image = context.getImageData(0, 0, targetWidth, targetHeight)
  const data = image.data
  const gray = new Uint8ClampedArray(targetWidth * targetHeight)

  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    gray[pixel] = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
  }

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const pixel = y * targetWidth + x
      const index = pixel * 4
      const value = sharpenGray(gray, x, y, targetWidth, targetHeight)
      const local = localAverage(gray, x, y, targetWidth, targetHeight, mode === 'normal' ? 5 : 9)
      const contrast = mode === 'normal' ? 1.65 : 2.2
      let output = clamp((value - local) * contrast + 150)

      if (mode !== 'normal') {
        const threshold = local - (mode === 'inverted' ? 8 : 12)
        output = value > threshold ? 255 : 0
      }

      if (mode === 'inverted') output = 255 - output

      data[index] = output
      data[index + 1] = output
      data[index + 2] = output
      data[index + 3] = 255
    }
  }

  context.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

function cropCanvas(sourceCanvas, region) {
  if (!region) return sourceCanvas

  const sourceWidth = sourceCanvas.width
  const sourceHeight = sourceCanvas.height
  const crop = {
    x: clampRatio(region.x),
    y: clampRatio(region.y),
    width: clampRatio(region.width),
    height: clampRatio(region.height)
  }
  const sx = Math.round(sourceWidth * crop.x)
  const sy = Math.round(sourceHeight * crop.y)
  const sw = Math.max(1, Math.round(sourceWidth * crop.width))
  const sh = Math.max(1, Math.round(sourceHeight * crop.height))
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const context = canvas.getContext('2d')
  context.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh)
  return canvas
}

function sharpenGray(gray, x, y, width, height) {
  const center = gray[y * width + x]
  const left = gray[y * width + Math.max(0, x - 1)]
  const right = gray[y * width + Math.min(width - 1, x + 1)]
  const top = gray[Math.max(0, y - 1) * width + x]
  const bottom = gray[Math.min(height - 1, y + 1) * width + x]
  return clamp(center * 1.85 - (left + right + top + bottom) * 0.2125)
}

function localAverage(gray, x, y, width, height, radius) {
  let total = 0
  let count = 0

  for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy += radius) {
    for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx += radius) {
      total += gray[yy * width + xx]
      count += 1
    }
  }

  return count ? total / count : gray[y * width + x]
}

function clamp(value) {
  return Math.max(0, Math.min(255, Number(value) || 0))
}

function clampRatio(value) {
  return Math.max(0, Math.min(1, Number(value) || 0))
}
