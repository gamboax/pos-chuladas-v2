const USED_FOLIOS_KEY = 'pos_chuladas_used_folios_v2'

export function createFolio(city) {
  const prefix = cityPrefix(city)
  const usedFolios = readUsedFolios()

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const folio = `${prefix}-${Math.floor(10000 + Math.random() * 90000)}`
    if (!usedFolios.has(folio)) {
      rememberFolio(folio, usedFolios)
      return folio
    }
  }

  const fallback = `${prefix}-${String(Date.now()).slice(-5)}`
  rememberFolio(fallback, usedFolios)
  return fallback
}

export function cityPrefix(city) {
  const normalized = normalizeText(city)

  if (normalized === 'rioverde') return 'RIO'
  if (normalized === 'matehuala') return 'MAT'
  if (normalized === 'san luis potosi') return 'SLP'

  const words = normalized.split(' ').filter(Boolean)
  const letters = words.length > 1 ? words.map((word) => word[0]).join('') : normalized.slice(0, 3)

  return (letters || 'POS').slice(0, 3).toUpperCase()
}

function readUsedFolios() {
  if (typeof window === 'undefined') return new Set()

  try {
    return new Set(JSON.parse(window.localStorage.getItem(USED_FOLIOS_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

function rememberFolio(folio, usedFolios) {
  if (typeof window === 'undefined') return

  const nextFolios = [...usedFolios, folio].slice(-500)
  window.localStorage.setItem(USED_FOLIOS_KEY, JSON.stringify(nextFolios))
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}