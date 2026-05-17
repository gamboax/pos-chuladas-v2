import { hasSupabaseConfig, supabase } from '../supabase'

const LOCAL_SALES_KEY = 'pos_chuladas_local_sales'
const MISSING_SCHEMA_CODES = new Set(['42P01', 'PGRST200', 'PGRST202', 'PGRST204', 'PGRST205'])
const OPTIONAL_SALE_COLUMNS = ['cashier_id', 'status']

export async function saveSale(sale) {
  if (!hasSupabaseConfig || !supabase) {
    return saveLocalSale(sale, 'Supabase no esta configurado en este entorno.')
  }

  const salePayload = buildSalePayload(sale)
  const saleResult = await insertSaleWithCompatibleColumns(salePayload)

  if (saleResult.localFallback) {
    return saveLocalSale(sale, saleResult.reason)
  }

  if (saleResult.error) {
    throw new Error(`No se pudo guardar en Supabase: ${saleResult.error.message}`)
  }

  const savedSale = saleResult.data
  const saleItems = sale.items.map((item) => ({
    sale_id: savedSale.id,
    category: item.category,
    quantity: Number(item.quantity),
    unit_price: Number(item.unitPrice),
    subtotal: itemSubtotal(item),
    material: item.material || null,
    code_detected: item.code_detected || null,
    capture_origin: item.capture_origin || 'manual'
  }))

  const { error: itemsError } = await supabase.from('sale_items').insert(saleItems)

  if (itemsError) {
    if (isMissingSchemaError(itemsError)) {
      return saveLocalSale(sale, 'La tabla sale_items no existe o no esta expuesta en Supabase.')
    }

    throw new Error(`La venta se creo, pero no se pudieron guardar sus articulos: ${itemsError.message}`)
  }

  return {
    id: savedSale.id,
    created_at: savedSale.created_at,
    storage: 'supabase',
    storageLabel: 'Guardada en Supabase'
  }
}

export async function fetchTodaySalesSummary() {
  const result = await fetchTodayAdminData()
  return {
    storage: result.storage,
    reason: result.reason,
    sales: result.sales
  }
}

export async function fetchTodayAdminData() {
  if (!hasSupabaseConfig || !supabase) {
    return {
      storage: 'local',
      reason: 'Supabase no esta configurado en este entorno.',
      sales: readLocalSales().filter(isTodaySale),
      expenses: [],
      cashCuts: []
    }
  }

  const start = startOfToday()
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  const [salesResult, expensesResult, cashCutsResult] = await Promise.all([
    supabase
      .from('sales')
      .select('id, total, payment_method, created_at')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: false }),
    supabase
      .from('expenses')
      .select('id, city, category, description, amount, payment_method, created_at')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: false }),
    supabase
      .from('cash_cuts')
      .select('id, city, cashier_name, total_sales, expected_cash, cash_counted, transfer_total, card_total, cash_expenses, difference, notes, created_at')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: false })
      .limit(5)
  ])

  if (salesResult.error) {
    if (isMissingSchemaError(salesResult.error)) {
      return {
        storage: 'local',
        reason: 'La tabla sales no existe o no esta expuesta en Supabase.',
        sales: readLocalSales().filter(isTodaySale),
        expenses: [],
        cashCuts: []
      }
    }

    throw new Error(salesResult.error.message || 'No se pudieron cargar ventas del dia.')
  }

  if (expensesResult.error && !isMissingSchemaError(expensesResult.error)) {
    throw new Error(expensesResult.error.message || 'No se pudieron cargar gastos del dia.')
  }

  if (cashCutsResult.error && !isMissingSchemaError(cashCutsResult.error)) {
    throw new Error(cashCutsResult.error.message || 'No se pudieron cargar cortes de caja.')
  }

  return {
    storage: 'supabase',
    reason: expensesResult.error || cashCutsResult.error ? 'Faltan tablas de gastos/cortes. Ejecuta supabase-sales.sql.' : '',
    sales: salesResult.data || [],
    expenses: expensesResult.error ? [] : expensesResult.data || [],
    cashCuts: cashCutsResult.error ? [] : cashCutsResult.data || []
  }
}

export async function saveExpense(expense) {
  requireSupabase('guardar gastos')

  const payload = {
    city: expense.city || null,
    category: expense.category,
    description: expense.description,
    amount: Number(expense.amount),
    payment_method: expense.paymentMethod || 'Efectivo'
  }

  const { data, error } = await supabase
    .from('expenses')
    .insert(payload)
    .select('id, city, category, description, amount, payment_method, created_at')
    .single()

  if (error) {
    throw new Error(buildSupabaseModuleError(error, 'gastos'))
  }

  return data
}

export async function saveCashCut(cut) {
  requireSupabase('guardar corte de caja')

  const payload = {
    city: cut.city,
    cashier_name: cut.cashierName,
    total_sales: Number(cut.totalSales),
    expected_cash: Number(cut.expectedCash),
    cash_counted: Number(cut.cashCounted),
    transfer_total: Number(cut.transferTotal),
    card_total: Number(cut.cardTotal),
    cash_expenses: Number(cut.cashExpenses),
    difference: Number(cut.difference),
    notes: cut.notes || null
  }

  const { data, error } = await supabase
    .from('cash_cuts')
    .insert(payload)
    .select('id, city, cashier_name, total_sales, expected_cash, cash_counted, transfer_total, card_total, cash_expenses, difference, notes, created_at')
    .single()

  if (error) {
    throw new Error(buildSupabaseModuleError(error, 'corte de caja'))
  }

  return data
}

function requireSupabase(action) {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error(`Supabase no esta configurado para ${action}.`)
  }
}

function buildSalePayload(sale) {
  return {
    city: sale.city,
    folio: sale.folio,
    cashier_id: sale.cashierId || null,
    cashier_name: sale.cashierName,
    subtotal: sale.subtotal,
    discount_percent: sale.discountPercent,
    discount_amount: sale.discountAmount,
    total: sale.total,
    payment_method: sale.paymentMethod,
    customer_name: sale.customerName || null,
    customer_whatsapp: sale.customerWhatsapp || null,
    customer_type: sale.customerType || null,
    status: 'completed'
  }
}

async function insertSaleWithCompatibleColumns(payload) {
  let nextPayload = { ...payload }

  for (let attempt = 0; attempt <= OPTIONAL_SALE_COLUMNS.length; attempt += 1) {
    const { data, error } = await supabase
      .from('sales')
      .insert(nextPayload)
      .select('id, created_at')
      .single()

    if (!error) {
      return { data }
    }

    if (isMissingSchemaError(error)) {
      return {
        localFallback: true,
        reason: 'La tabla sales no existe o no esta expuesta en Supabase.'
      }
    }

    const missingColumn = OPTIONAL_SALE_COLUMNS.find((column) => mentionsColumn(error, column))

    if (missingColumn && Object.prototype.hasOwnProperty.call(nextPayload, missingColumn)) {
      nextPayload = { ...nextPayload }
      delete nextPayload[missingColumn]
      continue
    }

    return { error }
  }

  return {
    error: new Error('No se pudo adaptar el guardado a las columnas disponibles en sales.')
  }
}

function saveLocalSale(sale, reason) {
  const now = new Date().toISOString()
  const localSale = {
    ...sale,
    id: `local-${Date.now()}`,
    created_at: now,
    storage: 'local',
    storageLabel: 'Guardada localmente',
    storageReason: reason
  }

  const currentSales = readLocalSales()
  const nextSales = [...currentSales, localSale]
  window.localStorage.setItem(LOCAL_SALES_KEY, JSON.stringify(nextSales))

  return localSale
}

function readLocalSales() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_SALES_KEY) || '[]')
  } catch {
    return []
  }
}

function isTodaySale(sale) {
  const createdAt = new Date(sale.created_at)
  const start = startOfToday()
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  return createdAt >= start && createdAt < end
}

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function itemSubtotal(item) {
  return Number(item.quantity || 0) * Number(item.unitPrice || 0)
}

function buildSupabaseModuleError(error, moduleName) {
  if (isMissingSchemaError(error)) {
    return `No se pudo guardar ${moduleName}: falta la tabla o columnas necesarias. Ejecuta supabase-sales.sql.`
  }

  return error.message || `No se pudo guardar ${moduleName}.`
}

function isMissingSchemaError(error) {
  const message = String(error?.message || '').toLowerCase()
  const details = String(error?.details || '').toLowerCase()

  return (
    MISSING_SCHEMA_CODES.has(error?.code) ||
    message.includes('schema cache') ||
    message.includes('relation') ||
    message.includes('column') ||
    details.includes('schema cache') ||
    details.includes('does not exist')
  )
}

function mentionsColumn(error, column) {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return text.includes(column.toLowerCase())
}
