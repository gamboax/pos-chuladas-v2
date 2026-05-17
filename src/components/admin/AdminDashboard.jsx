import { useEffect, useMemo, useState } from 'react'
import {
  fetchInventoryData,
  fetchTodayAdminData,
  saveCashCut,
  saveExpense,
  savePurchaseLot,
  savePurchaseLotItem
} from '../../lib/sales'
import { money } from '../../lib/ticket'

const EXPENSE_CATEGORIES = ['Facebook Ads', 'Gasolina', 'Casetas', 'Comida', 'Hotel', 'Ayudantes', 'Lugar/Renta', 'Mercancia', 'Otros']
const PRODUCT_CATEGORIES = ['Anillo', 'Pulsera', 'Tobillera', 'Collar', 'Cadena', 'Dije', 'Rosario', 'Juego', 'Arete']
const MATERIALS = ['Acero inoxidable', 'Oro laminado', 'Bano de rodio', 'Bano de plata']

function AdminDashboard({ user, onBackToPOS, onLogout }) {
  const role = user?.role || 'admin'
  const isSuperAdmin = role === 'super_admin'
  const isInvestor = role === 'investor'
  const canManageOps = isSuperAdmin
  const defaultCity = readActiveCityDraft()

  const [summary, setSummary] = useState({ storage: 'supabase', sales: [], expenses: [], cashCuts: [] })
  const [inventory, setInventory] = useState({ storage: 'supabase', lots: [], lotItems: [], productCodes: [], saleItems: [] })
  const [eventCity, setEventCity] = useState(defaultCity)
  const [ticketSearch, setTicketSearch] = useState('')
  const [expenseForm, setExpenseForm] = useState({ category: EXPENSE_CATEGORIES[0], description: '', amount: '' })
  const [cashCounted, setCashCounted] = useState('')
  const [cashCutNotes, setCashCutNotes] = useState('')
  const [lotForm, setLotForm] = useState({ name: '', supplier: '', purchasePlace: '', purchaseDate: todayInputValue(), totalInvestment: '', notes: '' })
  const [selectedLotId, setSelectedLotId] = useState('')
  const [lotItemForm, setLotItemForm] = useState({ code: '', category: PRODUCT_CATEGORIES[0], material: MATERIALS[0], quantityPurchased: '', unitCost: '', suggestedPrice: '' })
  const [loading, setLoading] = useState(true)
  const [savingExpense, setSavingExpense] = useState(false)
  const [savingCashCut, setSavingCashCut] = useState(false)
  const [savingLot, setSavingLot] = useState(false)
  const [savingLotItem, setSavingLotItem] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const effectiveCity = eventCity.trim()

  async function loadDashboard(city = effectiveCity) {
    setLoading(true)
    setError('')

    try {
      const shouldLoadInventory = isSuperAdmin || isInvestor
      const [adminResult, inventoryResult] = await Promise.all([
        fetchTodayAdminData({ city }),
        shouldLoadInventory ? fetchInventoryData() : Promise.resolve({ storage: 'supabase', lots: [], lotItems: [], productCodes: [], saleItems: [] })
      ])
      setSummary(adminResult)
      setInventory(inventoryResult)
    } catch (loadError) {
      setError(loadError.message || 'No se pudo cargar el dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let alive = true
    const timeout = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const shouldLoadInventory = isSuperAdmin || isInvestor
        const [adminResult, inventoryResult] = await Promise.all([
          fetchTodayAdminData({ city: eventCity.trim() }),
          shouldLoadInventory ? fetchInventoryData() : Promise.resolve({ storage: 'supabase', lots: [], lotItems: [], productCodes: [], saleItems: [] })
        ])
        if (alive) {
          setSummary(adminResult)
          setInventory(inventoryResult)
        }
      } catch (loadError) {
        if (alive) setError(loadError.message || 'No se pudo cargar el dashboard.')
      } finally {
        if (alive) setLoading(false)
      }
    }, 220)

    return () => {
      alive = false
      window.clearTimeout(timeout)
    }
  }, [eventCity, isSuperAdmin, isInvestor])

  useEffect(() => {
    if (!inventory.lots.length) {
      if (selectedLotId) setSelectedLotId('')
      return
    }

    if (!selectedLotId || !inventory.lots.some((lot) => lot.id === selectedLotId)) {
      setSelectedLotId(inventory.lots[0].id)
    }
  }, [inventory.lots, selectedLotId])

  const metrics = useMemo(() => buildMetrics(summary.sales, summary.expenses, summary.cashCuts), [summary.sales, summary.expenses, summary.cashCuts])
  const inventoryMetrics = useMemo(() => buildInventoryMetrics(inventory, metrics.totalSold, metrics.totalExpenses), [inventory, metrics.totalSold, metrics.totalExpenses])
  const visibleTickets = useMemo(() => filterTickets(summary.sales, ticketSearch), [summary.sales, ticketSearch])
  const cutDifference = Number(cashCounted || 0) - metrics.expectedCash
  const cityLabel = effectiveCity || 'Todas las ciudades'
  const eventLabel = effectiveCity ? `Evento activo: ${effectiveCity}` : 'Vista general del dia'

  async function handleSaveExpense() {
    if (!canManageOps || savingExpense) return
    if (!expenseForm.description.trim() || Number(expenseForm.amount) <= 0) {
      setError('Completa descripcion y monto del gasto.')
      return
    }

    setSavingExpense(true)
    setError('')
    setNotice('')

    try {
      await saveExpense({ city: cityLabel, category: expenseForm.category, description: expenseForm.description.trim(), amount: Number(expenseForm.amount), paymentMethod: 'Efectivo' })
      setExpenseForm({ category: EXPENSE_CATEGORIES[0], description: '', amount: '' })
      setNotice('Gasto guardado.')
      await loadDashboard()
    } catch (saveError) {
      setError(saveError.message || 'No se pudo guardar el gasto.')
    } finally {
      setSavingExpense(false)
    }
  }

  async function handleSaveCashCut() {
    if (!canManageOps || savingCashCut) return

    setSavingCashCut(true)
    setError('')
    setNotice('')

    try {
      await saveCashCut({
        city: cityLabel,
        cashierName: user?.name || 'Admin',
        totalSales: metrics.totalSold,
        expectedCash: metrics.expectedCash,
        cashCounted: Number(cashCounted || 0),
        transferTotal: metrics.transferTotal,
        cardTotal: metrics.cardTotal,
        cashExpenses: metrics.cashExpenses,
        difference: cutDifference,
        notes: cashCutNotes.trim()
      })
      setNotice('Corte de caja guardado.')
      setCashCounted('')
      setCashCutNotes('')
      await loadDashboard()
    } catch (saveError) {
      setError(saveError.message || 'No se pudo guardar el corte.')
    } finally {
      setSavingCashCut(false)
    }
  }

  async function handleSaveLot() {
    if (!canManageOps || savingLot) return
    if (!lotForm.name.trim() || Number(lotForm.totalInvestment) < 0) {
      setError('Completa nombre de lote e inversion valida.')
      return
    }

    setSavingLot(true)
    setError('')
    setNotice('')

    try {
      const savedLot = await savePurchaseLot({
        name: lotForm.name.trim(),
        supplier: lotForm.supplier.trim(),
        purchasePlace: lotForm.purchasePlace.trim(),
        purchaseDate: lotForm.purchaseDate,
        totalInvestment: Number(lotForm.totalInvestment || 0),
        notes: lotForm.notes.trim()
      })
      setSelectedLotId(savedLot.id)
      setLotForm({ name: '', supplier: '', purchasePlace: '', purchaseDate: todayInputValue(), totalInvestment: '', notes: '' })
      setNotice('Lote guardado.')
      await loadDashboard()
    } catch (saveError) {
      setError(saveError.message || 'No se pudo guardar el lote.')
    } finally {
      setSavingLot(false)
    }
  }

  async function handleSaveLotItem() {
    if (!canManageOps || savingLotItem) return
    if (!selectedLotId) {
      setError('Primero crea o selecciona un lote.')
      return
    }

    if (!lotItemForm.code.trim() || Number(lotItemForm.quantityPurchased) <= 0) {
      setError('Completa codigo y cantidad comprada.')
      return
    }

    setSavingLotItem(true)
    setError('')
    setNotice('')

    try {
      await savePurchaseLotItem({
        lotId: selectedLotId,
        code: lotItemForm.code,
        category: lotItemForm.category,
        material: lotItemForm.material,
        quantityPurchased: Number(lotItemForm.quantityPurchased || 0),
        unitCost: Number(lotItemForm.unitCost || 0),
        suggestedPrice: Number(lotItemForm.suggestedPrice || 0)
      })
      setLotItemForm({ code: '', category: PRODUCT_CATEGORIES[0], material: MATERIALS[0], quantityPurchased: '', unitCost: '', suggestedPrice: '' })
      setNotice('Articulo agregado al lote.')
      await loadDashboard()
    } catch (saveError) {
      setError(saveError.message || 'No se pudo guardar el articulo.')
    } finally {
      setSavingLotItem(false)
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <div style={styles.headerTitle}>{isInvestor ? 'Vista inversionista' : 'Admin Chuladas'}</div>
            <div style={styles.headerMeta}>{user?.name} / {roleLabel(role)}</div>
          </div>
          {onBackToPOS && !isInvestor ? (
            <button type="button" style={styles.blackPill} onClick={onBackToPOS}>Caja</button>
          ) : (
            <button type="button" style={styles.blackPill} onClick={onLogout}>Salir</button>
          )}
        </header>

        <section style={styles.panel}>
          <div style={styles.stack}>
            <div style={styles.heroBlock}>
              <p style={styles.kicker}>{eventLabel}</p>
              <h1 style={styles.title}>{money(metrics.totalSold)}</h1>
              <p style={styles.copy}>{metrics.salesCount} ticket(s) / Ticket promedio {money(metrics.averageTicket)}</p>
            </div>

            {loading && <div style={styles.notice}>Actualizando datos...</div>}
            {notice && <div style={styles.notice}>{notice}</div>}
            {error && <div style={styles.error}>{error}</div>}
            {summary.storage === 'local' && !loading && <div style={styles.notice}>{summary.reason || 'Mostrando ventas locales de este navegador.'}</div>}
            {summary.reason && summary.storage === 'supabase' && !loading && <div style={styles.notice}>{summary.reason}</div>}
            {inventory.reason && (isSuperAdmin || isInvestor) && !loading && <div style={styles.notice}>{inventory.reason}</div>}

            <label style={styles.labelBlock}>
              Ciudad / evento
              <input value={eventCity} onChange={(event) => setEventCity(event.target.value)} placeholder="Ej. Matehuala" style={styles.input} />
            </label>

            <section style={styles.cleanSection}>
              <div style={styles.sectionHead}>
                <h2 style={styles.sectionTitle}>Resumen</h2>
                <span style={styles.chip}>{cityLabel}</span>
              </div>
              <div style={styles.grid}>
                <Metric label="Tickets" value={metrics.salesCount} />
                <Metric label="Total vendido" value={money(metrics.totalSold)} />
                <Metric label="Ticket promedio" value={money(metrics.averageTicket)} />
                <Metric label="Clientes" value={metrics.customersCaptured} />
                <Metric label="Efectivo" value={money(metrics.cashSales)} />
                <Metric label="Transfer/Tarjeta" value={money(metrics.transferTotal + metrics.cardTotal)} />
                {(isSuperAdmin || isInvestor) && <Metric label="Utilidad est." value={money(inventoryMetrics.operatingProfit)} />}
                {(isSuperAdmin || isInvestor) && <Metric label="ROI" value={`${inventoryMetrics.roi.toFixed(1)}%`} />}
              </div>
            </section>

            <section style={styles.cleanSection}>
              <div style={styles.sectionHead}>
                <h2 style={styles.sectionTitle}>Metodos de pago</h2>
              </div>
              {Object.keys(metrics.byPayment).length === 0 ? (
                <div style={styles.empty}>Aun no hay ventas en este evento.</div>
              ) : (
                Object.entries(metrics.byPayment).map(([method, value]) => <DataRow key={method} label={method} value={money(value)} />)
              )}
            </section>

            <section style={styles.cleanSection}>
              <div style={styles.sectionHead}>
                <h2 style={styles.sectionTitle}>Tickets recientes</h2>
                <span style={styles.chip}>{visibleTickets.length}</span>
              </div>
              <input value={ticketSearch} onChange={(event) => setTicketSearch(event.target.value)} placeholder="Buscar folio, cliente o pago" style={styles.input} />
              {visibleTickets.length === 0 ? (
                <div style={styles.empty}>No hay tickets para mostrar.</div>
              ) : (
                visibleTickets.slice(0, 8).map((sale) => <TicketRow key={sale.id} sale={sale} />)
              )}
            </section>

            {(isSuperAdmin || isInvestor) && (
              <section style={styles.cleanSection}>
                <div style={styles.sectionHead}>
                  <h2 style={styles.sectionTitle}>Inversion y utilidad</h2>
                  <span style={styles.chip}>{isInvestor ? 'Solo lectura' : 'Super admin'}</span>
                </div>
                <DataRow label="Inversion total" value={money(inventoryMetrics.totalInvestment)} />
                <DataRow label="Venta vs inversion" value={`${inventoryMetrics.salesVsInvestment.toFixed(1)}%`} />
                <DataRow label="Cantidad comprada" value={inventoryMetrics.quantityPurchased} />
                <DataRow label="Cantidad vendida" value={inventoryMetrics.quantitySold} />
                <DataRow label="Restante estimado" value={inventoryMetrics.remainingEstimated} strong />
                <DataRow label="Utilidad inventario" value={money(inventoryMetrics.estimatedProfit)} strong />
                <DataRow label="Utilidad real est." value={money(inventoryMetrics.operatingProfit)} strong />
              </section>
            )}

            {isSuperAdmin && (
              <>
                <section style={styles.cleanSection}>
                  <div style={styles.sectionHead}><h2 style={styles.sectionTitle}>Nuevo lote</h2></div>
                  <input value={lotForm.name} onChange={(event) => setLotForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nombre lote" style={styles.input} />
                  <input value={lotForm.supplier} onChange={(event) => setLotForm((current) => ({ ...current, supplier: event.target.value }))} placeholder="Proveedor" style={styles.input} />
                  <input value={lotForm.purchasePlace} onChange={(event) => setLotForm((current) => ({ ...current, purchasePlace: event.target.value }))} placeholder="Lugar compra" style={styles.input} />
                  <div style={styles.twoColumns}>
                    <input value={lotForm.purchaseDate} onChange={(event) => setLotForm((current) => ({ ...current, purchaseDate: event.target.value }))} type="date" style={styles.input} />
                    <input value={lotForm.totalInvestment} onChange={(event) => setLotForm((current) => ({ ...current, totalInvestment: event.target.value }))} placeholder="Inversion" inputMode="decimal" type="number" min="0" style={styles.input} />
                  </div>
                  <textarea value={lotForm.notes} onChange={(event) => setLotForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notas" style={styles.textarea} />
                  <button type="button" style={styles.primaryButton} disabled={savingLot} onClick={handleSaveLot}>{savingLot ? 'Guardando...' : 'Guardar lote'}</button>
                </section>

                <section style={styles.cleanSection}>
                  <div style={styles.sectionHead}><h2 style={styles.sectionTitle}>Articulos del lote</h2></div>
                  <select value={selectedLotId} onChange={(event) => setSelectedLotId(event.target.value)} style={styles.input}>
                    {inventory.lots.length === 0 ? <option value="">Sin lotes</option> : inventory.lots.map((lot) => <option key={lot.id} value={lot.id}>{lotLabel(lot)}</option>)}
                  </select>
                  <input value={lotItemForm.code} onChange={(event) => setLotItemForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="Codigo" style={styles.input} />
                  <div style={styles.twoColumns}>
                    <select value={lotItemForm.category} onChange={(event) => setLotItemForm((current) => ({ ...current, category: event.target.value }))} style={styles.input}>{PRODUCT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select>
                    <select value={lotItemForm.material} onChange={(event) => setLotItemForm((current) => ({ ...current, material: event.target.value }))} style={styles.input}>{MATERIALS.map((material) => <option key={material} value={material}>{material}</option>)}</select>
                  </div>
                  <div style={styles.threeColumns}>
                    <input value={lotItemForm.quantityPurchased} onChange={(event) => setLotItemForm((current) => ({ ...current, quantityPurchased: event.target.value }))} placeholder="Cant." inputMode="decimal" type="number" min="0" style={styles.input} />
                    <input value={lotItemForm.unitCost} onChange={(event) => setLotItemForm((current) => ({ ...current, unitCost: event.target.value }))} placeholder="Costo" inputMode="decimal" type="number" min="0" style={styles.input} />
                    <input value={lotItemForm.suggestedPrice} onChange={(event) => setLotItemForm((current) => ({ ...current, suggestedPrice: event.target.value }))} placeholder="Precio" inputMode="decimal" type="number" min="0" style={styles.input} />
                  </div>
                  <button type="button" style={styles.primaryButton} disabled={savingLotItem || !selectedLotId} onClick={handleSaveLotItem}>{savingLotItem ? 'Guardando...' : 'Agregar articulo'}</button>
                </section>

                <section style={styles.cleanSection}>
                  <div style={styles.sectionHead}><h2 style={styles.sectionTitle}>Gastos del evento</h2></div>
                  <select value={expenseForm.category} onChange={(event) => setExpenseForm((current) => ({ ...current, category: event.target.value }))} style={styles.input}>{EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select>
                  <input value={expenseForm.description} onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))} placeholder="Descripcion" style={styles.input} />
                  <input value={expenseForm.amount} onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Monto" inputMode="decimal" type="number" min="0" style={styles.input} />
                  <button type="button" style={styles.primaryButton} disabled={savingExpense} onClick={handleSaveExpense}>{savingExpense ? 'Guardando...' : 'Guardar gasto'}</button>
                  {summary.expenses.slice(0, 4).map((expense) => <DataRow key={expense.id} label={`${expense.category} / ${expense.description}`} value={money(expense.amount)} />)}
                </section>

                <section style={styles.cleanSection}>
                  <div style={styles.sectionHead}><h2 style={styles.sectionTitle}>Corte de caja</h2></div>
                  <DataRow label="Venta total sistema" value={money(metrics.totalSold)} />
                  <DataRow label="Efectivo esperado" value={money(metrics.expectedCash)} />
                  <label style={styles.labelBlock}>Efectivo contado<input value={cashCounted} onChange={(event) => setCashCounted(event.target.value)} type="number" inputMode="decimal" min="0" style={styles.input} /></label>
                  <DataRow label="Transferencias" value={money(metrics.transferTotal)} />
                  <DataRow label="Tarjeta" value={money(metrics.cardTotal)} />
                  <DataRow label="Gastos en efectivo" value={money(metrics.cashExpenses)} />
                  <DataRow label="Diferencia" value={money(cutDifference)} strong />
                  <textarea value={cashCutNotes} onChange={(event) => setCashCutNotes(event.target.value)} placeholder="Notas del corte" style={styles.textarea} />
                  <button type="button" style={styles.primaryButton} disabled={savingCashCut} onClick={handleSaveCashCut}>{savingCashCut ? 'Guardando...' : 'Guardar corte'}</button>
                </section>
              </>
            )}

            {!isInvestor && <button type="button" style={styles.secondaryButton} onClick={onLogout}>Cerrar sesion</button>}
          </div>
        </section>
      </div>
    </main>
  )
}

function Metric({ label, value }) {
  return (
    <div style={styles.metricCard}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function DataRow({ label, value, strong = false }) {
  return (
    <div style={styles.dataRow}>
      <span>{label}</span>
      <strong style={{ fontWeight: strong ? 800 : 700 }}>{value}</strong>
    </div>
  )
}

function TicketRow({ sale }) {
  const time = sale.created_at ? new Date(sale.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <div style={styles.ticketRow}>
      <div>
        <strong>{sale.folio || 'Sin folio'}</strong>
        <span>{sale.customer_name || sale.cashier_name || 'Venta'} / {sale.payment_method || 'Pago'}</span>
      </div>
      <div style={styles.ticketRight}>
        <strong>{money(sale.total)}</strong>
        <span>{time}</span>
      </div>
    </div>
  )
}

function buildMetrics(sales, expenses, cashCuts) {
  const salesCount = sales.length
  const totalSold = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)
  const averageTicket = salesCount ? totalSold / salesCount : 0
  const byPayment = sales.reduce((acc, sale) => {
    const method = sale.payment_method || sale.paymentMethod || 'Sin metodo'
    acc[method] = (acc[method] || 0) + Number(sale.total || 0)
    return acc
  }, {})
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  const cashExpenses = expenses.filter((expense) => !expense.payment_method || expense.payment_method === 'Efectivo').reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  const cashSales = Number(byPayment.Efectivo || 0)
  const transferTotal = Number(byPayment.Transferencia || 0)
  const cardTotal = Number(byPayment.Tarjeta || 0)
  const mixedTotal = Number(byPayment.Mixto || 0)
  const expectedCash = cashSales - cashExpenses
  const latestDifference = cashCuts.length ? Number(cashCuts[0].difference || 0) : 0
  const customersCaptured = sales.filter((sale) => sale.customer_name || sale.customer_whatsapp).length

  return { salesCount, totalSold, averageTicket, byPayment, totalExpenses, cashExpenses, cashSales, estimatedProfit: totalSold - totalExpenses, expectedCash, transferTotal, cardTotal, mixedTotal, latestDifference, customersCaptured }
}

function buildInventoryMetrics(inventory, totalSold, totalExpenses) {
  const lotItems = inventory.lotItems || []
  const productCodes = inventory.productCodes || []
  const saleItems = inventory.saleItems || []
  const itemById = new Map(lotItems.map((item) => [item.id, item]))
  const itemByCode = new Map()
  lotItems.forEach((item) => {
    const code = normalizeCode(item.code)
    if (code) itemByCode.set(code, item)
  })
  const codeByValue = new Map()
  productCodes.forEach((row) => {
    const code = normalizeCode(row.code)
    if (code) codeByValue.set(code, row)
  })

  const quantityPurchased = lotItems.reduce((sum, item) => sum + quantityPurchasedOf(item), 0)
  const itemCostTotal = lotItems.reduce((sum, item) => sum + quantityPurchasedOf(item) * Number(item.unit_cost || 0), 0)
  const lotsInvestment = (inventory.lots || []).reduce((sum, lot) => sum + lotInvestmentOf(lot), 0)
  const totalInvestment = lotsInvestment || itemCostTotal
  let quantitySold = 0
  let estimatedRevenue = 0
  let actualRevenue = 0
  let soldCost = 0

  saleItems.forEach((saleItem) => {
    const code = normalizeCode(saleItem.code_detected)
    if (!code) return
    const quantity = Number(saleItem.quantity || 0)
    const codeRow = codeByValue.get(code)
    const relatedItem = itemById.get(codeRow?.purchase_lot_item_id) || itemByCode.get(code)
    const suggestedPrice = Number(relatedItem?.suggested_price || codeRow?.suggested_price || saleItem.unit_price || 0)
    const unitCost = Number(relatedItem?.unit_cost || codeRow?.unit_cost || 0)
    const subtotal = Number(saleItem.subtotal || quantity * Number(saleItem.unit_price || 0))
    quantitySold += quantity
    estimatedRevenue += quantity * suggestedPrice
    actualRevenue += subtotal
    soldCost += quantity * unitCost
  })

  const remainingEstimated = Math.max(quantityPurchased - quantitySold, 0)
  const estimatedProfit = actualRevenue - soldCost
  const operatingProfit = estimatedProfit - totalExpenses
  const roi = totalInvestment > 0 ? (operatingProfit / totalInvestment) * 100 : 0
  const salesVsInvestment = totalInvestment > 0 ? (totalSold / totalInvestment) * 100 : 0
  return { quantityPurchased, quantitySold, remainingEstimated, estimatedRevenue: estimatedRevenue || actualRevenue, estimatedProfit, operatingProfit, totalInvestment, roi, salesVsInvestment }
}

function filterTickets(sales, search) {
  const term = search.trim().toLowerCase()
  if (!term) return sales
  return sales.filter((sale) => [sale.folio, sale.customer_name, sale.customer_whatsapp, sale.payment_method, sale.cashier_name].some((value) => String(value || '').toLowerCase().includes(term)))
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase()
}

function quantityPurchasedOf(item) {
  return Number(item.quantity_purchased ?? item.quantity ?? 0)
}

function lotInvestmentOf(lot) {
  return Number(lot.total_investment ?? lot.total_cost ?? 0)
}

function lotLabel(lot) {
  return lot.name || lot.supplier || `Lote ${String(lot.id || '').slice(0, 8)}`
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function readActiveCityDraft() {
  try {
    return JSON.parse(window.localStorage.getItem('pos_chuladas_sale_draft_v2') || '{}').activeCity || ''
  } catch {
    return ''
  }
}

function roleLabel(role) {
  if (role === 'super_admin') return 'control completo'
  if (role === 'investor') return 'solo lectura'
  return 'operacion'
}

const styles = {
  page: { minHeight: '100svh', background: '#f4f4f4', color: '#111111', fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: '20px 18px 24px', boxSizing: 'border-box' },
  shell: { width: '100%', maxWidth: 430, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, background: '#ffffff', border: '1px solid #111111', borderRadius: 999, padding: '9px 9px 9px 17px', boxShadow: '0 12px 26px rgba(17, 17, 17, 0.07)' },
  headerTitle: { fontSize: 16, fontWeight: 700, lineHeight: 1.15 },
  headerMeta: { color: '#555555', fontSize: 14, fontWeight: 500, marginTop: 2 },
  blackPill: { minWidth: 74, height: 48, border: 'none', borderRadius: 999, background: '#111111', color: '#ffffff', fontSize: 15, fontWeight: 700, transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease' },
  panel: { background: '#ffffff', border: '1px solid #111111', borderRadius: 30, padding: 18, boxShadow: '0 16px 34px rgba(17, 17, 17, 0.07)', boxSizing: 'border-box' },
  stack: { display: 'grid', gap: 16 },
  heroBlock: { display: 'grid', gap: 4 },
  kicker: { margin: 0, color: '#666666', fontSize: 13, fontWeight: 700, textTransform: 'uppercase' },
  title: { margin: 0, color: '#111111', fontSize: 42, lineHeight: 1, fontWeight: 720, letterSpacing: 0 },
  copy: { margin: 0, color: '#555555', fontSize: 15 },
  cleanSection: { display: 'grid', gap: 11, padding: '2px 0 4px' },
  sectionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { margin: 0, fontSize: 18, fontWeight: 720 },
  chip: { border: '1px solid #d7d7d7', borderRadius: 999, padding: '6px 10px', background: '#f7f7f7', color: '#555555', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  metricCard: { border: '1px solid #e2e2e2', borderRadius: 20, background: '#ffffff', padding: 14, display: 'grid', gap: 6, boxShadow: '0 8px 18px rgba(17, 17, 17, 0.04)' },
  dataRow: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '11px 0', borderTop: '1px solid #eeeeee', fontSize: 15, color: '#333333' },
  ticketRow: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderTop: '1px solid #eeeeee', fontSize: 14 },
  ticketRight: { display: 'grid', justifyItems: 'end', gap: 3, whiteSpace: 'nowrap' },
  notice: { border: '1px solid #0EA371', borderRadius: 18, background: '#DFF8EC', color: '#064E3B', padding: 12, fontSize: 14, fontWeight: 700, textAlign: 'center' },
  error: { border: '1px solid #fecaca', borderRadius: 18, background: '#fff5f5', color: '#991b1b', padding: 12, fontSize: 14, fontWeight: 700, textAlign: 'center' },
  empty: { border: '1px dashed #a3a3a3', borderRadius: 18, background: '#f7f7f7', color: '#555555', padding: 18, textAlign: 'center', fontSize: 15, fontWeight: 560 },
  labelBlock: { display: 'grid', gap: 7, color: '#333333', fontSize: 14, fontWeight: 700 },
  input: { width: '100%', minHeight: 56, border: '1px solid #111111', borderRadius: 18, background: '#ffffff', color: '#111111', fontSize: 16, fontWeight: 540, padding: '0 13px', boxSizing: 'border-box', transition: 'border-color 140ms ease, box-shadow 140ms ease' },
  textarea: { width: '100%', minHeight: 88, border: '1px solid #111111', borderRadius: 18, background: '#ffffff', color: '#111111', fontSize: 16, fontWeight: 540, padding: 13, boxSizing: 'border-box', resize: 'vertical' },
  twoColumns: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 },
  threeColumns: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 },
  primaryButton: { width: '100%', minHeight: 58, border: '1px solid #0EA371', borderRadius: 20, background: '#10B981', color: '#ffffff', fontSize: 16, fontWeight: 720, boxShadow: '0 12px 22px rgba(16, 185, 129, 0.18)', transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease' },
  secondaryButton: { width: '100%', minHeight: 56, border: '1px solid #111111', borderRadius: 20, background: '#ffffff', color: '#111111', fontSize: 16, fontWeight: 720, transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease' }
}

export default AdminDashboard
