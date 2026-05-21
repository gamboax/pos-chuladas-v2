import { hasSupabaseConfig, supabase } from '../supabase'

const LOCAL_SALES_KEY = 'pos_chuladas_local_sales'
const LOCAL_BACKUPS_KEY = 'pos_chuladas_sale_backups_v1'
const SAVE_ATTEMPTS_KEY = 'pos_chuladas_save_attempts'
const LOCAL_SESSION_KEY = 'pos_chuladas_device_session_id'
const MAX_SAVE_ATTEMPTS = 40
const MISSING_SCHEMA_CODES = new Set(['42P01', 'PGRST200', 'PGRST202', 'PGRST204', 'PGRST205'])
const OPTIONAL_SALE_COLUMNS = ['cashier_id', 'status', 'discount', 'operator_name', 'local_sale_id', 'device_session_id', 'source', 'imported_partial', 'original_source_id', 'imported_at', 'import_notes', 'created_at']
const OPTIONAL_SALE_ITEM_COLUMNS = ['line_total']
const OPTIONAL_SALE_SELECT_COLUMNS = ['status', 'cancellation_reason', 'cancel_reason', 'canceled_reason', 'audit_notes', 'ticket_sent_at', 'source', 'imported_partial', 'original_source_id', 'imported_at', 'import_notes']
const OPTIONAL_PURCHASE_LOT_COLUMNS = ['name', 'purchase_place', 'purchase_date', 'total_investment', 'notes', 'total_cost']
const OPTIONAL_PURCHASE_ITEM_COLUMNS = ['product_code_id', 'code', 'quantity_purchased', 'quantity', 'suggested_price', 'total_cost']

let pendingSyncInFlight = false

export async function saveSale(sale) {
  const safeSale = normalizeSaleForPersistence(sale)
  const guaranteedBackup = persistSaleDraftBeforeAnything(safeSale, {
    stage: 'saveSale_entry',
    ticketText: sale.ticketText || ''
  })
  const salePayload = buildSalePayload(safeSale)
  const saleItemsPayload = buildSaleItemsPayload('pending-sale-id', safeSale.items)
  const localBackup = saveLocalSale(
    { ...safeSale, localSaleId: guaranteedBackup.localSaleId, clientSaleId: guaranteedBackup.localSaleId },
    hasSupabaseConfig && supabase ? 'Respaldo local antes de sincronizar.' : 'Supabase no esta configurado en este entorno.',
    { syncStatus: 'pending', syncError: '' }
  )

  recordSaleSaveAttempt({
    status: hasSupabaseConfig && supabase ? 'syncing' : 'pending',
    stage: hasSupabaseConfig && supabase ? 'local_backup' : 'local_only',
    sale: safeSale,
    salePayload,
    saleItemsPayload,
    error: hasSupabaseConfig && supabase ? '' : 'Supabase no esta configurado en este entorno.'
  })

  if (!hasSupabaseConfig || !supabase) {
    return localBackup
  }

  try {
    const savedSale = await saveSaleToSupabase(safeSale)
    markLocalSaleSynced(localBackup.id, safeSale.folio, savedSale)
    recordSaleSaveAttempt({
      status: 'synced',
      stage: savedSale.storageLabel || 'supabase_saved',
      sale: safeSale,
      salePayload,
      saleItemsPayload,
      supabaseId: savedSale.id
    })
    markSaleBackupStatus(guaranteedBackup.localSaleId, safeSale.folio, {
      status: 'synced',
      supabaseId: savedSale.id,
      error: '',
      syncedAt: new Date().toISOString()
    })
    return savedSale
  } catch (error) {
    const message = error.message || 'No se pudo sincronizar la venta.'
    logSupabaseError('[Supabase saveSale] kept local fallback:', message, { salePayload, saleItemsPayload })
    const pendingSale = markLocalSaleError(localBackup.id, safeSale.folio, message)
    recordSaleSaveAttempt({
      status: 'error',
      stage: 'supabase_failed_pending_local',
      sale: safeSale,
      salePayload,
      saleItemsPayload,
      error: message
    })
    markSaleBackupStatus(guaranteedBackup.localSaleId, safeSale.folio, {
      status: 'pending',
      error: message
    })
    return pendingSale || localBackup
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

export function getSaleSaveAttempts(filters = {}) {
  const cityFilter = typeof filters === 'string' ? filters : filters.city
  return readSaveAttempts()
    .filter((attempt) => matchesCity(attempt, cityFilter))
    .slice(0, MAX_SAVE_ATTEMPTS)
}

export function persistSaleDraftBeforeAnything(sale, metadata = {}) {
  const safeSale = normalizeSaleForPersistence(sale)
  const localSaleId = safeSale.localSaleId || safeSale.clientSaleId || createLocalSaleId()
  const createdAt = safeSale.createdAt || safeSale.created_at || new Date().toISOString()
  const deviceSessionId = getDeviceSessionId()
  const saleWithIds = {
    ...safeSale,
    localSaleId,
    clientSaleId: localSaleId,
    createdAt,
    deviceSessionId
  }
  const backup = {
    id: localSaleId,
    localSaleId,
    deviceSessionId,
    checksum: saleChecksum(saleWithIds),
    created_at: createdAt,
    updated_at: new Date().toISOString(),
    city: saleWithIds.city,
    folio: saleWithIds.folio,
    total: saleWithIds.total,
    itemsCount: saleWithIds.items.length,
    status: metadata.status || 'pending',
    stage: metadata.stage || 'local_backup',
    error: metadata.error || '',
    supabaseId: metadata.supabaseId || '',
    ticketText: metadata.ticketText || sale.ticketText || '',
    sale: saleWithIds,
    salePayload: buildSalePayload(saleWithIds),
    saleItemsPayload: buildSaleItemsPayload('pending-sale-id', saleWithIds.items)
  }

  upsertSaleBackup(backup)
  return backup
}

export function getLocalSaleBackups(filters = {}) {
  const cityFilter = typeof filters === 'string' ? filters : filters.city
  const backups = readSaleBackups().filter((sale) => matchesCity(sale, cityFilter))
  const localSales = readLocalSales()
    .filter((sale) => matchesCity(sale, cityFilter))
    .map((sale) => {
      try {
        const safeSale = normalizeSaleForPersistence(sale)
        return {
          id: sale.localSaleId || sale.clientSaleId || sale.id || sale.folio,
          localSaleId: sale.localSaleId || sale.clientSaleId || sale.id,
          created_at: sale.created_at,
          updated_at: sale.updated_at || sale.created_at,
          city: sale.city,
          folio: sale.folio,
          total: Number(sale.total || 0),
          itemsCount: (sale.items || []).length,
          status: sale.pendingSync === false ? 'synced' : sale.syncStatus || 'pending',
          error: sale.syncError || sale.storageReason || '',
          sale: safeSale,
          salePayload: buildSalePayload(safeSale),
          saleItemsPayload: buildSaleItemsPayload('pending-sale-id', safeSale.items)
        }
      } catch (error) {
        return {
          id: sale.localSaleId || sale.clientSaleId || sale.id || sale.folio || createLocalSaleId(),
          localSaleId: sale.localSaleId || sale.clientSaleId || sale.id,
          created_at: sale.created_at || new Date().toISOString(),
          updated_at: sale.updated_at || sale.created_at || new Date().toISOString(),
          city: sale.city,
          folio: sale.folio,
          total: Number(sale.total || 0),
          itemsCount: (sale.items || []).length,
          status: 'error',
          error: error.message || 'Respaldo local invalido.',
          sale,
          salePayload: sale,
          saleItemsPayload: []
        }
      }
    })
  const merged = new Map()

  ;[...backups, ...localSales].forEach((backup) => {
    const key = backup.localSaleId || backup.id || backup.folio
    if (!key || merged.has(key)) return
    merged.set(key, backup)
  })

  return [...merged.values()].sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
}

export function getUnsyncedLocalBackups(filters = {}) {
  return getLocalSaleBackups(filters).filter((backup) => backup.status !== 'synced')
}

export function clearLocalEventBackups(filters = {}) {
  const cityFilter = typeof filters === 'string' ? filters : filters.city
  const before = readSaleBackups()
  const removed = before.filter((backup) => matchesCity(backup, cityFilter))
  const kept = before.filter((backup) => !matchesCity(backup, cityFilter))
  writeSaleBackups(kept)

  const localBefore = readLocalSales()
  const localRemoved = localBefore.filter((sale) => matchesCity(sale, cityFilter))
  const localKept = localBefore.filter((sale) => !matchesCity(sale, cityFilter))
  writeLocalSales(localKept)

  return { removed: removed.length + localRemoved.length }
}

export function assertSalePersistence({ folio, localSaleId, city } = {}) {
  const backups = getLocalSaleBackups({ city })
  const backup = backups.find((item) => (
    (folio && item.folio === folio) ||
    (localSaleId && (item.localSaleId === localSaleId || item.id === localSaleId))
  ))

  if (!backup) {
    throw new Error('No se pudo confirmar respaldo local de la venta. Revisa recuperacion local o exporta emergencia.')
  }

  return backup
}

export function exportLocalSaleBackups(filters = {}) {
  return {
    exported_at: new Date().toISOString(),
    device_session_id: getDeviceSessionId(),
    backups: getLocalSaleBackups(filters),
    attempts: getSaleSaveAttempts(filters)
  }
}

export async function recoverLocalSalesOnStartup(filters = {}) {
  if (!hasSupabaseConfig || !supabase) {
    return { synced: [], failed: [], total: getUnsyncedLocalBackups(filters).length, skipped: true }
  }

  const unsynced = getUnsyncedLocalBackups(filters)
  if (!unsynced.length) return { synced: [], failed: [], total: 0, skipped: false }

  return retryLocalSaleBackups(filters)
}

export async function retryPendingLocalSales(filters = {}) {
  requireSupabase('sincronizar ventas pendientes')
  if (pendingSyncInFlight) {
    throw new Error('Ya hay una sincronizacion en curso.')
  }

  pendingSyncInFlight = true
  const cityFilter = typeof filters === 'string' ? filters : filters.city
  const pendingSales = getPendingLocalSales({ city: cityFilter })
  const synced = []
  const failed = []
  const pendingIds = new Set(pendingSales.map((sale) => sale.id))
  const syncStartedAt = new Date().toISOString()

  if (!pendingSales.length) {
    pendingSyncInFlight = false
    return { synced, failed, total: 0 }
  }

  writeLocalSales(readLocalSales().map((sale) => (
    pendingIds.has(sale.id)
      ? { ...sale, syncStatus: 'syncing', syncingAt: syncStartedAt, syncError: '' }
      : sale
  )))

  try {
    for (const sale of pendingSales) {
      const safeSale = normalizeSaleForPersistence(normalizeLocalSaleForSync(sale))
      const salePayload = buildSalePayload(safeSale)
      const saleItemsPayload = buildSaleItemsPayload('pending-sale-id', safeSale.items)
      recordSaleSaveAttempt({
        status: 'syncing',
        stage: 'retry_pending',
        sale: safeSale,
        salePayload,
        saleItemsPayload
      })
      try {
        const result = await saveSaleToSupabase(safeSale)
        recordSaleSaveAttempt({
          status: 'synced',
          stage: 'retry_pending_saved',
          sale: safeSale,
          salePayload,
          saleItemsPayload,
          supabaseId: result.id
        })
        markSaleBackupStatus(safeSale.localSaleId || safeSale.clientSaleId || sale.id, safeSale.folio, {
          status: 'synced',
          supabaseId: result.id,
          error: '',
          syncedAt: new Date().toISOString()
        })
        synced.push({ localId: sale.id, folio: sale.folio, result })
      } catch (error) {
        recordSaleSaveAttempt({
          status: 'error',
          stage: 'retry_pending_failed',
          sale: safeSale,
          salePayload,
          saleItemsPayload,
          error: error.message || 'No se pudo sincronizar.'
        })
        markSaleBackupStatus(safeSale.localSaleId || safeSale.clientSaleId || sale.id, safeSale.folio, {
          status: 'pending',
          error: error.message || 'No se pudo sincronizar.'
        })
        failed.push({ sale, error: error.message || 'No se pudo sincronizar.' })
      }
    }

    const syncedIds = new Set(synced.map((item) => item.localId))
    const failedById = new Map(failed.map((item) => [item.sale.id, item.error]))
    const remaining = readLocalSales()
      .filter((sale) => !syncedIds.has(sale.id))
      .map((sale) => failedById.has(sale.id)
        ? {
            ...sale,
            syncStatus: 'error',
            syncError: failedById.get(sale.id),
            syncAttempts: Number(sale.syncAttempts || 0) + 1,
            syncingAt: ''
          }
        : sale)
    writeLocalSales(remaining)
  } finally {
    pendingSyncInFlight = false
  }

  return { synced, failed, total: pendingSales.length }
}

export async function retryLocalSaleBackups(filters = {}) {
  requireSupabase('recuperar respaldos locales')

  const cityFilter = typeof filters === 'string' ? filters : filters.city
  const backups = getLocalSaleBackups({ city: cityFilter }).filter((backup) => backup.status !== 'synced')
  const synced = []
  const failed = []

  for (const backup of backups) {
    let safeSale
    let salePayload
    let saleItemsPayload

    try {
      safeSale = normalizeSaleForPersistence(backup.sale)
      salePayload = buildSalePayload(safeSale)
      saleItemsPayload = buildSaleItemsPayload('pending-sale-id', safeSale.items)
    } catch (error) {
      const message = error.message || 'Respaldo local invalido.'
      markSaleBackupStatus(backup.localSaleId || backup.id, backup.folio, { status: 'pending', error: message })
      failed.push({ backup, error: message })
      continue
    }

    recordSaleSaveAttempt({
      status: 'syncing',
      stage: 'retry_backup',
      sale: safeSale,
      salePayload,
      saleItemsPayload
    })

    try {
      const result = await saveSaleToSupabase(safeSale)
      markSaleBackupStatus(backup.localSaleId || backup.id, safeSale.folio, {
        status: 'synced',
        supabaseId: result.id,
        error: '',
        syncedAt: new Date().toISOString()
      })
      markLocalSaleSynced(backup.localSaleId || backup.id, safeSale.folio, result)
      recordSaleSaveAttempt({
        status: 'synced',
        stage: 'retry_backup_saved',
        sale: safeSale,
        salePayload,
        saleItemsPayload,
        supabaseId: result.id
      })
      synced.push({ folio: safeSale.folio, result })
    } catch (error) {
      const message = error.message || 'No se pudo recuperar respaldo local.'
      markSaleBackupStatus(backup.localSaleId || backup.id, safeSale.folio, {
        status: 'pending',
        error: message
      })
      recordSaleSaveAttempt({
        status: 'error',
        stage: 'retry_backup_failed',
        sale: safeSale,
        salePayload,
        saleItemsPayload,
        error: message
      })
      failed.push({ backup, error: message })
    }
  }

  return { synced, failed, total: backups.length }
}
export async function fetchTodayAdminData(filters = {}) {
  const cityFilter = typeof filters === 'string' ? filters : filters.city
  const dateFilter = typeof filters === 'object' ? filters.date : ''
  const monthFilter = typeof filters === 'object' ? filters.month : ''
  const rangeFilter = typeof filters === 'object' ? filters.range : null

  if (!hasSupabaseConfig || !supabase) {
    const localSales = readLocalSales()
      .filter((sale) => isSaleInRange(sale, { date: dateFilter, month: monthFilter, range: rangeFilter }))
      .filter((sale) => matchesCity(sale, cityFilter))

    return {
      storage: 'local',
      reason: 'Supabase no esta configurado en este entorno.',
      sales: localSales,
      expenses: [],
      cashCuts: []
    }
  }

  const { start, end } = resolveDateRange({ date: dateFilter, month: monthFilter, range: rangeFilter })

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
        sales: readLocalSales().filter((sale) => isSaleInRange(sale, { date: dateFilter, month: monthFilter, range: rangeFilter })).filter((sale) => matchesCity(sale, cityFilter)),
        expenses: [],
        cashCuts: []
      }
    }

    if (isMissingSchemaError(salesResult.error)) {
      return {
        storage: 'local',
        reason: 'La tabla sales no existe o no esta expuesta en Supabase.',
        sales: readLocalSales().filter((sale) => isSaleInRange(sale, { date: dateFilter, month: monthFilter, range: rangeFilter })).filter((sale) => matchesCity(sale, cityFilter)),
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

export async function updateSaleCorrection(saleId, patch = {}) {
  requireSupabase('corregir venta')
  if (!saleId) throw new Error('Falta venta para corregir.')

  const payload = {
    audit_notes: patch.auditNotes || 'Correccion super_admin',
    updated_at: new Date().toISOString()
  }

  if (patch.city !== undefined) payload.city = String(patch.city || '').trim()
  if (patch.paymentMethod !== undefined) payload.payment_method = String(patch.paymentMethod || '').trim() || 'Sin metodo'
  if (patch.createdAt !== undefined) payload.created_at = patch.createdAt
  if (patch.total !== undefined) {
    const total = Number(patch.total)
    if (!Number.isFinite(total) || total < 0) throw new Error('Total invalido.')
    payload.total = total
    payload.subtotal = total
    payload.discount_amount = 0
    payload.discount_percent = 0
  }

  const result = await updateSaleWithCompatibleColumns(saleId, payload, ['audit_notes', 'updated_at', 'discount_percent'])
  if (result.error) throw new Error(friendlySupabaseMessage(result.error) || 'No se pudo corregir venta.')
  return result.data || { id: saleId, ...payload }
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

export async function updateExpenseCorrection(expenseId, patch = {}) {
  requireSupabase('corregir gasto')
  if (!expenseId) throw new Error('Falta gasto para corregir.')

  const payload = { updated_at: new Date().toISOString() }
  if (patch.category !== undefined) payload.category = patch.category
  if (patch.description !== undefined) payload.description = patch.description
  if (patch.amount !== undefined) {
    const amount = Number(patch.amount)
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Monto invalido.')
    payload.amount = amount
  }
  if (patch.paymentMethod !== undefined) payload.payment_method = patch.paymentMethod

  const result = await updateWithCompatibleColumns('expenses', expenseId, payload, ['updated_at'])
  if (result.error) throw new Error(friendlySupabaseMessage(result.error) || 'No se pudo corregir gasto.')
  return result.data || { id: expenseId, ...payload }
}

export async function saveCashCut(cut) {
  requireSupabase('guardar corte de caja')

  const cashCounted = Number(cut.cashCounted || 0)
  const expectedCash = Number(cut.expectedCash || 0)
  const cashExpenses = Number(cut.cashExpenses || 0)
  const difference = Number.isFinite(Number(cut.difference))
    ? Number(cut.difference)
    : cashCounted + cashExpenses - expectedCash

  const payload = {
    city: cut.city,
    cashier_name: cut.cashierName,
    total_sales: Number(cut.totalSales),
    expected_cash: expectedCash,
    cash_counted: cashCounted,
    transfer_total: Number(cut.transferTotal),
    card_total: Number(cut.cardTotal),
    cash_expenses: cashExpenses,
    difference,
    expected_total: expectedCash,
    counted_total: cashCounted,
    system_total: Number(cut.totalSales),
    closing_amount: cashCounted,
    difference_amount: difference,
    notes: cut.notes || null
  }

  const optionalColumns = ['total_sales', 'expected_cash', 'cash_counted', 'transfer_total', 'card_total', 'cash_expenses', 'difference', 'expected_total', 'counted_total', 'system_total', 'closing_amount', 'difference_amount', 'city']
  const result = await insertWithCompatibleColumns('cash_cuts', payload, optionalColumns)

  if (result.error) {
    logSupabaseError('[Supabase saveCashCut] insert failed:', result.error, payload)
    throw new Error(buildSupabaseModuleError(result.error, 'corte de caja'))
  }

  return {
    ...payload,
    ...result.data,
    expected_cash: result.data?.expected_cash ?? result.data?.expected_total ?? expectedCash,
    cash_counted: result.data?.cash_counted ?? result.data?.counted_total ?? result.data?.closing_amount ?? cashCounted,
    cash_expenses: result.data?.cash_expenses ?? cashExpenses,
    difference: result.data?.difference ?? result.data?.difference_amount ?? difference
  }
}

export async function updateCashCutCorrection(cutId, patch = {}) {
  requireSupabase('corregir corte')
  if (!cutId) throw new Error('Falta corte para corregir.')

  const payload = { updated_at: new Date().toISOString() }
  ;['cash_counted', 'expected_cash', 'cash_expenses', 'transfer_total', 'card_total', 'difference'].forEach((key) => {
    if (patch[key] === undefined) return
    const value = Number(patch[key])
    if (!Number.isFinite(value)) throw new Error('Monto invalido en corte.')
    payload[key] = value
  })
  if (patch.notes !== undefined) payload.notes = patch.notes

  const result = await updateWithCompatibleColumns('cash_cuts', cutId, payload, ['updated_at'])
  if (result.error) throw new Error(friendlySupabaseMessage(result.error) || 'No se pudo corregir corte.')
  return result.data || { id: cutId, ...payload }
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

export async function importPartialV1Sales(sales) {
  requireSupabase('importar ventas V1')

  const imported = []
  const duplicated = []
  const errors = []

  for (const sale of sales) {
    try {
      const normalized = normalizeV1ImportSale(sale)
      const duplicate = await findV1DuplicateSale(normalized)

      if (duplicate) {
        duplicated.push({ sale: normalized, duplicate })
        continue
      }

      const result = await insertSaleWithCompatibleColumns(buildV1ImportPayload(normalized), [
        'operator_name',
        'local_sale_id',
        'device_session_id',
        'source',
        'imported_partial',
        'original_source_id',
        'imported_at',
        'import_notes'
      ])

      if (result.localFallback) {
        throw new Error(result.reason)
      }

      if (result.error) {
        throw new Error(formatSupabaseError(result.error) || 'No se pudo importar venta.')
      }

      imported.push(result.data)
    } catch (error) {
      errors.push({
        sale,
        row: sale.index || sale.row || '',
        folio: sale.folio || '',
        total: sale.total || '',
        error: error.message || 'No se pudo importar venta.'
      })
    }
  }

  return {
    imported,
    duplicated,
    errors,
    partial: sales.length
  }
}

export async function saveHistoricalSalesEntry(entry) {
  requireSupabase('guardar ventas historicas')

  const city = String(entry.city || '').trim()
  const date = String(entry.date || '').trim()
  const total = Number(entry.total || 0)
  const ticketsCount = Math.max(0, Math.floor(Number(entry.ticketsCount || 0)))

  if (!city) throw new Error('Escribe la ciudad de la venta historica.')
  if (!date) throw new Error('Selecciona fecha de la venta historica.')
  if (!Number.isFinite(total) || total <= 0) throw new Error('El total historico debe ser mayor a cero.')

  const isDailySummary = ticketsCount > 0
  const count = isDailySummary ? ticketsCount : 1
  const source = isDailySummary ? 'manual_historical_daily' : 'manual_historical'
  const importNotes = isDailySummary
    ? 'Manual daily summary split into synthetic tickets; no item detail'
    : 'Manual historical sale without item detail'
  const baseFolio = historicalFolioPrefix(city, date)
  const centsTotal = Math.round(total * 100)
  const baseCents = Math.floor(centsTotal / count)
  const remainder = centsTotal - baseCents * count
  const now = new Date().toISOString()
  const rows = []
  const errors = []

  for (let index = 0; index < count; index += 1) {
    const rowCents = baseCents + (index < remainder ? 1 : 0)
    const rowTotal = rowCents / 100
    const folio = count === 1 ? baseFolio : `${baseFolio}-${String(index + 1).padStart(3, '0')}`
    const payload = {
      city,
      folio,
      cashier_id: null,
      cashier_name: entry.cashierName || 'Historico',
      operator_name: entry.operatorName || entry.cashierName || 'Historico',
      local_sale_id: `historical-${folio}`,
      device_session_id: getDeviceSessionId(),
      subtotal: rowTotal,
      discount_percent: 0,
      discount_amount: 0,
      discount: 0,
      total: rowTotal,
      payment_method: entry.paymentMethod || 'Historico',
      customer_name: null,
      customer_whatsapp: null,
      customer_type: null,
      status: 'completed',
      source,
      imported_partial: true,
      original_source_id: `manual-${baseFolio}`,
      imported_at: now,
      import_notes: importNotes,
      created_at: historicalCreatedAt(date, index)
    }

    const result = await insertSaleWithCompatibleColumns(payload, [
      'operator_name',
      'local_sale_id',
      'device_session_id',
      'source',
      'imported_partial',
      'original_source_id',
      'imported_at',
      'import_notes'
    ])

    if (result.error || result.localFallback) {
      errors.push({ folio, error: result.error?.message || result.reason || 'No se pudo guardar venta historica.' })
      continue
    }

    rows.push({ ...payload, ...result.data })
  }

  if (errors.length) {
    throw new Error(`No se guardaron ${errors.length} venta(s) historicas. ${errors[0].folio}: ${errors[0].error}`)
  }

  return { rows, count: rows.length, source, importNotes }
}

function requireSupabase(action) {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error(`Supabase no esta configurado para ${action}.`)
  }
}

function buildSalePayload(sale) {
  const payload = {
    city: sale.city,
    folio: sale.folio,
    cashier_id: sale.cashierId || null,
    cashier_name: sale.cashierName,
    operator_name: sale.operatorName || sale.cashierName,
    local_sale_id: sale.localSaleId || sale.clientSaleId || sale.folio || null,
    device_session_id: getDeviceSessionId(),
    subtotal: sale.subtotal,
    discount_percent: sale.discountPercent,
    discount_amount: sale.discountAmount,
    discount: sale.discountAmount,
    total: sale.total,
    payment_method: sale.paymentMethod,
    customer_name: sale.customerName || null,
    customer_whatsapp: sale.customerWhatsapp || null,
    customer_type: sale.customerType || null,
    status: 'completed',
    source: sale.source || null,
    imported_partial: Boolean(sale.importedPartial),
    original_source_id: sale.originalSourceId || null,
    imported_at: sale.importedAt || null,
    import_notes: sale.importNotes || null
  }

  if (sale.createdAt) payload.created_at = sale.createdAt

  return payload
}

function buildSaleItemsPayload(saleId, items = []) {
  return items.map((item) => {
    const subtotal = itemSubtotal(item)
    return {
      sale_id: saleId,
      category: sanitizeSaleItemCategory(item.category),
      quantity: Number(item.quantity),
      unit_price: Number(item.unitPrice),
      subtotal,
      line_total: subtotal,
      material: item.material || null,
      code_detected: normalizeCode(item.code_detected) || null,
      capture_origin: item.capture_origin || 'manual'
    }
  })
}

function normalizeSaleForPersistence(sale) {
  const items = (sale.items || [])
    .map((item) => ({
      ...item,
      category: sanitizeSaleItemCategory(item.category),
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice ?? item.unit_price ?? 0),
      subtotal: Number(item.subtotal ?? item.line_total ?? Number(item.quantity || 0) * Number(item.unitPrice ?? item.unit_price ?? 0))
    }))
    .filter((item) => item.quantity > 0 && item.unitPrice > 0)

  if (!items.length) {
    throw new Error('La venta no tiene articulos validos para guardar.')
  }

  const subtotal = Number(sale.subtotal ?? items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0))
  const discountAmount = Number(sale.discountAmount ?? sale.discount_amount ?? 0)
  const total = Number(sale.total ?? Math.max(0, subtotal - discountAmount))

  return {
    ...sale,
    folio: String(sale.folio || '').trim(),
    city: String(sale.city || '').trim(),
    cashierName: sale.cashierName || sale.cashier || sale.cashier_name || 'Cajera',
    paymentMethod: sale.paymentMethod || sale.payment_method || 'Efectivo',
    customerName: sale.customerName || sale.customer_name || '',
    customerWhatsapp: sale.customerWhatsapp || sale.customerPhone || sale.customer_whatsapp || '',
    customerType: sale.customerType || sale.customer_type || '',
    discountPercent: Number(sale.discountPercent ?? sale.discount_percent ?? 0),
    discountAmount,
    subtotal,
    total,
    items
  }
}

function sanitizeSaleItemCategory(category) {
  const value = String(category || '').trim()
  return value || 'Sin categoria'
}

function normalizeV1ImportSale(sale) {
  const total = Number(sale.total || 0)
  const createdAt = normalizeImportDate(sale.createdAt || sale.created_at || sale.date || sale.fecha)

  if (!sale.city?.trim()) throw new Error('Falta ciudad para una venta V1.')
  if (!sale.folio?.trim()) throw new Error('Falta folio para una venta V1.')
  if (!Number.isFinite(total) || total <= 0) throw new Error(`Total invalido en ${sale.folio || 'venta V1'}.`)

  return {
    city: sale.city.trim(),
    folio: sale.folio.trim(),
    cashierId: sale.cashierId || sale.cashier_id || null,
    cashierName: sale.cashierName || sale.cashier_name || 'Import V1',
    subtotal: total,
    discountPercent: 0,
    discountAmount: 0,
    total,
    paymentMethod: sale.paymentMethod || sale.payment_method || 'Sin metodo',
    customerName: sale.customerName || sale.customer_name || '',
    customerWhatsapp: sale.customerWhatsapp || sale.customer_whatsapp || sale.customerPhone || '',
    customerType: sale.customerType || sale.customer_type || '',
    source: 'v1_import',
    importedPartial: true,
    originalSourceId: sale.originalSourceId || sale.original_source_id || sale.id || sale.local_id || null,
    importedAt: new Date().toISOString(),
    importNotes: 'Imported from V1 sales CSV without sale_items',
    createdAt
  }
}

function buildV1ImportPayload(sale) {
  return {
    city: sale.city,
    folio: sale.folio,
    cashier_id: sale.cashierId || null,
    cashier_name: sale.cashierName,
    operator_name: sale.cashierName,
    local_sale_id: sale.originalSourceId || sale.folio,
    device_session_id: getDeviceSessionId(),
    subtotal: sale.subtotal,
    discount_percent: 0,
    discount_amount: 0,
    discount: 0,
    total: sale.total,
    payment_method: sale.paymentMethod,
    customer_name: sale.customerName || null,
    customer_whatsapp: sale.customerWhatsapp || null,
    customer_type: sale.customerType || null,
    status: 'completed',
    source: 'v1_import',
    imported_partial: true,
    original_source_id: sale.originalSourceId || null,
    imported_at: sale.importedAt,
    import_notes: sale.importNotes,
    created_at: sale.createdAt
  }
}

async function findV1DuplicateSale(sale) {
  const byFolio = await findSaleByFolio(sale.folio)
  if (byFolio.data) return { reason: 'folio', sale: byFolio.data }

  const createdAt = new Date(sale.createdAt)
  if (Number.isNaN(createdAt.getTime())) return null
  const start = new Date(createdAt)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  let optionalColumns = ['customer_whatsapp', 'customer_name']

  while (true) {
    let query = supabase
      .from('sales')
      .select(['id', 'folio', 'city', 'total', 'created_at', ...optionalColumns].join(', '))
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .eq('total', sale.total)

    if (sale.city) query = query.ilike('city', sale.city)

    const { data, error } = await query.limit(20)

    if (!error) {
      const duplicate = (data || []).find((row) => sameImportCustomer(row, sale))
      return duplicate ? { reason: 'fecha_total_cliente', sale: duplicate } : null
    }

    const missingColumn = optionalColumns.find((column) => mentionsColumn(error, column))
    if (missingColumn) {
      optionalColumns = optionalColumns.filter((column) => column !== missingColumn)
      continue
    }

    if (!isMissingSchemaError(error)) logSupabaseError('[Supabase V1 import] duplicate lookup failed:', error)
    return null
  }
}

function sameImportCustomer(row, sale) {
  const rowPhone = digitsOnly(row.customer_whatsapp)
  const salePhone = digitsOnly(sale.customerWhatsapp)
  if (rowPhone || salePhone) return rowPhone === salePhone
  const rowName = normalizeText(row.customer_name)
  const saleName = normalizeText(sale.customerName)
  if (rowName || saleName) return rowName === saleName
  return true
}

function normalizeImportDate(value) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return new Date().toISOString()
  return date.toISOString()
}

function historicalFolioPrefix(city, date) {
  const prefix = normalizeCode(city).replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'HIS'
  const cleanDate = String(date || '').replace(/\D/g, '') || new Date().toISOString().slice(0, 10).replace(/\D/g, '')
  const suffix = Math.random().toString(16).slice(2, 6).toUpperCase()
  return `HIS-${prefix}-${cleanDate}-${suffix}`
}

function historicalCreatedAt(date, index) {
  const created = new Date(`${date}T12:00:00`)
  if (Number.isNaN(created.getTime())) return new Date().toISOString()
  created.setSeconds(index)
  return created.toISOString()
}

async function insertSaleWithCompatibleColumns(payload, requiredColumns = []) {
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

    const missingColumn = OPTIONAL_SALE_COLUMNS.find((column) => mentionsColumn(error, column))

    if (missingColumn && requiredColumns.includes(missingColumn)) {
      return {
        error: new Error(`Falta la columna sales.${missingColumn}. Ejecuta el ALTER puntual antes de importar V1.`)
      }
    }

    if (missingColumn && Object.prototype.hasOwnProperty.call(nextPayload, missingColumn)) {
      nextPayload = { ...nextPayload }
      delete nextPayload[missingColumn]
      continue
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

    return { error }
  }

  return {
    error: new Error('No se pudo adaptar el guardado a las columnas disponibles en sales.')
  }
}

async function findSaleByFolio(folio) {
  if (!folio) return { data: null, error: null }

  const { data, error } = await supabase
    .from('sales')
    .select('id, created_at')
    .eq('folio', folio)
    .maybeSingle()

  if (error && !isMissingSchemaError(error)) {
    logSupabaseError('[Supabase saveSale] folio lookup failed:', error)
  }

  return { data: error ? null : data, error }
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

async function updateWithCompatibleColumns(tableName, rowId, payload, optionalColumns) {
  let nextPayload = { ...payload }

  for (let attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
    const { data, error } = await supabase
      .from(tableName)
      .update(nextPayload)
      .eq('id', rowId)
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

  return { data: null, error: new Error(`No se pudo adaptar la actualizacion en ${tableName}.`) }
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

function saveLocalSale(sale, reason, options = {}) {
  const now = new Date().toISOString()
  const localId = sale.localSaleId || sale.clientSaleId || createLocalSaleId()
  const localSale = {
    ...sale,
    id: localId,
    localSaleId: localId,
    clientSaleId: localId,
    deviceSessionId: getDeviceSessionId(),
    created_at: now,
    storage: 'local',
    storageLabel: 'Pendiente de sincronizar',
    storageReason: reason,
    pendingSync: true,
    syncStatus: options.syncStatus || 'pending',
    syncAttempts: Number(sale.syncAttempts || 0),
    syncError: options.syncError || ''
  }

  const currentSales = readLocalSales()
  const nextSales = [...currentSales.filter((sale) => sale.folio !== localSale.folio), localSale]
  writeLocalSales(nextSales)
  const confirmed = readLocalSales().some((sale) => sale.folio === localSale.folio || sale.id === localSale.id)
  if (!confirmed) {
    throw new Error('No se pudo respaldar la venta en almacenamiento local.')
  }

  return localSale
}

function markLocalSaleSynced(localId, folio, savedSale) {
  const syncedAt = new Date().toISOString()
  writeLocalSales(readLocalSales().map((sale) => (
    sale.id === localId || sale.folio === folio
      ? {
          ...sale,
          supabaseId: savedSale.id,
          created_at: savedSale.created_at || sale.created_at,
          storage: 'supabase',
          storageLabel: 'Guardada en Supabase',
          storageReason: '',
          pendingSync: false,
          syncStatus: 'synced',
          syncError: '',
          syncedAt,
          syncingAt: ''
        }
      : sale
  )))
}

function markLocalSaleError(localId, folio, message) {
  let updatedSale = null
  writeLocalSales(readLocalSales().map((sale) => {
    if (sale.id !== localId && sale.folio !== folio) return sale
    updatedSale = {
      ...sale,
      storage: 'local',
      storageLabel: 'Pendiente de sincronizar',
      storageReason: message,
      pendingSync: true,
      syncStatus: 'error',
      syncError: message,
      syncAttempts: Number(sale.syncAttempts || 0) + 1,
      syncingAt: ''
    }
    return updatedSale
  }))
  return updatedSale
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

function readSaleBackups() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_BACKUPS_KEY) || '[]')
  } catch {
    return []
  }
}

function writeSaleBackups(backups) {
  window.localStorage.setItem(LOCAL_BACKUPS_KEY, JSON.stringify(backups.slice(0, 250)))
}

function upsertSaleBackup(backup) {
  const current = readSaleBackups()
  const key = backup.localSaleId || backup.id || backup.folio
  const next = [
    backup,
    ...current.filter((item) => (item.localSaleId || item.id || item.folio) !== key && item.folio !== backup.folio)
  ]
  writeSaleBackups(next)
  const confirmed = readSaleBackups().some((item) => (
    item.localSaleId === backup.localSaleId ||
    item.id === backup.id ||
    item.folio === backup.folio
  ))
  if (!confirmed) {
    throw new Error('No se pudo respaldar la venta en la boveda local.')
  }
}

function markSaleBackupStatus(localSaleId, folio, updates) {
  const now = new Date().toISOString()
  let found = false
  const next = readSaleBackups().map((backup) => {
    if (backup.localSaleId !== localSaleId && backup.id !== localSaleId && backup.folio !== folio) return backup
    found = true
    return {
      ...backup,
      ...updates,
      updated_at: now
    }
  })

  if (found) writeSaleBackups(next)
}

function readSaveAttempts() {
  try {
    return JSON.parse(window.localStorage.getItem(SAVE_ATTEMPTS_KEY) || '[]')
  } catch {
    return []
  }
}

function writeSaveAttempts(attempts) {
  window.localStorage.setItem(SAVE_ATTEMPTS_KEY, JSON.stringify(attempts.slice(0, MAX_SAVE_ATTEMPTS)))
}

function recordSaleSaveAttempt({ status, stage, sale, salePayload, saleItemsPayload, error = '', supabaseId = '' }) {
  if (typeof window === 'undefined') return

  try {
    const attempt = {
      id: createLocalSaleId(),
      created_at: new Date().toISOString(),
      city: sale.city,
      folio: sale.folio,
      total: Number(sale.total || 0),
      itemsCount: (sale.items || []).length,
      status,
      stage,
      error: error ? String(error) : '',
      supabaseId,
      salePayload,
      saleItemsPayload
    }
    writeSaveAttempts([attempt, ...readSaveAttempts()])
  } catch (logError) {
    console.error('[POS save attempt log] No se pudo guardar log local:', logError)
  }
}

function saleChecksum(sale) {
  const text = JSON.stringify({
    folio: sale.folio,
    city: sale.city,
    total: sale.total,
    items: (sale.items || []).map((item) => ({
      category: item.category,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      code: item.code_detected
    }))
  })
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0
  }
  return `chk-${Math.abs(hash).toString(16)}`
}

function createLocalSaleId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `local-${crypto.randomUUID()}`
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getDeviceSessionId() {
  if (typeof window === 'undefined') return ''

  try {
    const current = window.localStorage.getItem(LOCAL_SESSION_KEY)
    if (current) return current
    const next = typeof crypto !== 'undefined' && crypto.randomUUID
      ? `device-${crypto.randomUUID()}`
      : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`
    window.localStorage.setItem(LOCAL_SESSION_KEY, next)
    return next
  } catch {
    return ''
  }
}

function normalizeLocalSaleForSync(sale) {
  return {
    ...sale,
    localSaleId: sale.localSaleId || sale.clientSaleId || sale.id,
    clientSaleId: sale.clientSaleId || sale.localSaleId || sale.id,
    operatorName: sale.operatorName || sale.cashierName || sale.cashier || sale.cashier_name,
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
  const existingSale = await findSaleByFolio(sale.folio)
  if (existingSale.data) {
    await ensureExistingSaleItems(existingSale.data, sale)
    return {
      id: existingSale.data.id,
      created_at: existingSale.data.created_at,
      storage: 'supabase',
      storageLabel: 'Ya sincronizada'
    }
  }

  const salePayload = buildSalePayload(sale)
  const saleResult = await insertSaleWithCompatibleColumns(salePayload)

  if (saleResult.localFallback) {
    throw new Error(saleResult.reason)
  }

  if (saleResult.error) {
    throw new Error(friendlySupabaseMessage(saleResult.error) || 'No se pudo guardar en Supabase.')
  }

  const savedSale = saleResult.data
  const saleItems = buildSaleItemsPayload(savedSale.id, sale.items)

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

async function ensureExistingSaleItems(existingSale, sale) {
  const expectedItems = buildSaleItemsPayload(existingSale.id, sale.items)
  if (!expectedItems.length) return []

  const { data: currentItems, error } = await supabase
    .from('sale_items')
    .select('id')
    .eq('sale_id', existingSale.id)

  if (error) {
    const detail = isMissingSchemaError(error)
      ? 'La tabla sale_items no existe o no esta expuesta en Supabase.'
      : friendlySupabaseMessage(error)
    throw new Error(`La venta ya existe, pero no se pudo revisar su detalle: ${detail}`)
  }

  if ((currentItems || []).length >= expectedItems.length) return currentItems

  if ((currentItems || []).length > 0) {
    throw new Error(`La venta ya existe con ${(currentItems || []).length} articulo(s), pero el respaldo local trae ${expectedItems.length}. No la marco como sincronizada para evitar duplicados.`)
  }

  const { data: savedItems, error: itemsError } = await insertSaleItemsWithCompatibleColumns(expectedItems)
  if (itemsError) {
    const detail = isMissingSchemaError(itemsError)
      ? 'La tabla sale_items no existe o no esta expuesta en Supabase.'
      : friendlySupabaseMessage(itemsError)
    throw new Error(`La venta ya existia, pero no se pudieron recuperar sus articulos: ${detail}`)
  }

  await relateSaleItemsToInventory(savedItems || [])
  return savedItems || []
}

function matchesCity(row, city) {
  if (!city?.trim()) return true
  return String(row.city || '').trim().toLowerCase() === city.trim().toLowerCase()
}

function isSaleInRange(sale, filters = {}) {
  const createdAt = new Date(sale.created_at)
  const { start, end } = resolveDateRange(filters)

  return createdAt >= start && createdAt < end
}

function resolveDateRange(filters = {}) {
  if (filters.range?.start && filters.range?.end) {
    return {
      start: startOfDay(filters.range.start),
      end: endOfDayExclusive(filters.range.end)
    }
  }

  if (filters.month) {
    const start = startOfMonth(filters.month)
    const end = new Date(start)
    end.setMonth(end.getMonth() + 1)
    return { start, end }
  }

  const start = startOfDay(filters.date)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

function startOfDay(dateFilter) {
  const date = dateFilter ? new Date(`${dateFilter}T00:00:00`) : new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function endOfDayExclusive(dateFilter) {
  const end = startOfDay(dateFilter)
  end.setDate(end.getDate() + 1)
  return end
}

function startOfMonth(monthFilter) {
  const [year, month] = String(monthFilter || '').split('-').map(Number)
  if (!year || !month) {
    const current = new Date()
    return new Date(current.getFullYear(), current.getMonth(), 1)
  }

  return new Date(year, month - 1, 1)
}

function itemSubtotal(item) {
  return Number(item.quantity || 0) * Number(item.unitPrice || 0)
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase()
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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

function formatSupabaseError(error) {
  if (!error) return ''
  const parts = [
    error.message,
    error.details,
    error.hint,
    error.code ? `code: ${error.code}` : ''
  ].filter(Boolean)
  return parts.join(' / ')
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
