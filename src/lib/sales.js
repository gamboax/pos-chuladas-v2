import { hasSupabaseConfig, supabase } from '../supabase'

const LOCAL_SALES_KEY = 'pos_chuladas_local_sales'
const MISSING_SCHEMA_CODES = new Set(['42P01', 'PGRST200', 'PGRST202', 'PGRST204', 'PGRST205'])
const OPTIONAL_SALE_COLUMNS = ['cashier_id', 'status', 'discount']
const OPTIONAL_SALE_ITEM_COLUMNS = ['line_total']
const OPTIONAL_SALE_SELECT_COLUMNS = ['status', 'cancellation_reason', 'cancel_reason', 'canceled_reason', 'audit_notes', 'ticket_sent_at']
const OPTIONAL_PURCHASE_LOT_COLUMNS = ['name', 'purchase_place', 'purchase_date', 'total_investment', 'notes', 'total_cost']
const OPTIONAL_PURCHASE_ITEM_COLUMNS = ['product_code_id', 'code', 'quantity_purchased', 'quantity', 'suggested_price', 'total_cost']

export async function saveSale(sale) {
  if (!hasSupabaseConfig || !supabase) {
    return saveLocalSale(sale, 'Supabase no esta configurado en este entorno.')
  }

  const salePayload = buildSalePayload(sale)
  const saleResult = await insertSaleWithCompatibleColumns(salePayload)

  if (saleResult.localFallback) {
    logSupabaseError('[Supabase saveSale] fallback local:', saleResult.reason)
    return saveLocalSale(sale, saleResult.reason)
  }

  if (saleResult.error) {
    logSupabaseError('[Supabase saveSale] sales insert failed:', saleResult.error)
    if (isNetworkError(saleResult.error)) {
      return saveLocalSale(sale, offlineReason())
    }

    throw new Error(`No se pudo guardar en Supabase: ${friendlySupabaseMessage(saleResult.error)}`)
  }

  const savedSale = saleResult.data
  const saleItems = sale.items.map((item) => {
    const subtotal = itemSubtotal(item)
    return {
      sale_id: savedSale.id,
      category: item.category,
      quantity: Number(item.quantity),
      unit_price: Number(item.unitPrice),
      subtotal,
      line_total: subtotal,
      material: item.material || null,
      code_detected: normalizeCode(item.code_detected) || null,
      capture_origin: item.capture_origin || 'manual'
    }
  })

  const { data: savedItems, error: itemsError } = await insertSaleItemsWithCompatibleColumns(saleItems)

  if (itemsError) {
    logSupabaseError('[Supabase saveSale] sale_items insert failed:', itemsError, saleItems)
    const detail = isMissingSchemaError(itemsError)
      ? 'La tabla sale_items no existe o no esta expuesta en Supabase.'
      : friendlySupabaseMessage(itemsError)

    throw new Error(`La venta se creo, pero no se pudieron guardar sus articulos: ${detail}`)
  }

  await relateSaleItemsToInventory(savedItems || [])

  return {
    id: savedSale.id,
    created_at: savedSale.created_at,
    storage: 'supabase',
    storageLabel: 'Guardada en Supabase'
  }
}

export async function fetchTodaySalesSummary(filters = {}) {
  const result = await fetchTodayAdminData(filters)
  return {
    storage: result.storage,
    reason: result.reason,
    sales: result.sales
  }
}

export function getPendingLocalSales(filters = {}) {
  const cityFilter = typeof filters === 'string' ? filters : filters.city
  return readLocalSales()
    .filter((sale) => sale.pendingSync !== false)
    .filter((sale) => matchesCity(sale, cityFilter))
}

export async function retryPendingLocalSales(filters = {}) {
  requireSupabase('sincronizar ventas pendientes')
  const cityFilter = typeof filters === 'string' ? filters : filters.city
  const pendingSales = getPendingLocalSales({ city: cityFilter })
  const synced = []
  const failed = []

  for (const sale of pendingSales) {
    try {
      const result = await saveSaleToSupabase(normalizeLocalSaleForSync(sale))
      synced.push({ localId: sale.id, folio: sale.folio, result })
    } catch (error) {
      failed.push({ sale, error: error.message || 'No se pudo sincronizar.' })
    }
  }

  if (synced.length) {
    const syncedIds = new Set(synced.map((item) => item.localId))
    const remaining = readLocalSales().filter((sale) => !syncedIds.has(sale.id))
    writeLocalSales(remaining)
  }

  return { synced, failed, total: pendingSales.length }
}
export async function fetchTodayAdminData(filters = {}) {
  const cityFilter = typeof filters === 'string' ? filters : filters.city
  const dateFilter = typeof filters === 'object' ? filters.date : ''

  if (!hasSupabaseConfig || !supabase) {
    const localSales = readLocalSales()
      .filter((sale) => isSaleInDate(sale, dateFilter))
      .filter((sale) => matchesCity(sale, cityFilter))

    return {
      storage: 'local',
      reason: 'Supabase no esta configurado en este entorno.',
      sales: localSales,
      expenses: [],
      cashCuts: []
    }
  }

  const start = startOfDay(dateFilter)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  let expensesQuery = supabase
    .from('expenses')
    .select('id, city, category, description, amount, payment_method, created_at')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: false })

  let cashCutsQuery = supabase
    .from('cash_cuts')
    .select('id, city, cashier_name, total_sales, expected_cash, cash_counted, transfer_total, card_total, cash_expenses, difference, notes, created_at')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('created_at', { ascending: false })
    .limit(5)

  if (cityFilter?.trim()) {
    const city = cityFilter.trim()
    expensesQuery = expensesQuery.ilike('city', city)
    cashCutsQuery = cashCutsQuery.ilike('city', city)
  }

  const [salesResult, expensesResult, cashCutsResult] = await Promise.all([
    fetchSalesRows({ start, end, cityFilter }),
    expensesQuery,
    cashCutsQuery
  ])

  if (salesResult.error) {
    logSupabaseError('[Supabase fetchTodayAdminData] sales select failed:', salesResult.error)
    if (isNetworkError(salesResult.error)) {
      return {
        storage: 'local',
        reason: offlineReason(),
        sales: readLocalSales().filter((sale) => isSaleInDate(sale, dateFilter)).filter((sale) => matchesCity(sale, cityFilter)),
        expenses: [],
        cashCuts: []
      }
    }

    if (isMissingSchemaError(salesResult.error)) {
      return {
        storage: 'local',
        reason: 'La tabla sales no existe o no esta expuesta en Supabase.',
        sales: readLocalSales().filter((sale) => isSaleInDate(sale, dateFilter)).filter((sale) => matchesCity(sale, cityFilter)),
        expenses: [],
        cashCuts: []
      }
    }

    throw new Error(friendlySupabaseMessage(salesResult.error) || 'No se pudieron cargar ventas del dia.')
  }

  let saleItemsResult = { data: [], error: null }
  const saleIds = (salesResult.data || []).map((sale) => sale.id).filter(Boolean)

  if (saleIds.length) {
    saleItemsResult = await fetchSaleItemsForSales(saleIds)
  }

  if (expensesResult.error && !isMissingSchemaError(expensesResult.error)) {
    logSupabaseError('[Supabase fetchTodayAdminData] expenses select failed:', expensesResult.error)
    if (!isNetworkError(expensesResult.error)) {
      throw new Error(friendlySupabaseMessage(expensesResult.error) || 'No se pudieron cargar gastos del dia.')
    }
  }

  if (cashCutsResult.error && !isMissingSchemaError(cashCutsResult.error)) {
    logSupabaseError('[Supabase fetchTodayAdminData] cash_cuts select failed:', cashCutsResult.error)
    if (!isNetworkError(cashCutsResult.error)) {
      throw new Error(friendlySupabaseMessage(cashCutsResult.error) || 'No se pudieron cargar cortes de caja.')
    }
  }

  return {
    storage: 'supabase',
    reason: buildAdminDataReason(expensesResult.error, cashCutsResult.error, saleItemsResult.error),
    city: cityFilter || '',
    sales: attachSaleItems(salesResult.data || [], saleItemsResult.data || []),
    expenses: expensesResult.error ? [] : expensesResult.data || [],
    cashCuts: cashCutsResult.error ? [] : cashCutsResult.data || []
  }
}

export async function cancelSale(saleId, reason) {
  requireSupabase('anular ventas')

  if (!reason?.trim()) {
    throw new Error('Escribe un motivo para anular la venta.')
  }

  const payload = {
    status: 'cancelled',
    cancellation_reason: reason.trim(),
    cancel_reason: reason.trim(),
    canceled_reason: reason.trim(),
    audit_notes: reason.trim(),
    updated_at: new Date().toISOString()
  }
  const result = await updateSaleWithCompatibleColumns(saleId, payload, ['cancellation_reason', 'cancel_reason', 'canceled_reason', 'audit_notes', 'updated_at'])

  if (result.error) {
    if (mentionsColumn(result.error, 'status')) {
      throw new Error('Para anular ventas falta la columna status en sales. ALTER sugerido: add column status text default completed.')
    }
    throw new Error(friendlySupabaseMessage(result.error) || 'No se pudo anular la venta.')
  }

  return result.data
}

export async function markTicketSent(saleId) {
  requireSupabase('marcar ticket enviado')

  const result = await updateSaleWithCompatibleColumns(saleId, { ticket_sent_at: new Date().toISOString() }, [])

  if (result.error) {
    if (mentionsColumn(result.error, 'ticket_sent_at')) {
      throw new Error('Para marcar tickets enviados falta la columna ticket_sent_at en sales.')
    }
    throw new Error(friendlySupabaseMessage(result.error) || 'No se pudo marcar el ticket.')
  }

  return result.data
}
export async function fetchInventoryData() {
  if (!hasSupabaseConfig || !supabase) {
    return {
      storage: 'local',
      reason: 'Supabase no esta configurado para inventario.',
      lots: [],
      lotItems: [],
      productCodes: [],
      saleItems: []
    }
  }

  const [lotsResult, lotItemsResult, codesResult, saleItemsResult] = await Promise.all([
    supabase
      .from('purchase_lots')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('purchase_lot_items')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('product_codes')
      .select('*'),
    supabase
      .from('sale_items')
      .select('id, quantity, unit_price, subtotal, code_detected, product_code_id, purchase_lot_item_id, unit_cost, estimated_profit, created_at')
      .not('code_detected', 'is', null)
  ])

  if (lotsResult.error || lotItemsResult.error) {
    const error = lotsResult.error || lotItemsResult.error
    logSupabaseError('[Supabase fetchInventoryData] inventory select failed:', error)
    if (isNetworkError(error)) {
      return {
        storage: 'local',
        reason: offlineReason(),
        lots: [],
        lotItems: [],
        productCodes: [],
        saleItems: []
      }
    }

    if (isMissingSchemaError(error)) {
      return {
        storage: 'supabase',
        reason: 'Faltan tablas de inventario. Ejecuta el ALTER puntual de Supabase.',
        lots: [],
        lotItems: [],
        productCodes: [],
        saleItems: []
      }
    }

    throw new Error(friendlySupabaseMessage(error) || 'No se pudo cargar inventario.')
  }

  if (codesResult.error && !isMissingSchemaError(codesResult.error)) {
    logSupabaseError('[Supabase fetchInventoryData] product_codes select failed:', codesResult.error)
    throw new Error(friendlySupabaseMessage(codesResult.error) || 'No se pudieron cargar codigos de producto.')
  }

  if (saleItemsResult.error && !isMissingSchemaError(saleItemsResult.error)) {
    logSupabaseError('[Supabase fetchInventoryData] sale_items select failed:', saleItemsResult.error)
    throw new Error(friendlySupabaseMessage(saleItemsResult.error) || 'No se pudieron cargar ventas por codigo.')
  }

  return {
    storage: 'supabase',
    reason: codesResult.error || saleItemsResult.error ? 'Faltan columnas/codigos de inventario. Ejecuta el ALTER puntual de Supabase.' : '',
    lots: lotsResult.data || [],
    lotItems: lotItemsResult.data || [],
    productCodes: codesResult.error ? [] : codesResult.data || [],
    saleItems: saleItemsResult.error ? [] : saleItemsResult.data || []
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

  const result = await insertWithCompatibleColumns('expenses', payload, ['payment_method', 'city'])

  if (result.error) {
    logSupabaseError('[Supabase saveExpense] insert failed:', result.error, payload)
    throw new Error(buildSupabaseModuleError(result.error, 'gastos'))
  }

  return result.data
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
    system_total: Number(cut.totalSales),
    closing_amount: Number(cut.cashCounted),
    difference_amount: Number(cut.difference),
    notes: cut.notes || null
  }

  const optionalColumns = ['total_sales', 'expected_cash', 'cash_counted', 'transfer_total', 'card_total', 'cash_expenses', 'difference', 'system_total', 'closing_amount', 'difference_amount', 'city']
  const result = await insertWithCompatibleColumns('cash_cuts', payload, optionalColumns)

  if (result.error) {
    logSupabaseError('[Supabase saveCashCut] insert failed:', result.error, payload)
    throw new Error(buildSupabaseModuleError(result.error, 'corte de caja'))
  }

  return result.data
}

export async function savePurchaseLot(lot) {
  requireSupabase('guardar lotes de compra')

  const payload = {
    name: lot.name || null,
    supplier: lot.supplier || null,
    purchase_place: lot.purchasePlace || null,
    purchase_date: lot.purchaseDate || null,
    total_investment: Number(lot.totalInvestment || 0),
    total_cost: Number(lot.totalInvestment || 0),
    notes: lot.notes || null
  }

  const result = await insertWithCompatibleColumns('purchase_lots', payload, OPTIONAL_PURCHASE_LOT_COLUMNS)

  if (result.error) {
    logSupabaseError('[Supabase savePurchaseLot] insert failed:', result.error, payload)
    throw new Error(buildSupabaseModuleError(result.error, 'lote de compra'))
  }

  return result.data
}

export async function createPurchaseLot(lot) {
  return savePurchaseLot(lot)
}

export async function savePurchaseLotItem(item) {
  requireSupabase('guardar articulos de lote')

  const productCode = await ensureProductCode({
    code: item.code,
    category: item.category,
    material: item.material,
    unitCost: Number(item.unitCost || 0),
    suggestedPrice: Number(item.suggestedPrice || 0)
  })

  const quantityPurchased = Number(item.quantityPurchased || 0)
  const unitCost = Number(item.unitCost || 0)
  const payload = {
    lot_id: item.lotId,
    product_code_id: productCode?.id || null,
    code: normalizeCode(item.code),
    category: item.category,
    material: item.material,
    quantity_purchased: quantityPurchased,
    quantity: quantityPurchased,
    unit_cost: unitCost,
    suggested_price: Number(item.suggestedPrice || 0),
    total_cost: quantityPurchased * unitCost
  }

  const result = await insertWithCompatibleColumns('purchase_lot_items', payload, OPTIONAL_PURCHASE_ITEM_COLUMNS)

  if (result.error) {
    logSupabaseError('[Supabase savePurchaseLotItem] insert failed:', result.error, payload)
    throw new Error(buildSupabaseModuleError(result.error, 'articulo de lote'))
  }

  await updateProductCodeInventoryLink(productCode?.id, result.data)
  return result.data
}

export async function createPurchaseLotItem(item) {
  return savePurchaseLotItem(item)
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
    discount: sale.discountAmount,
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

    if (isNetworkError(error)) {
      return {
        localFallback: true,
        reason: offlineReason()
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

async function fetchSalesRows({ start, end, cityFilter }) {
  const baseColumns = ['id', 'folio', 'city', 'cashier_name', 'subtotal', 'discount_amount', 'total', 'payment_method', 'customer_name', 'customer_whatsapp', 'customer_type', 'created_at']
  let optionalColumns = [...OPTIONAL_SALE_SELECT_COLUMNS]

  while (true) {
    let query = supabase
      .from('sales')
      .select([...baseColumns, ...optionalColumns].join(', '))
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: false })

    if (cityFilter?.trim()) {
      query = query.ilike('city', cityFilter.trim())
    }

    const { data, error } = await query

    if (!error) return { data, error: null }

    const missingColumn = optionalColumns.find((column) => mentionsColumn(error, column))

    if (missingColumn) {
      optionalColumns = optionalColumns.filter((column) => column !== missingColumn)
      continue
    }

    return { data: null, error }
  }
}

async function insertSaleItemsWithCompatibleColumns(items) {
  let nextItems = items.map((item) => ({ ...item }))

  for (let attempt = 0; attempt <= OPTIONAL_SALE_ITEM_COLUMNS.length; attempt += 1) {
    const { data, error } = await supabase
      .from('sale_items')
      .insert(nextItems)
      .select('id, code_detected, quantity, unit_price, subtotal')

    if (!error) {
      return { data, error: null }
    }

    const missingColumn = OPTIONAL_SALE_ITEM_COLUMNS.find((column) => mentionsColumn(error, column))

    if (missingColumn) {
      logSupabaseError('[Supabase sale_items] retry without missing column:', missingColumn, error)
      nextItems = nextItems.map((item) => {
        const nextItem = { ...item }
        delete nextItem[missingColumn]
        return nextItem
      })
      continue
    }

    return { data: null, error }
  }

  return {
    data: null,
    error: new Error('No se pudo adaptar el guardado a las columnas disponibles en sale_items.')
  }
}

async function updateSaleWithCompatibleColumns(saleId, payload, optionalColumns) {
  let nextPayload = { ...payload }

  for (let attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
    const { data, error } = await supabase
      .from('sales')
      .update(nextPayload)
      .eq('id', saleId)
      .select('*')
      .single()

    if (!error) return { data, error: null }

    const missingColumn = optionalColumns.find((column) => mentionsColumn(error, column))

    if (missingColumn && Object.prototype.hasOwnProperty.call(nextPayload, missingColumn)) {
      nextPayload = { ...nextPayload }
      delete nextPayload[missingColumn]
      continue
    }

    return { data: null, error }
  }

  return { data: null, error: new Error('No se pudo adaptar la actualizacion a las columnas disponibles en sales.') }
}

async function fetchSaleItemsForSales(saleIds) {
  const baseColumns = ['id', 'sale_id', 'category', 'quantity', 'unit_price', 'subtotal', 'material', 'code_detected', 'capture_origin', 'created_at']
  let optionalColumns = ['unit_cost', 'estimated_profit', 'product_code_id', 'purchase_lot_item_id']

  while (true) {
    const selectColumns = [...baseColumns, ...optionalColumns].join(', ')
    const { data, error } = await supabase
      .from('sale_items')
      .select(selectColumns)
      .in('sale_id', saleIds)

    if (!error) return { data, error: null }

    const missingColumn = optionalColumns.find((column) => mentionsColumn(error, column))

    if (missingColumn) {
      optionalColumns = optionalColumns.filter((column) => column !== missingColumn)
      continue
    }

    if (!isMissingSchemaError(error)) {
      logSupabaseError('[Supabase fetchTodayAdminData] sale_items select failed:', error)
    }

    return { data: [], error }
  }
}

function attachSaleItems(sales, saleItems) {
  const itemsBySaleId = new Map()

  saleItems.forEach((item) => {
    const currentItems = itemsBySaleId.get(item.sale_id) || []
    currentItems.push(item)
    itemsBySaleId.set(item.sale_id, currentItems)
  })

  return sales.map((sale) => ({
    ...sale,
    items: itemsBySaleId.get(sale.id) || []
  }))
}

async function insertWithCompatibleColumns(tableName, payload, optionalColumns) {
  let nextPayload = { ...payload }

  for (let attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
    const { data, error } = await supabase
      .from(tableName)
      .insert(nextPayload)
      .select('*')
      .single()

    if (!error) {
      return { data }
    }

    const missingColumn = optionalColumns.find((column) => mentionsColumn(error, column))

    if (missingColumn && Object.prototype.hasOwnProperty.call(nextPayload, missingColumn)) {
      logSupabaseError(`[Supabase ${tableName}] retry without missing column:`, missingColumn, error)
      nextPayload = { ...nextPayload }
      delete nextPayload[missingColumn]
      continue
    }

    return { error }
  }

  return {
    error: new Error(`No se pudo adaptar el guardado a las columnas disponibles en ${tableName}.`)
  }
}

async function ensureProductCode(item) {
  const code = normalizeCode(item.code)
  if (!code) return null

  const payload = {
    code,
    category: item.category || null,
    material: item.material || null,
    unit_cost: Number(item.unitCost || 0),
    suggested_price: Number(item.suggestedPrice || 0)
  }

  const { data: existing, error: selectError } = await supabase
    .from('product_codes')
    .select('*')
    .eq('code', code)
    .maybeSingle()

  if (selectError && !isMissingSchemaError(selectError)) {
    logSupabaseError('[Supabase ensureProductCode] select failed:', selectError, payload)
    throw new Error(buildSupabaseModuleError(selectError, 'codigo de producto'))
  }

  if (existing?.id) {
    throw new Error(`El codigo ${code} ya existe en product_codes. Usa otro codigo o revisa el lote anterior.`)
  }

  const result = await insertWithCompatibleColumns('product_codes', payload, ['unit_cost', 'suggested_price'])

  if (result.error) {
    logSupabaseError('[Supabase ensureProductCode] insert failed:', result.error, payload)
    throw new Error(buildSupabaseModuleError(result.error, 'codigo de producto'))
  }

  return result.data
}

async function updateProductCodeInventoryLink(productCodeId, lotItem) {
  if (!productCodeId || !lotItem?.id) return

  const payload = {
    purchase_lot_item_id: lotItem.id,
    purchase_lot_id: lotItem.lot_id || null,
    unit_cost: Number(lotItem.unit_cost || 0),
    suggested_price: Number(lotItem.suggested_price || 0)
  }

  const { error } = await supabase
    .from('product_codes')
    .update(payload)
    .eq('id', productCodeId)

  if (error && !isMissingSchemaError(error)) {
    logSupabaseError('[Supabase updateProductCodeInventoryLink] update failed:', error, payload)
  }
}

async function relateSaleItemsToInventory(savedItems) {
  const codedItems = savedItems.filter((item) => item.code_detected)
  if (!codedItems.length || !supabase) return

  const codes = [...new Set(codedItems.map((item) => normalizeCode(item.code_detected)).filter(Boolean))]
  const { data: productCodes, error } = await supabase
    .from('product_codes')
    .select('*')
    .in('code', codes)

  if (error) {
    logSupabaseError('[Supabase relateSaleItemsToInventory] product_codes lookup failed:', error, codes)
    return
  }

  if (!productCodes?.length) return

  const productCodeIds = productCodes.map((row) => row.id).filter(Boolean)
  const { data: lotItems, error: lotItemsError } = await supabase
    .from('purchase_lot_items')
    .select('*')
    .in('product_code_id', productCodeIds)

  if (lotItemsError && !isMissingSchemaError(lotItemsError)) {
    logSupabaseError('[Supabase relateSaleItemsToInventory] lot item lookup by product_code_id failed:', lotItemsError)
  }

  for (const saleItem of codedItems) {
    const code = normalizeCode(saleItem.code_detected)
    const productCode = productCodes.find((row) => normalizeCode(row.code) === code)
    if (!productCode) continue

    const lotItem = (lotItems || []).find((row) => row.product_code_id === productCode.id) || null
    const unitCost = Number(lotItem?.unit_cost || productCode.unit_cost || 0)
    const quantity = Number(saleItem.quantity || 0)
    const subtotal = Number(saleItem.subtotal || quantity * Number(saleItem.unit_price || 0))
    const updatePayload = {
      product_code_id: productCode.id,
      purchase_lot_item_id: lotItem?.id || productCode.purchase_lot_item_id || null,
      unit_cost: unitCost,
      line_total: subtotal,
      estimated_profit: subtotal - quantity * unitCost
    }

    const { error: updateError } = await supabase
      .from('sale_items')
      .update(updatePayload)
      .eq('id', saleItem.id)

    if (updateError) {
      logSupabaseError('[Supabase relateSaleItemsToInventory] sale_item relation update failed:', updateError, updatePayload)
      if (!isMissingSchemaError(updateError)) return
    }
  }
}

function saveLocalSale(sale, reason) {
  const now = new Date().toISOString()
  const localSale = {
    ...sale,
    id: `local-${Date.now()}`,
    created_at: now,
    storage: 'local',
    storageLabel: 'Pendiente de sincronizar',
    storageReason: reason,
    pendingSync: true
  }

  const currentSales = readLocalSales()
  const nextSales = [...currentSales.filter((sale) => sale.folio !== localSale.folio), localSale]
  writeLocalSales(nextSales)

  return localSale
}

function readLocalSales() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_SALES_KEY) || '[]')
  } catch {
    return []
  }
}

function writeLocalSales(sales) {
  window.localStorage.setItem(LOCAL_SALES_KEY, JSON.stringify(sales))
}

function normalizeLocalSaleForSync(sale) {
  return {
    ...sale,
    cashierName: sale.cashierName || sale.cashier || sale.cashier_name,
    customerName: sale.customerName || sale.customer_name || '',
    customerWhatsapp: sale.customerWhatsapp || sale.customerPhone || sale.customer_whatsapp || '',
    customerType: sale.customerType || sale.customer_type || '',
    paymentMethod: sale.paymentMethod || sale.payment_method,
    discountPercent: Number(sale.discountPercent ?? sale.discount_percent ?? 0),
    discountAmount: Number(sale.discountAmount ?? sale.discount_amount ?? 0),
    items: (sale.items || []).map((item) => ({
      ...item,
      unitPrice: Number(item.unitPrice ?? item.unit_price ?? 0)
    }))
  }
}

async function saveSaleToSupabase(sale) {
  const salePayload = buildSalePayload(sale)
  const saleResult = await insertSaleWithCompatibleColumns(salePayload)

  if (saleResult.localFallback) {
    throw new Error(saleResult.reason)
  }

  if (saleResult.error) {
    throw new Error(friendlySupabaseMessage(saleResult.error) || 'No se pudo guardar en Supabase.')
  }

  const savedSale = saleResult.data
  const saleItems = sale.items.map((item) => {
    const subtotal = itemSubtotal(item)
    return {
      sale_id: savedSale.id,
      category: item.category,
      quantity: Number(item.quantity),
      unit_price: Number(item.unitPrice),
      subtotal,
      line_total: subtotal,
      material: item.material || null,
      code_detected: normalizeCode(item.code_detected) || null,
      capture_origin: item.capture_origin || 'manual'
    }
  })

  const { data: savedItems, error: itemsError } = await insertSaleItemsWithCompatibleColumns(saleItems)

  if (itemsError) {
    const detail = isMissingSchemaError(itemsError)
      ? 'La tabla sale_items no existe o no esta expuesta en Supabase.'
      : friendlySupabaseMessage(itemsError)
    throw new Error(`La venta se creo, pero no se pudieron guardar sus articulos: ${detail}`)
  }

  await relateSaleItemsToInventory(savedItems || [])

  return {
    id: savedSale.id,
    created_at: savedSale.created_at,
    storage: 'supabase',
    storageLabel: 'Guardada en Supabase'
  }
}

function matchesCity(row, city) {
  if (!city?.trim()) return true
  return String(row.city || '').trim().toLowerCase() === city.trim().toLowerCase()
}

function isSaleInDate(sale, dateFilter) {
  const createdAt = new Date(sale.created_at)
  const start = startOfDay(dateFilter)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  return createdAt >= start && createdAt < end
}

function startOfDay(dateFilter) {
  const date = dateFilter ? new Date(`${dateFilter}T00:00:00`) : new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function itemSubtotal(item) {
  return Number(item.quantity || 0) * Number(item.unitPrice || 0)
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase()
}

function buildAdminDataReason(expensesError, cashCutsError, saleItemsError) {
  if (isNetworkError(expensesError) || isNetworkError(cashCutsError) || isNetworkError(saleItemsError)) return offlineReason()
  if (saleItemsError) return 'No se pudieron cargar articulos de venta; algunos analytics pueden verse incompletos.'
  if (expensesError || cashCutsError) return 'Faltan tablas de gastos/cortes. Ejecuta el ALTER puntual de Supabase.'
  return ''
}

function offlineReason() {
  return 'Sin conexion con Supabase. Revisa internet; las ventas pueden quedar en modo local.'
}

function friendlySupabaseMessage(error) {
  if (isNetworkError(error)) return offlineReason()
  return error?.message || ''
}

function isNetworkError(error) {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return text.includes('fetch failed') || text.includes('network') || text.includes('failed to fetch') || text.includes('load failed')
}

function logSupabaseError(...args) {
  if (import.meta.env.DEV) {
    console.warn(...args)
  }
}

function buildSupabaseModuleError(error, moduleName) {
  if (isNetworkError(error)) {
    return `${offlineReason()} No se pudo guardar ${moduleName} en Supabase.`
  }

  if (isMissingSchemaError(error)) {
    return `No se pudo guardar ${moduleName}: falta la tabla o columnas necesarias. Ejecuta el ALTER puntual de Supabase.`
  }

  return friendlySupabaseMessage(error) || `No se pudo guardar ${moduleName}.`
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
