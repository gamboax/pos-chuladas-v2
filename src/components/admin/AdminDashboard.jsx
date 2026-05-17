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

const EXPENSE_CATEGORIES = [
  'Facebook Ads',
  'Gasolina',
  'Casetas',
  'Comida',
  'Hotel',
  'Ayudantes',
  'Lugar/Renta',
  'Mercancia',
  'Otros'
]

const PRODUCT_CATEGORIES = ['Anillo', 'Pulsera', 'Tobillera', 'Collar', 'Cadena', 'Dije', 'Rosario', 'Juego', 'Arete']
const MATERIALS = ['Acero inoxidable', 'Oro laminado', 'Bano de rodio', 'Bano de plata']

function AdminDashboard({ user, onBackToPOS, onLogout }) {
  const defaultCity = readActiveCityDraft()
  const [summary, setSummary] = useState({ storage: 'supabase', sales: [], expenses: [], cashCuts: [] })
  const [inventory, setInventory] = useState({ storage: 'supabase', lots: [], lotItems: [], productCodes: [], saleItems: [] })
  const [eventCity, setEventCity] = useState(defaultCity)
  const [expenseForm, setExpenseForm] = useState({ category: EXPENSE_CATEGORIES[0], description: '', amount: '' })
  const [cashCounted, setCashCounted] = useState('')
  const [cashCutNotes, setCashCutNotes] = useState('')
  const [lotForm, setLotForm] = useState({
    name: '',
    supplier: '',
    purchasePlace: '',
    purchaseDate: todayInputValue(),
    totalInvestment: '',
    notes: ''
  })
  const [selectedLotId, setSelectedLotId] = useState('')
  const [lotItemForm, setLotItemForm] = useState({
    code: '',
    category: PRODUCT_CATEGORIES[0],
    material: MATERIALS[0],
    quantityPurchased: '',
    unitCost: '',
    suggestedPrice: ''
  })
  const [loading, setLoading] = useState(true)
  const [savingExpense, setSavingExpense] = useState(false)
  const [savingCashCut, setSavingCashCut] = useState(false)
  const [savingLot, setSavingLot] = useState(false)
  const [savingLotItem, setSavingLotItem] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadDashboard() {
    setLoading(true)
    setError('')

    try {
      const [adminResult, inventoryResult] = await Promise.all([fetchTodayAdminData(), fetchInventoryData()])
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

    async function load() {
      setLoading(true)
      setError('')

      try {
        const [adminResult, inventoryResult] = await Promise.all([fetchTodayAdminData(), fetchInventoryData()])
        if (alive) {
          setSummary(adminResult)
          setInventory(inventoryResult)
        }
      } catch (loadError) {
        if (alive) setError(loadError.message || 'No se pudo cargar el dashboard.')
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()

    return () => {
      alive = false
    }
  }, [])

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
  const effectiveCity = eventCity.trim() || defaultCity || 'Evento'
  const cutDifference = Number(cashCounted || 0) - metrics.expectedCash

  async function handleSaveExpense() {
    if (savingExpense) return
    if (!expenseForm.description.trim() || Number(expenseForm.amount) <= 0) {
      setError('Completa descripcion y monto del gasto.')
      return
    }

    setSavingExpense(true)
    setError('')
    setNotice('')

    try {
      await saveExpense({
        city: effectiveCity,
        category: expenseForm.category,
        description: expenseForm.description.trim(),
        amount: Number(expenseForm.amount),
        paymentMethod: 'Efectivo'
      })
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
    if (savingCashCut) return

    setSavingCashCut(true)
    setError('')
    setNotice('')

    try {
      await saveCashCut({
        city: effectiveCity,
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
    if (savingLot) return
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
    if (savingLotItem) return
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
      setLotItemForm({
        code: '',
        category: PRODUCT_CATEGORIES[0],
        material: MATERIALS[0],
        quantityPurchased: '',
        unitCost: '',
        suggestedPrice: ''
      })
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
            <div style={styles.headerTitle}>Admin Chuladas</div>
            <div style={styles.headerMeta}>{user?.name} / ventas de hoy</div>
          </div>
          <button type="button" style={styles.blackPill} onClick={onBackToPOS}>
            Caja
          </button>
        </header>

        <section style={styles.panel}>
          <div style={styles.stack}>
            <div>
              <p style={styles.kicker}>Resumen operativo</p>
              <h1 style={styles.title}>{money(metrics.totalSold)}</h1>
              <p style={styles.copy}>{metrics.salesCount} venta(s) / Ticket promedio {money(metrics.averageTicket)}</p>
            </div>

            {loading && <div style={styles.notice}>Cargando datos...</div>}
            {notice && <div style={styles.notice}>{notice}</div>}
            {error && <div style={styles.error}>{error}</div>}
            {summary.storage === 'local' && !loading && (
              <div style={styles.notice}>{summary.reason || 'Mostrando ventas locales de este navegador.'}</div>
            )}
            {summary.reason && summary.storage === 'supabase' && !loading && <div style={styles.notice}>{summary.reason}</div>}
            {inventory.reason && !loading && <div style={styles.notice}>{inventory.reason}</div>}

            <label style={styles.labelBlock}>
              Ciudad / evento
              <input value={eventCity} onChange={(event) => setEventCity(event.target.value)} placeholder="Ej. Matehuala" style={styles.input} />
            </label>

            <div style={styles.grid}>
              <Metric label="Ventas del dia" value={metrics.salesCount} />
              <Metric label="Total vendido" value={money(metrics.totalSold)} />
              <Metric label="Gastos del dia" value={money(metrics.totalExpenses)} />
              <Metric label="Utilidad estimada" value={money(metrics.estimatedProfit)} />
              <Metric label="Ticket promedio" value={money(metrics.averageTicket)} />
              <Metric label="Diferencia caja" value={money(metrics.latestDifference)} />
              <Metric label="Inversion total" value={money(inventoryMetrics.totalInvestment)} />
              <Metric label="ROI basico" value={`${inventoryMetrics.roi.toFixed(1)}%`} />
              <Metric label="Ventas/inversion" value={`${inventoryMetrics.salesVsInvestment.toFixed(1)}%`} />
              <Metric label="Utilidad real est." value={money(inventoryMetrics.operatingProfit)} />
            </div>

            <div style={styles.listBlock}>
              <h2 style={styles.sectionTitle}>Ventas por metodo de pago</h2>
              {Object.keys(metrics.byPayment).length === 0 ? (
                <div style={styles.empty}>Aun no hay ventas hoy.</div>
              ) : (
                Object.entries(metrics.byPayment).map(([method, value]) => (
                  <div key={method} style={styles.paymentRow}>
                    <span>{method}</span>
                    <strong>{money(value)}</strong>
                  </div>
                ))
              )}
            </div>

            <section style={styles.moduleBlock}>
              <h2 style={styles.sectionTitle}>Inventario basico</h2>
              <ReadOnlyLine label="Cantidad comprada" value={inventoryMetrics.quantityPurchased} />
              <ReadOnlyLine label="Cantidad vendida" value={inventoryMetrics.quantitySold} />
              <ReadOnlyLine label="Restante estimado" value={inventoryMetrics.remainingEstimated} strong />
              <ReadOnlyLine label="Ingreso estimado" value={money(inventoryMetrics.estimatedRevenue)} />
              <ReadOnlyLine label="Utilidad estimada" value={money(inventoryMetrics.estimatedProfit)} strong />
              <div style={styles.compactList}>
                {inventory.lotItems.length === 0 ? (
                  <div style={styles.empty}>Aun no hay articulos de lote.</div>
                ) : (
                  inventory.lotItems.slice(0, 5).map((item) => (
                    <div key={item.id} style={styles.inventoryRow}>
                      <div>
                        <strong>{item.code || 'Sin codigo'}</strong>
                        <span>{item.category || 'Articulo'} / {item.material || 'Sin material'}</span>
                      </div>
                      <strong>{quantityPurchasedOf(item)} pza</strong>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section style={styles.moduleBlock}>
              <h2 style={styles.sectionTitle}>Nuevo lote</h2>
              <input
                value={lotForm.name}
                onChange={(event) => setLotForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Nombre lote"
                style={styles.input}
              />
              <input
                value={lotForm.supplier}
                onChange={(event) => setLotForm((current) => ({ ...current, supplier: event.target.value }))}
                placeholder="Proveedor"
                style={styles.input}
              />
              <input
                value={lotForm.purchasePlace}
                onChange={(event) => setLotForm((current) => ({ ...current, purchasePlace: event.target.value }))}
                placeholder="Lugar compra"
                style={styles.input}
              />
              <div style={styles.twoColumns}>
                <input
                  value={lotForm.purchaseDate}
                  onChange={(event) => setLotForm((current) => ({ ...current, purchaseDate: event.target.value }))}
                  type="date"
                  style={styles.input}
                />
                <input
                  value={lotForm.totalInvestment}
                  onChange={(event) => setLotForm((current) => ({ ...current, totalInvestment: event.target.value }))}
                  placeholder="Inversion"
                  inputMode="decimal"
                  type="number"
                  min="0"
                  style={styles.input}
                />
              </div>
              <textarea
                value={lotForm.notes}
                onChange={(event) => setLotForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Notas"
                style={styles.textarea}
              />
              <button type="button" style={styles.primaryButton} disabled={savingLot} onClick={handleSaveLot}>
                {savingLot ? 'Guardando...' : 'Guardar lote'}
              </button>
            </section>

            <section style={styles.moduleBlock}>
              <h2 style={styles.sectionTitle}>Articulos del lote</h2>
              <select value={selectedLotId} onChange={(event) => setSelectedLotId(event.target.value)} style={styles.input}>
                {inventory.lots.length === 0 ? (
                  <option value="">Sin lotes</option>
                ) : (
                  inventory.lots.map((lot) => (
                    <option key={lot.id} value={lot.id}>{lotLabel(lot)}</option>
                  ))
                )}
              </select>
              <input
                value={lotItemForm.code}
                onChange={(event) => setLotItemForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                placeholder="Codigo"
                style={styles.input}
              />
              <div style={styles.twoColumns}>
                <select
                  value={lotItemForm.category}
                  onChange={(event) => setLotItemForm((current) => ({ ...current, category: event.target.value }))}
                  style={styles.input}
                >
                  {PRODUCT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <select
                  value={lotItemForm.material}
                  onChange={(event) => setLotItemForm((current) => ({ ...current, material: event.target.value }))}
                  style={styles.input}
                >
                  {MATERIALS.map((material) => (
                    <option key={material} value={material}>{material}</option>
                  ))}
                </select>
              </div>
              <div style={styles.threeColumns}>
                <input
                  value={lotItemForm.quantityPurchased}
                  onChange={(event) => setLotItemForm((current) => ({ ...current, quantityPurchased: event.target.value }))}
                  placeholder="Cant."
                  inputMode="decimal"
                  type="number"
                  min="0"
                  style={styles.input}
                />
                <input
                  value={lotItemForm.unitCost}
                  onChange={(event) => setLotItemForm((current) => ({ ...current, unitCost: event.target.value }))}
                  placeholder="Costo"
                  inputMode="decimal"
                  type="number"
                  min="0"
                  style={styles.input}
                />
                <input
                  value={lotItemForm.suggestedPrice}
                  onChange={(event) => setLotItemForm((current) => ({ ...current, suggestedPrice: event.target.value }))}
                  placeholder="Precio"
                  inputMode="decimal"
                  type="number"
                  min="0"
                  style={styles.input}
                />
              </div>
              <button type="button" style={styles.primaryButton} disabled={savingLotItem || !selectedLotId} onClick={handleSaveLotItem}>
                {savingLotItem ? 'Guardando...' : 'Agregar articulo'}
              </button>
            </section>

            <section style={styles.moduleBlock}>
              <h2 style={styles.sectionTitle}>Gastos del evento</h2>
              <select
                value={expenseForm.category}
                onChange={(event) => setExpenseForm((current) => ({ ...current, category: event.target.value }))}
                style={styles.input}
              >
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              <input
                value={expenseForm.description}
                onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Descripcion"
                style={styles.input}
              />
              <input
                value={expenseForm.amount}
                onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))}
                placeholder="Monto"
                inputMode="decimal"
                type="number"
                min="0"
                style={styles.input}
              />
              <button type="button" style={styles.primaryButton} disabled={savingExpense} onClick={handleSaveExpense}>
                {savingExpense ? 'Guardando...' : 'Guardar gasto'}
              </button>

              <div style={styles.compactList}>
                {summary.expenses.length === 0 ? (
                  <div style={styles.empty}>No hay gastos registrados hoy.</div>
                ) : (
                  summary.expenses.slice(0, 4).map((expense) => (
                    <div key={expense.id} style={styles.paymentRow}>
                      <span>{expense.category} / {expense.description}</span>
                      <strong>{money(expense.amount)}</strong>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section style={styles.moduleBlock}>
              <h2 style={styles.sectionTitle}>Corte de caja</h2>
              <ReadOnlyLine label="Venta total sistema" value={money(metrics.totalSold)} />
              <ReadOnlyLine label="Efectivo esperado" value={money(metrics.expectedCash)} />
              <label style={styles.labelBlock}>
                Efectivo contado
                <input value={cashCounted} onChange={(event) => setCashCounted(event.target.value)} type="number" inputMode="decimal" min="0" style={styles.input} />
              </label>
              <ReadOnlyLine label="Transferencias" value={money(metrics.transferTotal)} />
              <ReadOnlyLine label="Tarjeta" value={money(metrics.cardTotal)} />
              <ReadOnlyLine label="Gastos en efectivo" value={money(metrics.cashExpenses)} />
              <ReadOnlyLine label="Diferencia" value={money(cutDifference)} strong />
              <textarea
                value={cashCutNotes}
                onChange={(event) => setCashCutNotes(event.target.value)}
                placeholder="Notas del corte"
                style={styles.textarea}
              />
              <button type="button" style={styles.primaryButton} disabled={savingCashCut} onClick={handleSaveCashCut}>
                {savingCashCut ? 'Guardando...' : 'Guardar corte'}
              </button>
            </section>

            <button type="button" style={styles.secondaryButton} onClick={onLogout}>
              Cerrar sesion
            </button>
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

function ReadOnlyLine({ label, value, strong = false }) {
  return (
    <div style={{ ...styles.readOnlyLine, fontWeight: strong ? 800 : 620 }}>
      <span>{label}</span>
      <strong>{value}</strong>
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
  const cashExpenses = expenses
    .filter((expense) => !expense.payment_method || expense.payment_method === 'Efectivo')
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  const cashSales = Number(byPayment.Efectivo || 0)
  const transferTotal = Number(byPayment.Transferencia || 0)
  const cardTotal = Number(byPayment.Tarjeta || 0)
  const mixedTotal = Number(byPayment.Mixto || 0)
  const expectedCash = cashSales - cashExpenses
  const latestDifference = cashCuts.length ? Number(cashCuts[0].difference || 0) : 0

  return {
    salesCount,
    totalSold,
    averageTicket,
    byPayment,
    totalExpenses,
    cashExpenses,
    estimatedProfit: totalSold - totalExpenses,
    expectedCash,
    transferTotal,
    cardTotal,
    mixedTotal,
    latestDifference
  }
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

  return {
    quantityPurchased,
    quantitySold,
    remainingEstimated,
    estimatedRevenue: estimatedRevenue || actualRevenue,
    estimatedProfit,
    operatingProfit,
    totalInvestment,
    roi,
    salesVsInvestment
  }
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

const styles = {
  page: {
    minHeight: '100svh',
    background: '#f4f4f4',
    color: '#111111',
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: '18px 18px 22px',
    boxSizing: 'border-box'
  },
  shell: {
    width: '100%',
    maxWidth: 430,
    margin: '0 auto'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
    background: '#ffffff',
    border: '1px solid #111111',
    borderRadius: 999,
    padding: '8px 8px 8px 16px',
    boxShadow: '0 12px 26px rgba(17, 17, 17, 0.08)'
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.15
  },
  headerMeta: {
    color: '#555555',
    fontSize: 14,
    fontWeight: 500,
    marginTop: 2
  },
  blackPill: {
    minWidth: 74,
    height: 48,
    border: 'none',
    borderRadius: 999,
    background: '#111111',
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 700
  },
  panel: {
    background: '#ffffff',
    border: '1px solid #111111',
    borderRadius: 28,
    padding: 18,
    boxShadow: '0 14px 28px rgba(17, 17, 17, 0.08)'
  },
  stack: {
    display: 'grid',
    gap: 14
  },
  kicker: {
    margin: 0,
    color: '#666666',
    fontSize: 13,
    fontWeight: 700,
    textTransform: 'uppercase'
  },
  title: {
    margin: '4px 0',
    color: '#111111',
    fontSize: 42,
    lineHeight: 1,
    fontWeight: 740
  },
  copy: {
    margin: 0,
    color: '#555555',
    fontSize: 15
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10
  },
  metricCard: {
    border: '1px solid #111111',
    borderRadius: 20,
    background: '#ffffff',
    padding: 14,
    display: 'grid',
    gap: 6
  },
  listBlock: {
    border: '1px solid #111111',
    borderRadius: 20,
    padding: 14,
    display: 'grid',
    gap: 8
  },
  moduleBlock: {
    border: '1px solid #111111',
    borderRadius: 22,
    padding: 14,
    display: 'grid',
    gap: 10,
    background: '#ffffff'
  },
  sectionTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 720
  },
  paymentRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    padding: '10px 0',
    borderTop: '1px solid #eeeeee',
    fontSize: 14
  },
  inventoryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    padding: '10px 0',
    borderTop: '1px solid #eeeeee',
    fontSize: 14
  },
  compactList: {
    display: 'grid',
    gap: 2
  },
  notice: {
    border: '1px solid #0EA371',
    borderRadius: 18,
    background: '#DFF8EC',
    color: '#064E3B',
    padding: 12,
    fontSize: 14,
    fontWeight: 700,
    textAlign: 'center'
  },
  error: {
    border: '1px solid #fecaca',
    borderRadius: 18,
    background: '#fff5f5',
    color: '#991b1b',
    padding: 12,
    fontSize: 14,
    fontWeight: 700,
    textAlign: 'center'
  },
  empty: {
    border: '1px dashed #a3a3a3',
    borderRadius: 18,
    background: '#f5f5f5',
    color: '#555555',
    padding: 18,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: 560
  },
  labelBlock: {
    display: 'grid',
    gap: 6,
    color: '#333333',
    fontSize: 14,
    fontWeight: 700
  },
  input: {
    width: '100%',
    minHeight: 54,
    border: '1px solid #111111',
    borderRadius: 18,
    background: '#ffffff',
    color: '#111111',
    fontSize: 16,
    fontWeight: 560,
    padding: '0 12px',
    boxSizing: 'border-box'
  },
  textarea: {
    width: '100%',
    minHeight: 86,
    border: '1px solid #111111',
    borderRadius: 18,
    background: '#ffffff',
    color: '#111111',
    fontSize: 16,
    fontWeight: 560,
    padding: '12px',
    boxSizing: 'border-box',
    resize: 'vertical'
  },
  twoColumns: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8
  },
  threeColumns: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 8
  },
  readOnlyLine: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    border: '1px solid #eeeeee',
    borderRadius: 16,
    padding: 12,
    fontSize: 15
  },
  primaryButton: {
    width: '100%',
    minHeight: 56,
    border: '1px solid #0EA371',
    borderRadius: 18,
    background: '#10B981',
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 720,
    boxShadow: '0 12px 22px rgba(16, 185, 129, 0.18)',
    transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease'
  },
  secondaryButton: {
    width: '100%',
    minHeight: 56,
    border: '1px solid #111111',
    borderRadius: 18,
    background: '#ffffff',
    color: '#111111',
    fontSize: 16,
    fontWeight: 720,
    transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease'
  }
}

export default AdminDashboard
