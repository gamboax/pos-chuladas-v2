/* global process */

const DEFAULT_MODEL = 'gpt-4.1-mini'
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const MAX_BODY_BYTES = 1_500_000
const MAX_IMAGE_CHARS = 1_200_000

const CATEGORY_BY_CODE = {
  A: 'Anillo',
  P: 'Pulsera',
  T: 'Tobillera',
  D: 'Collar con dije',
  I: 'Dije',
  E: 'Arete',
  R: 'Rosario',
  J: 'Juego',
  C: 'Cadena',
  X: 'Caja',
  CAJA: 'Caja'
}

const MATERIAL_BY_CODE = {
  1: 'Acero inoxidable',
  2: 'Oro laminado',
  3: 'Bano de rodio',
  4: 'Bano de plata'
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ items: [], message: 'Metodo no permitido.' })
  }

  const contentLength = Number(request.headers['content-length'] || 0)
  if (contentLength > MAX_BODY_BYTES) {
    return response.status(413).json({ items: [], message: 'Imagen demasiado grande. Toma otra foto.' })
  }

  const contentType = String(request.headers['content-type'] || '')
  if (contentType && !contentType.toLowerCase().includes('application/json')) {
    return response.status(415).json({ items: [], message: 'Formato de imagen no compatible.' })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return response.status(503).json({ items: [], message: 'Analisis no disponible. Corrige manualmente.' })
  }

  const body = request.body || {}
  const image = String(body.image || '')

  if (!isValidDataImage(image)) {
    return response.status(400).json({ items: [], message: 'Imagen invalida.' })
  }

  try {
    const aiResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildVisionRequest(image))
    })

    const payload = await aiResponse.json().catch(() => ({}))

    if (!aiResponse.ok) {
      console.error('[analyze-label] vision request failed:', payload?.error?.message || aiResponse.status)
      return response.status(502).json({ items: [], message: 'No pude leerlo bien, corrige manualmente.' })
    }

    const parsed = parseModelJson(payload)
    const items = validateItems(parsed.items || [])

    return response.status(200).json({
      items,
      message: items.length ? 'Sugerencias detectadas.' : 'No pude leerlo bien, corrige manualmente.'
    })
  } catch (error) {
    console.error('[analyze-label] unexpected error:', error?.message || error)
    return response.status(500).json({ items: [], message: 'No pude leerlo bien, corrige manualmente.' })
  }
}

function buildVisionRequest(image) {
  const model = String(process.env.OPENAI_VISION_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL

  return {
    model,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              'Analiza esta imagen completa de articulos de joyeria con etiquetas manuscritas.',
              'Busca todos los codigos visibles como A2, E3, J2, C1, X o CAJA y precios escritos cerca como $35, 90, 120.',
              'Puede haber varias etiquetas en una misma imagen, chuecas, pequenas o parcialmente visibles.',
              'Devuelve unicamente JSON valido. No inventes productos si no estas seguro.',
              'Reglas: A=Anillo, P=Pulsera, T=Tobillera, D=Collar con dije, I=Dije, E=Arete, R=Rosario, J=Juego, C=Cadena, X/CAJA=Caja.',
              'Material: 1=Acero inoxidable, 2=Oro laminado, 3=Bano de rodio, 4=Bano de plata.',
              'Si el precio no es claro, usa null. Si el codigo no es claro, no lo agregues.'
            ].join(' ')
          },
          {
            type: 'input_image',
            image_url: image,
            detail: 'high'
          }
        ]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'jewelry_label_analysis',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  code: { type: 'string' },
                  category: { type: 'string' },
                  material: { type: ['string', 'null'] },
                  price: { type: ['number', 'null'] },
                  confidence: { type: 'number' },
                  raw_text: { type: 'string' }
                },
                required: ['code', 'category', 'material', 'price', 'confidence', 'raw_text']
              }
            }
          },
          required: ['items']
        }
      }
    },
    max_output_tokens: 600
  }
}

function parseModelJson(payload) {
  const direct = payload.output_parsed
  if (direct) return direct

  const text = payload.output_text || findOutputText(payload) || ''

  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return { items: [] }

    try {
      return JSON.parse(match[0])
    } catch {
      return { items: [] }
    }
  }
}

function findOutputText(payload) {
  return (payload.output || [])
    .flatMap((entry) => entry.content || [])
    .map((content) => content.text || '')
    .filter(Boolean)
    .join('\n')
}

function validateItems(items) {
  const seen = new Set()
  const valid = []

  for (const item of items) {
    const normalized = normalizeCode(item.code)
    const match = normalized.match(/^(CAJA|X|[APTDIERJC][1-4])$/)
    if (!match || seen.has(normalized)) continue

    const categoryKey = normalized === 'CAJA' ? 'CAJA' : normalized[0]
    const materialDigit = normalized.length === 2 ? normalized[1] : ''
    const price = Number(item.price)

    valid.push({
      code: normalized,
      category: CATEGORY_BY_CODE[categoryKey] || item.category || '',
      material: normalized === 'X' || normalized === 'CAJA' ? '' : MATERIAL_BY_CODE[materialDigit] || item.material || '',
      price: Number.isFinite(price) && price > 0 ? price : null,
      confidence: clampConfidence(item.confidence),
      raw_text: String(item.raw_text || item.code || '')
    })

    seen.add(normalized)
  }

  return valid
}

function normalizeCode(value) {
  const text = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (text === 'CAJA' || text === 'X') return text
  return text.slice(0, 2)
}

function clampConfidence(value) {
  const confidence = Number(value)
  if (!Number.isFinite(confidence)) return 0
  return Math.max(0, Math.min(1, confidence))
}

function isValidDataImage(image) {
  return /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) && image.length <= MAX_IMAGE_CHARS
}
