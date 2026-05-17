export function buildWhatsAppUrl(sale, ticketText) {
  const digits = String(sale.customerPhone || '').replace(/\D/g, '')
  const phone = digits.length === 10 ? `52${digits}` : digits
  const text = encodeURIComponent(ticketText)

  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`
}
