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
