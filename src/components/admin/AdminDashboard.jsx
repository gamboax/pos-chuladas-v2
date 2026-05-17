import { useEffect, useMemo, useState } from 'react'
import { fetchTodaySalesSummary } from '../../lib/sales'
import { money } from '../../lib/ticket'

function AdminDashboard({ user, onBackToPOS, onLogout }) {
  const [summary, setSummary] = useState({ storage: 'supabase', sales: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true

    async function load() {
      setLoading(true)
      setError('')

      try {
        const result = await fetchTodaySalesSummary()
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

  const metrics = useMemo(() => buildMetrics(summary.sales), [summary.sales])

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
            {error && <div style={styles.error}>{error}</div>}
            {summary.storage === 'local' && !loading && (
              <div style={styles.notice}>{summary.reason || 'Mostrando ventas locales de este navegador.'}</div>
            )}

            <div style={styles.grid}>
              <Metric label="Ventas del dia" value={metrics.salesCount} />
              <Metric label="Total vendido" value={money(metrics.totalSold)} />
              <Metric label="Ticket promedio" value={money(metrics.averageTicket)} />
              <Metric label="Metodos usados" value={Object.keys(metrics.byPayment).length} />
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

function buildMetrics(sales) {
  const salesCount = sales.length
  const totalSold = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)
  const averageTicket = salesCount ? totalSold / salesCount : 0
  const byPayment = sales.reduce((acc, sale) => {
    const method = sale.payment_method || sale.paymentMethod || 'Sin metodo'
    acc[method] = (acc[method] || 0) + Number(sale.total || 0)
    return acc
  }, {})

  return {
    salesCount,
    totalSold,
    averageTicket,
    byPayment
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
    borderTop: '1px solid #eeeeee'
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
