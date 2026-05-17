import { useEffect, useMemo, useState } from 'react'
import { fetchTodayAdminData, saveCashCut, saveExpense } from '../../lib/sales'
import { money } from '../../lib/ticket'

const EXPENSE_CATEGORIES = [
  'Facebook Ads',
  'Gasolina',
  'Casetas',
  'Comida',
  'Hotel',
  'Ayudantes',
  'Lugar/Renta',
  'Mercancía',
  'Otros'
]

function AdminDashboard({ user, onBackToPOS, onLogout }) {
  const defaultCity = readActiveCityDraft()
  const [summary, setSummary] = useState({ storage: 'supabase', sales: [], expenses: [], cashCuts: [] })
  const [eventCity, setEventCity] = useState(defaultCity)
  const [expenseForm, setExpenseForm] = useState({ category: EXPENSE_CATEGORIES[0], description: '', amount: '' })
  const [cashCounted, setCashCounted] = useState('')
  const [cashCutNotes, setCashCutNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingExpense, setSavingExpense] = useState(false)
  const [savingCashCut, setSavingCashCut] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadDashboard() {
    setLoading(true)
    setError('')

    try {
      const result = await fetchTodayAdminData()
      setSummary(result)
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
        const result = await fetchTodayAdminData()
        if (alive) setSummary(result)
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

  const metrics = useMemo(() => buildMetrics(summary.sales, summary.expenses, summary.cashCuts), [summary.sales, summary.expenses, summary.cashCuts])
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

            {loading && <div style={styles.notice}>Cargando ventas...</div>}
            {notice && <div style={styles.notice}>{notice}</div>}
            {error && <div style={styles.error}>{error}</div>}
            {summary.storage === 'local' && !loading && (
              <div style={styles.notice}>{summary.reason || 'Mostrando ventas locales de este navegador.'}</div>
            )}
            {summary.reason && summary.storage === 'supabase' && !loading && <div style={styles.notice}>{summary.reason}</div>}

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
                style={{ ...styles.input, minHeight: 86, paddingTop: 12, resize: 'vertical' }}
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
    padding: '10px 10px 16px',
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
    borderRadius: 24,
    padding: 16,
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
  compactList: {
    display: 'grid',
    gap: 2
  },
  notice: {
    border: '1px solid #8FE3C1',
    borderRadius: 18,
    background: '#A7E8D0',
    color: '#111111',
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
    border: 'none',
    borderRadius: 18,
    background: '#111111',
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 720
  },
  secondaryButton: {
    width: '100%',
    minHeight: 56,
    border: '1px solid #111111',
    borderRadius: 18,
    background: '#ffffff',
    color: '#111111',
    fontSize: 16,
    fontWeight: 720
  }
}

export default AdminDashboard
