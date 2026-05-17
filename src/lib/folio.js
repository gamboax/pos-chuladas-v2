export function createFolio(city) {
  return `${cityPrefix(city)}-${Math.floor(10000 + Math.random() * 90000)}`
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

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
