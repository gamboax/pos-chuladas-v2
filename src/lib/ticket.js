export function money(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2
  }).format(Number(value) || 0)
}

export function buildTicket(sale) {
  const customerLines = [
    sale.customerName ? `Cliente: ${sale.customerName}` : '',
    sale.customerPhone ? `WhatsApp: ${sale.customerPhone}` : '',
    sale.customerType ? `Tipo cliente: ${sale.customerType}` : ''
  ].filter(Boolean)

  return `JOYERIA CHULADAS MAYOREO

Folio: ${sale.folio}
Ciudad: ${sale.city}
Fecha: ${sale.date} ${sale.time}
Cajero: ${sale.cashier}

ARTICULOS
${sale.items
  .map((item) => {
    const detail = [item.category, item.material, item.code_detected].filter(Boolean).join(' / ')
    return `${item.quantity} x ${detail} @ ${money(item.unitPrice)} = ${money(item.quantity * item.unitPrice)}`
  })
  .join('\n')}

Subtotal: ${money(sale.subtotal)}
Descuento: ${sale.discountPercent}% / -${money(sale.discountAmount)}
TOTAL: ${money(sale.total)}
Pago: ${sale.paymentMethod}
${customerLines.length ? `\n${customerLines.join('\n')}` : ''}

Gracias por tu compra.`
}
