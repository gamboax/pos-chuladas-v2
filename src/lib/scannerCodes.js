import { hasSupabaseConfig, supabase } from '../supabase'

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

export function parseProductCode(rawCode) {
  const code = normalizeScannerCode(rawCode)
  const compactCode = code.replace(/[^A-Z0-9]/g, '')
  const match = findCodeMatch(code)

  if (!compactCode) {
    return { ok: false, message: 'Escribe un codigo para interpretar.' }
  }

  if (!match) {
    return { ok: false, message: `Codigo invalido: ${code}.` }
  }

  const categoryKey = match.categoryKey
  const category = CATEGORY_BY_CODE[categoryKey]

  if (!category) {
    return { ok: false, message: `No reconozco la categoria del codigo ${code}.` }
  }

  if (category !== 'Caja' && !match.materialDigit) {
    return { ok: false, message: `Material desconocido en ${code}. Usa 1, 2, 3 o 4.` }
  }

  return {
    ok: true,
    code: match.detectedCode,
    rawCode: code,
    category,
    material: category === 'Caja' ? '' : MATERIAL_BY_CODE[match.materialDigit] || '',
    parsedPrice: match.price
  }
}

export function extractProductCodesFromText(rawText, options = {}) {
  const normalized = normalizeOcrText(rawText)
  const candidates = options.fuzzy
    ? [...buildOcrCandidates(normalized), ...buildFuzzyCandidates(normalized)]
    : buildOcrCandidates(normalized)
  const bestByCode = new Map()

  candidates.forEach((candidate) => {
    const parsed = parseProductCode(candidate)
    if (!parsed.ok) return
    const current = bestByCode.get(parsed.code)
    if (!current || (!current.parsedPrice && parsed.parsedPrice)) {
      bestByCode.set(parsed.code, parsed)
    }
  })

  return [...bestByCode.values()]
}

export async function lookupSuggestedPrice(code) {
  if (!hasSupabaseConfig || !supabase || !code) return null

  try {
    const { data, error } = await supabase
      .from('product_codes')
      .select('suggested_price')
      .eq('code', normalizeScannerCode(code))
      .maybeSingle()

    if (error) return null
    return Number(data?.suggested_price || 0) || null
  } catch {
    return null
  }
}

export function normalizeScannerCode(rawCode) {
  return String(rawCode || '').trim().toUpperCase()
}

function normalizeOcrText(rawText) {
  return String(rawText || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[|]/g, 'I')
    .replace(/[¿]/g, '?')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .toUpperCase()
}

function buildOcrCandidates(text) {
  const spaced = text.replace(/[$]/g, ' ').replace(/[^A-Z0-9.?-]+/g, ' ')
  const compact = spaced.replace(/\s+/g, '')
  const candidates = []
  const codePattern = /([APTDIERJC])\s*[-_:.]?\s*([1-4ILZ?])(?:\s*[-_:.]?\s*([0-9OILZS]{1,4}(?:[.,][0-9OILZS]{1,2})?))?/g
  let match = codePattern.exec(spaced)

  while (match) {
    const material = normalizeOcrDigit(match[2])
    const price = normalizeOcrNumber(match[3])
    if (material) candidates.push(`${match[1]}${material}${price ? `-${price}` : ''}`)
    match = codePattern.exec(spaced)
  }

  const compactPattern = /([APTDIERJC])([1-4ILZ?])([0-9OILZS]{1,4})?/g
  match = compactPattern.exec(compact)

  while (match) {
    const before = compact.slice(0, match.index)
    const previousChar = before.slice(-1)
    if (/[A-Z]/.test(previousChar) && !/(COD|CODE)$/.test(before)) {
      match = compactPattern.exec(compact)
      continue
    }

    const material = normalizeOcrDigit(match[2])
    const price = normalizeOcrNumber(match[3])
    if (material) candidates.push(`${match[1]}${material}${price ? `-${price}` : ''}`)
    match = compactPattern.exec(compact)
  }

  if (/\bCAJA\b|CAJA/.test(spaced) || /CAJA/.test(compact)) candidates.push('CAJA')

  const cajaPrice = compact.match(/CAJA([0-9OILZS]{1,4})/)
  if (cajaPrice) candidates.push(`CAJA-${normalizeOcrNumber(cajaPrice[1])}`)

  const xBox = spaced.match(/(?:^|\s)X\s*([0-9OILZS]{1,4})?(?:\s|$)/) || compact.match(/^X([0-9OILZS]{1,4})?$/)
  if (xBox) candidates.push(`X${normalizeOcrNumber(xBox[1]) ? `-${normalizeOcrNumber(xBox[1])}` : ''}`)

  return candidates
}

function buildFuzzyCandidates(text) {
  const spaced = text.replace(/[$]/g, ' ').replace(/[^A-Z0-9.?-]+/g, ' ')
  const compact = spaced.replace(/\s+/g, '')
  const candidates = []
  const nearCodePattern = /(?:^|[^A-Z])([APTDIERJC])\s*[-_:.]?\s*([?])?(?:\s*[-_:.]?\s*([0-9OILZS]{1,4}))?/g
  let match = nearCodePattern.exec(spaced)

  while (match) {
    const letter = match[1]
    const price = normalizeOcrNumber(match[3])
    const looksLikeMissingMaterial = Boolean(match[2]) || /[-_:.]\s*$/.test(match[0])

    if (looksLikeMissingMaterial) {
      candidates.push(`${letter}2${price ? `-${price}` : ''}`)
      candidates.push(`${letter}3${price ? `-${price}` : ''}`)
    }

    match = nearCodePattern.exec(spaced)
  }

  const letterDigitPrice = compact.match(/([APTDIERJC])([OILZS])([0-9OILZS]{1,4})?/)
  if (letterDigitPrice) {
    const material = normalizeOcrDigit(letterDigitPrice[2])
    const price = normalizeOcrNumber(letterDigitPrice[3])
    if (material && Number(material) >= 1 && Number(material) <= 4) {
      candidates.push(`${letterDigitPrice[1]}${material}${price ? `-${price}` : ''}`)
    }
  }

  return candidates
}

function normalizeOcrDigit(value) {
  const text = String(value || '').toUpperCase()
  if (text === '?' || text === '') return ''
  if (text === 'I' || text === 'L') return '1'
  if (text === 'Z') return '2'
  return /^[1-4]$/.test(text) ? text : ''
}

function normalizeOcrNumber(value) {
  const text = String(value || '')
    .toUpperCase()
    .replace(/[OI]/g, '0')
    .replace(/[L]/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5')
    .replace(',', '.')
    .replace(/[^0-9.]/g, '')
  const price = Number(text)
  return Number.isFinite(price) && price > 0 ? String(price) : ''
}

function findCodeMatch(code) {
  const spaced = code.replace(/[^A-Z0-9.]+/g, ' ')
  const compact = spaced.replace(/\s+/g, '')

  const cajaMatch = compact.match(/CAJA(?:([0-9]+(?:\.[0-9]+)?))?/)
  if (cajaMatch) {
    return {
      categoryKey: 'CAJA',
      materialDigit: '',
      detectedCode: 'CAJA',
      price: parsePositivePrice(cajaMatch[1])
    }
  }

  const xSpacedMatch = spaced.match(/(?:^|\s)X\s*([0-9]+(?:\.[0-9]+)?)?(?:\s|$)/)
  const xCompactMatch = compact.match(/^X([0-9]+(?:\.[0-9]+)?)?$/)
  const xMatch = xSpacedMatch || xCompactMatch
  if (xMatch) {
    return {
      categoryKey: 'X',
      materialDigit: '',
      detectedCode: 'X',
      price: parsePositivePrice(xMatch[1])
    }
  }

  const compactMatch = compact.match(/([APTDIERJC])([1-4])([0-9]+(?:\.[0-9]+)?)?/)
  if (compactMatch) {
    return {
      categoryKey: compactMatch[1],
      materialDigit: compactMatch[2],
      detectedCode: `${compactMatch[1]}${compactMatch[2]}`,
      price: parsePositivePrice(compactMatch[3])
    }
  }

  const spacedMatch = spaced.match(/([APTDIERJC])\s*([1-4])(?:\s+([0-9]+(?:\.[0-9]+)?))?/)
  if (!spacedMatch) return null

  return {
    categoryKey: spacedMatch[1],
    materialDigit: spacedMatch[2],
    detectedCode: `${spacedMatch[1]}${spacedMatch[2]}`,
    price: parsePositivePrice(spacedMatch[3])
  }
}

function parsePositivePrice(value) {
  const price = Number(value)
  return Number.isFinite(price) && price > 0 ? price : null
}
