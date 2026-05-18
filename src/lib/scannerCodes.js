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

  if (!code) {
    return { ok: false, message: 'Escribe un codigo para interpretar.' }
  }

  const categoryKey = code.startsWith('CAJA') ? 'CAJA' : code[0]
  const category = CATEGORY_BY_CODE[categoryKey]

  if (!category) {
    return { ok: false, message: `No reconozco la categoria del codigo ${code}.` }
  }

  const materialDigit = code.match(/[1-4]/)?.[0] || ''

  return {
    ok: true,
    code,
    category,
    material: category === 'Caja' ? '' : MATERIAL_BY_CODE[materialDigit] || ''
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
  return String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}
