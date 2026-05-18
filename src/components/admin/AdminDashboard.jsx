import { useEffect, useMemo, useState } from 'react'
import {
  cancelSale,
  fetchInventoryData,
  fetchTodayAdminData,
  getPendingLocalSales,
  markTicketSent,
  saveCashCut,
  saveExpense,
  savePurchaseLot,
  savePurchaseLotItem
} from '../../lib/sales'
import { money } from '../../lib/ticket'

const EXPENSE_CATEGORIES = ['Renta del lugar', 'Gasolina', 'Comida', 'Pago de colaborador', 'Casetas', 'Otros']
const PRODUCT_CATEGORIES = ['Anillo', 'Pulsera', 'Tobillera', 'Collar', 'Cadena', 'Dije', 'Rosario', 'Juego', 'Arete', 'Caja']
const MATERIALS = ['Acero inoxidable', 'Oro laminado', 'Bano de rodio', 'Bano de plata']

function AdminDashboard({ user, onBackToPOS, onLogout }) {
  const role = user?.role || 'admin'
  const isSuperAdmin = role === 'super_admin'
  const isInvestor = role === 'investor'
  const isManager = ['manager', 'admin_operativo', 'admin'].includes(role)
  const canManageOps = isManager || isSuperAdmin
  const usesMonthlyGlobalView = isSuperAdmin || isInvestor
  const defaultCity = usesMonthlyGlobalView ? '' : readActiveCityDraft()

  const [summary, setSummary] = useState({ storage: 'supabase', sales: [], expenses: [], cashCuts: [] })
  const [inventory, setInventory] = useState({ storage: 'supabase', lots: [], lotItems: [], productCodes: [], saleItems: [] })
  const [eventCity, setEventCity] = useState(defaultCity)
  const [eventDate, setEventDate] = useState(todayInputValue())
  const [eventMonth, setEventMonth] = useState(monthInputValue())
  const [superView, setSuperView] = useState('month')
  const [selectedCityDrill, setSelectedCityDrill] = useState('')
  const [operationsCity, setOperationsCity] = useState('')
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [ticketSearch, setTicketSearch] = useState('')
  const [pendingLocalSales, setPendingLocalSales] = useState([])
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
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
  const [savingCancellation, setSavingCancellation] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const effectiveCity = eventCity.trim()

  async function loadDashboard(city = effectiveCity, date = eventDate, month = eventMonth) {
    setLoading(true)
    setError('')

    try {
      const shouldLoadInventory = isSuperAdmin || isInvestor
      const filters = usesMonthlyGlobalView ? { city, month } : { city, date }
      const [adminResult, inventoryResult] = await Promise.all([
        fetchTodayAdminData(filters),
        shouldLoadInventory ? fetchInventoryData() : Promise.resolve({ storage: 'supabase', lots: [], lotItems: [], productCodes: [], saleItems: [] })
      ])
      setSummary(adminResult)
      setInventory(inventoryResult)
      setPendingLocalSales(filterPendingByPeriod(getPendingLocalSales({ city }), { date, month, monthly: usesMonthlyGlobalView }))
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
        const filters = usesMonthlyGlobalView ? { city: eventCity.trim(), month: eventMonth } : { city: eventCity.trim(), date: eventDate }
        const [adminResult, inventoryResult] = await Promise.all([
          fetchTodayAdminData(filters),
          shouldLoadInventory ? fetchInventoryData() : Promise.resolve({ storage: 'supabase', lots: [], lotItems: [], productCodes: [], saleItems: [] })
        ])
        if (alive) {
          setSummary(adminResult)
          setInventory(inventoryResult)
          setPendingLocalSales(filterPendingByPeriod(getPendingLocalSales({ city: eventCity.trim() }), { date: eventDate, month: eventMonth, monthly: usesMonthlyGlobalView }))
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
  }, [eventCity, eventDate, eventMonth, isSuperAdmin, isInvestor, usesMonthlyGlobalView])


  const activeSales = useMemo(() => summary.sales.filter((sale) => !isCancelledSale(sale)), [summary.sales])
  const cancelledSales = useMemo(() => summary.sales.filter(isCancelledSale), [summary.sales])
  const criticalChanges = useMemo(() => buildCriticalChanges(cancelledSales), [cancelledSales])
  const metrics = useMemo(() => buildMetrics(activeSales, summary.expenses, summary.cashCuts), [activeSales, summary.expenses, summary.cashCuts])
  const inventoryMetrics = useMemo(() => buildInventoryMetrics(inventory, metrics.totalSold, metrics.totalExpenses), [inventory, metrics.totalSold, metrics.totalExpenses])
  const operationalAnalytics = useMemo(() => buildOperationalAnalytics(activeSales, summary.expenses, inventory), [activeSales, summary.expenses, inventory])
  const monthlyAnalytics = useMemo(() => buildMonthlyAnalytics(activeSales, summary.sales, summary.expenses, inventory), [activeSales, summary.sales, summary.expenses, inventory])
  const visibleTickets = useMemo(() => filterTickets(activeSales, ticketSearch), [activeSales, ticketSearch])
  const selectedCityAnalytics = useMemo(() => selectedCityDrill ? buildMonthlyAnalytics(activeSales.filter((sale) => cityEquals(sale.city, selectedCityDrill)), summary.sales.filter((sale) => cityEquals(sale.city, selectedCityDrill)), summary.expenses.filter((expense) => cityEquals(expense.city, selectedCityDrill)), inventory) : null, [activeSales, summary.sales, summary.expenses, inventory, selectedCityDrill])
  const operationsSales = useMemo(() => {
    const source = operationsCity ? summary.sales.filter((sale) => cityEquals(sale.city, operationsCity)) : summary.sales
    return source.slice().sort((a, b) => saleDate(b) - saleDate(a))
  }, [summary.sales, operationsCity])
  const activeLotId = selectedLotId && inventory.lots.some((lot) => lot.id === selectedLotId) ? selectedLotId : inventory.lots[0]?.id || ''
  const cutDifference = Number(cashCounted || 0) - metrics.expectedCash
  const cityLabel = effectiveCity || 'Todas las ciudades'
  const eventLabel = usesMonthlyGlobalView ? `Resumen mensual: ${monthLabel(eventMonth)}` : effectiveCity ? `Evento activo: ${effectiveCity}` : 'Vista general del dia'

  async function handleCancelSale() {
    if (!isSuperAdmin || !cancelTarget || savingCancellation) return

    if (!cancelReason.trim()) {
      setError('Escribe un motivo para anular la venta.')
      return
    }

    setSavingCancellation(true)
    setError('')
    setNotice('')

    try {
      await cancelSale(cancelTarget.id, cancelReason)
      setNotice(`Venta ${cancelTarget.folio || ''} anulada.`)
      setCancelTarget(null)
      setCancelReason('')
      await loadDashboard()
    } catch (cancelError) {
      setError(cancelError.message || 'No se pudo anular la venta.')
    } finally {
      setSavingCancellation(false)
    }
  }

  function handleExport(kind) {
    const fileDate = usesMonthlyGlobalView ? eventMonth : eventDate || todayInputValue()
    const cityPart = effectiveCity || 'general'

    if (kind === 'sales') {
      downloadCsv(`ventas-${cityPart}-${fileDate}.csv`, buildSalesCsvRows(summary.sales))
      return
    }

    if (kind === 'expenses') {
      downloadCsv(`gastos-${cityPart}-${fileDate}.csv`, buildExpenseCsvRows(summary.expenses))
      return
    }

    downloadCsv(`corte-${cityPart}-${fileDate}.csv`, buildCashCutCsvRows(summary.cashCuts))
  }

  async function handleCopyTicket(sale) {
    const text = buildDashboardTicket(sale)
    await navigator.clipboard?.writeText(text)
    setNotice('Ticket copiado.')
  }

  async function handleResendWhatsApp(sale) {
    window.open(buildDashboardWhatsAppUrl(sale), '_blank', 'noopener,noreferrer')
    if (!isInvestor) {
      try {
        await markTicketSent(sale.id)
        setNotice('Ticket marcado como enviado.')
        await loadDashboard()
      } catch (markError) {
        setNotice(markError.message || 'WhatsApp abierto; no se pudo marcar como enviado.')
      }
    }
  }

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
    if (Number(cashCounted || 0) < 0) {
      setError('El efectivo contado no puede ser negativo.')
      return
    }

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
    if (!activeLotId) {
      setError('Primero crea o selecciona un lote.')
      return
    }

    if (!lotItemForm.code.trim() || Number(lotItemForm.quantityPurchased) <= 0) {
      setError('Completa codigo y cantidad comprada.')
      return
    }

    if (Number(lotItemForm.unitCost || 0) < 0 || Number(lotItemForm.suggestedPrice || 0) < 0) {
      setError('Costo y precio no pueden ser negativos.')
      return
    }

    setSavingLotItem(true)
    setError('')
    setNotice('')

    try {
      await savePurchaseLotItem({
        lotId: activeLotId,
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

            {usesMonthlyGlobalView ? (
              <section style={styles.cleanSection}>
                <div style={styles.sectionHead}>
                  <h2 style={styles.sectionTitle}>Periodo</h2>
                  <span style={styles.chip}>{isInvestor ? 'Solo lectura' : 'Global'}</span>
                </div>
                <label style={styles.labelBlock}>
                  Mes
                  <input value={eventMonth} onChange={(event) => { setEventMonth(event.target.value); setSuperView('month'); setSelectedCityDrill(''); setOperationsCity(''); setSelectedTicket(null) }} type="month" style={styles.input} />
                </label>
              </section>
            ) : (
              <>
                <label style={styles.labelBlock}>
                  Ciudad / evento
                  <input value={eventCity} onChange={(event) => setEventCity(event.target.value)} placeholder="Ej. Matehuala" style={styles.input} />
                </label>
                <label style={styles.labelBlock}>
                  Fecha
                  <input value={eventDate} onChange={(event) => setEventDate(event.target.value)} type="date" style={styles.input} />
                </label>
              </>
            )}

            {usesMonthlyGlobalView && (
              <SuperAdminHierarchy
                month={eventMonth}
                activeView={superView}
                setActiveView={setSuperView}
                selectedCity={selectedCityDrill}
                setSelectedCity={setSelectedCityDrill}
                operationsCity={operationsCity}
                setOperationsCity={setOperationsCity}
                analytics={monthlyAnalytics}
                cityAnalytics={selectedCityAnalytics}
                operationsSales={operationsSales}
                inventory={inventory}
                isInvestor={isInvestor}
                selectedTicket={selectedTicket}
                onSelectTicket={setSelectedTicket}
                onBackTicket={() => setSelectedTicket(null)}
                onCopyTicket={handleCopyTicket}
                onResendWhatsApp={handleResendWhatsApp}
              />
            )}

            {!usesMonthlyGlobalView && (
              <>
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
                {canManageOps && !isSuperAdmin && <Metric label="Utilidad bruta" value={money(metrics.grossProfit)} />}
                {canManageOps && !isSuperAdmin && <Metric label="Utilidad neta" value={money(metrics.netProfit)} />}
                {(isSuperAdmin || isInvestor) && <Metric label="ROI" value={`${inventoryMetrics.roi.toFixed(1)}%`} />}
              </div>
            </section>

            <section style={styles.cleanSection}>
              <div style={styles.sectionHead}>
                <h2 style={styles.sectionTitle}>Pulso operativo</h2>
                <span style={styles.chip}>Ahora</span>
              </div>
              <div style={styles.grid}>
                <Metric label="Ultima hora" value={money(operationalAnalytics.lastHourSales)} />
                <Metric label="Tickets 1h" value={operationalAnalytics.lastHourTickets} />
                <Metric label="Pago dominante" value={operationalAnalytics.dominantPayment || 'Sin datos'} />
                <Metric label="Categoria top" value={operationalAnalytics.topCategory?.name || 'Sin datos'} />
                <Metric label="Utilidad tiempo real" value={money(operationalAnalytics.estimatedProfit)} />
                <Metric label="Ticket actual" value={money(metrics.averageTicket)} />
              </div>
            </section>

            <section style={styles.cleanSection}>
              <div style={styles.sectionHead}>
                <h2 style={styles.sectionTitle}>Insights rapidos</h2>
                <span style={styles.chip}>{operationalAnalytics.insights.length}</span>
              </div>
              {operationalAnalytics.insights.length === 0 ? (
                <div style={styles.empty}>Aun falta movimiento para generar insights.</div>
              ) : (
                <div style={styles.insightStack}>
                  {operationalAnalytics.insights.map((insight) => <div key={insight} style={styles.insightPill}>{insight}</div>)}
                </div>
              )}
            </section>

            <section style={styles.cleanSection}>
              <div style={styles.sectionHead}>
                <h2 style={styles.sectionTitle}>Articulos por categoria</h2>
                <span style={styles.chip}>{operationalAnalytics.categoryRows.length}</span>
              </div>
              {operationalAnalytics.categoryRows.length === 0 ? (
                <div style={styles.empty}>Sin articulos detallados todavia.</div>
              ) : (
                <div style={styles.miniBars}>
                  {operationalAnalytics.categoryRows.slice(0, 8).map((category) => (
                    <CategoryRow key={category.name} category={category} max={operationalAnalytics.topCategorySales} />
                  ))}
                </div>
              )}
            </section>

            <section style={styles.cleanSection}>
              <div style={styles.sectionHead}>
                <h2 style={styles.sectionTitle}>Heat operacional</h2>
                <span style={styles.chip}>Por hora</span>
              </div>
              {operationalAnalytics.hourly.length === 0 ? (
                <div style={styles.empty}>Sin tickets por hora todavia.</div>
              ) : (
                <div style={styles.miniBars}>
                  {operationalAnalytics.hourly.map((hour) => <MiniBar key={hour.hour} item={hour} max={operationalAnalytics.maxHourlySales} />)}
                </div>
              )}
            </section>

            <section style={styles.cleanSection}>
              <div style={styles.sectionHead}>
                <h2 style={styles.sectionTitle}>Clientes</h2>
                <span style={styles.chip}>{operationalAnalytics.customerMetrics.captured}</span>
              </div>
              <div style={styles.grid}>
                <Metric label="Capturados" value={operationalAnalytics.customerMetrics.captured} />
                <Metric label="Repetidos" value={operationalAnalytics.customerMetrics.repeatCustomers} />
                <Metric label="Prom. cliente" value={money(operationalAnalytics.customerMetrics.averagePerCustomer)} />
                <Metric label="Top comprador" value={operationalAnalytics.customerMetrics.topCustomer?.name || 'Sin datos'} />
              </div>
            </section>

            {(isSuperAdmin || isInvestor) && (
              <section style={styles.cleanSection}>
                <div style={styles.sectionHead}>
                  <h2 style={styles.sectionTitle}>Rendimiento por ciudad</h2>
                  <span style={styles.chip}>{operationalAnalytics.cityRanking.length}</span>
                </div>
                {operationalAnalytics.cityRanking.length === 0 ? (
                  <div style={styles.empty}>Sin ciudades para comparar.</div>
                ) : (
                  operationalAnalytics.cityRanking.slice(0, 6).map((city) => (
                    <RankRow key={city.city} city={city} max={operationalAnalytics.topCitySales} />
                  ))
                )}
              </section>
            )}

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
                visibleTickets.slice(0, 8).map((sale) => <TicketRow key={sale.id} sale={sale} onSelect={setSelectedTicket} />)
              )}
              {selectedTicket && (
                <TicketDetail
                  sale={selectedTicket}
                  inventory={inventory}
                  isInvestor={isInvestor}
                  onCopy={handleCopyTicket}
                  onResendWhatsApp={handleResendWhatsApp}
                  onClose={() => setSelectedTicket(null)}
                />
              )}
            </section>
              </>
            )}

            {isSuperAdmin && (
              <section style={styles.cleanSection}>
                <div style={styles.sectionHead}>
                  <h2 style={styles.sectionTitle}>Auditoria</h2>
                  <span style={styles.chip}>{usesMonthlyGlobalView ? monthLabel(eventMonth) : eventDate}</span>
                </div>

                <div style={styles.exportGrid}>
                  <button type="button" style={styles.smallActionButton} onClick={() => handleExport('sales')}>CSV ventas</button>
                  <button type="button" style={styles.smallActionButton} onClick={() => handleExport('expenses')}>CSV gastos</button>
                  <button type="button" style={styles.smallActionButton} onClick={() => handleExport('cashCuts')}>CSV corte</button>
                </div>

                <div style={styles.grid}>
                  <Metric label="Sincronizadas" value={summary.sales.length} />
                  <Metric label="Pendientes" value={pendingLocalSales.length} />
                  <Metric label="Canceladas" value={cancelledSales.length} />
                  <Metric label="Cambios criticos" value={criticalChanges.length} />
                </div>

                <div style={styles.auditGroup}>
                  <div style={styles.sectionHead}><h3 style={styles.auditTitle}>Ventas recientes</h3><span style={styles.chip}>{summary.sales.length}</span></div>
                  {summary.sales.length === 0 ? <div style={styles.empty}>Sin ventas para auditar.</div> : summary.sales.slice(0, 8).map((sale) => (
                    <AuditSaleCard key={sale.id || sale.folio} sale={sale} onSelect={setSelectedTicket} onCancel={setCancelTarget} />
                  ))}
                </div>

                {cancelTarget && (
                  <div style={styles.cancelBox}>
                    <strong>Anular {cancelTarget.folio || 'venta'}</strong>
                    <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Motivo de anulacion" style={styles.textarea} />
                    <div style={styles.twoColumns}>
                      <button type="button" style={styles.secondaryButton} onClick={() => { setCancelTarget(null); setCancelReason('') }}>Cancelar</button>
                      <button type="button" disabled={savingCancellation} style={styles.dangerButton} onClick={handleCancelSale}>{savingCancellation ? 'Anulando...' : 'Anular venta'}</button>
                    </div>
                  </div>
                )}

                <div style={styles.auditGroup}>
                  <div style={styles.sectionHead}><h3 style={styles.auditTitle}>Pendientes locales</h3><span style={styles.chip}>{pendingLocalSales.length}</span></div>
                  {pendingLocalSales.length === 0 ? <div style={styles.empty}>Sin ventas pendientes locales.</div> : pendingLocalSales.slice(0, 6).map((sale) => (
                    <AuditInfoCard key={sale.id || sale.folio} title={sale.folio || 'Pendiente'} meta={sale.city || cityLabel} value={money(sale.total)} status="Pendiente de sincronizar" />
                  ))}
                </div>

                <div style={styles.auditGroup}>
                  <div style={styles.sectionHead}><h3 style={styles.auditTitle}>Gastos y cortes</h3><span style={styles.chip}>{summary.expenses.length + summary.cashCuts.length}</span></div>
                  {summary.expenses.slice(0, 4).map((expense) => <AuditInfoCard key={expense.id} title={expense.category} meta={expense.description || expense.city} value={money(expense.amount)} status="Gasto" />)}
                  {summary.cashCuts.slice(0, 3).map((cut) => <AuditInfoCard key={cut.id} title="Corte de caja" meta={cut.city || cityLabel} value={money(cut.difference)} status={cashCutStatus(cut.difference)} />)}
                  {!summary.expenses.length && !summary.cashCuts.length && <div style={styles.empty}>Sin gastos ni cortes para auditar.</div>}
                </div>

                <div style={styles.auditGroup}>
                  <div style={styles.sectionHead}><h3 style={styles.auditTitle}>Cambios criticos</h3><span style={styles.chip}>{criticalChanges.length}</span></div>
                  {criticalChanges.length === 0 ? <div style={styles.empty}>Sin cambios criticos registrados.</div> : criticalChanges.map((change) => (
                    <AuditInfoCard key={change.id} title={change.title} meta={change.meta} value={change.value} status={change.status} />
                  ))}
                </div>
              </section>
            )}
            {canManageOps && !isSuperAdmin && (
              <>
                <section style={styles.cleanSection}>
                  <div style={styles.sectionHead}><h2 style={styles.sectionTitle}>Gastos del evento</h2><span style={styles.chip}>{cityLabel}</span></div>
                  <select value={expenseForm.category} onChange={(event) => setExpenseForm((current) => ({ ...current, category: event.target.value }))} style={styles.input}>{EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select>
                  <input value={expenseForm.description} onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))} placeholder="Descripcion" style={styles.input} />
                  <input value={expenseForm.amount} onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Monto" inputMode="decimal" type="number" min="0" style={styles.input} />
                  <button type="button" style={styles.primaryButton} disabled={savingExpense} onClick={handleSaveExpense}>{savingExpense ? 'Guardando...' : 'Guardar gasto'}</button>
                  <DataRow label="Gastos del evento" value={money(metrics.totalExpenses)} strong />
                  <DataRow label="Utilidad neta est." value={money(metrics.netProfit)} strong />
                  {summary.expenses.slice(0, 4).map((expense) => <DataRow key={expense.id} label={`${expense.category} / ${expense.description}`} value={money(expense.amount)} />)}
                </section>

                <section style={styles.cleanSection}>
                  <div style={styles.sectionHead}><h2 style={styles.sectionTitle}>Corte de caja</h2><span style={styles.chip}>{cityLabel}</span></div>
                  <DataRow label="Venta total sistema" value={money(metrics.totalSold)} />
                  <DataRow label="Efectivo esperado" value={money(metrics.expectedCash)} />
                  <label style={styles.labelBlock}>Efectivo contado<input value={cashCounted} onChange={(event) => setCashCounted(event.target.value)} type="number" inputMode="decimal" min="0" style={styles.input} /></label>
                  <DataRow label="Transferencias" value={money(metrics.transferTotal)} />
                  <DataRow label="Tarjeta" value={money(metrics.cardTotal)} />
                  <DataRow label="Gastos en efectivo" value={money(metrics.cashExpenses)} />
                  <DataRow label="Diferencia" value={`${money(cutDifference)} / ${cashCutStatus(cutDifference)}`} strong />
                  <textarea value={cashCutNotes} onChange={(event) => setCashCutNotes(event.target.value)} placeholder="Notas del corte" style={styles.textarea} />
                  <button type="button" style={styles.primaryButton} disabled={savingCashCut} onClick={handleSaveCashCut}>{savingCashCut ? 'Guardando...' : 'Guardar corte'}</button>
                </section>
              </>
            )}

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
                  <select value={activeLotId} onChange={(event) => setSelectedLotId(event.target.value)} style={styles.input}>
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
                  <button type="button" style={styles.primaryButton} disabled={savingLotItem || !activeLotId} onClick={handleSaveLotItem}>{savingLotItem ? 'Guardando...' : 'Agregar articulo'}</button>
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
                  <DataRow label="Diferencia" value={`${money(cutDifference)} / ${cashCutStatus(cutDifference)}`} strong />
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

function MiniBar({ item, max }) {
  const width = max > 0 ? Math.max(7, (item.sales / max) * 100) : 7

  return (
    <div style={styles.miniBarRow}>
      <span>{item.label}</span>
      <div style={styles.miniBarTrack}>
        <div style={{ ...styles.miniBarFill, width: `${width}%` }} />
      </div>
      <strong>{item.tickets}</strong>
    </div>
  )
}

function RankRow({ city, max }) {
  const width = max > 0 ? Math.max(7, (city.totalSold / max) * 100) : 7

  return (
    <div style={styles.rankRow}>
      <div style={styles.rankTop}>
        <strong>{city.city}</strong>
        <span>{money(city.totalSold)}</span>
      </div>
      <div style={styles.miniBarTrack}>
        <div style={{ ...styles.miniBarFill, width: `${width}%` }} />
      </div>
      <small>{city.salesCount} ticket(s) / Prom. {money(city.averageTicket)} / Util. {money(city.estimatedProfit)}</small>
    </div>
  )
}

function CategoryRow({ category, max }) {
  const width = max > 0 ? Math.max(7, (category.sales / max) * 100) : 7

  return (
    <div style={styles.rankRow}>
      <div style={styles.rankTop}>
        <strong>{category.name}</strong>
        <span>{money(category.sales)}</span>
      </div>
      <div style={styles.miniBarTrack}>
        <div style={{ ...styles.miniBarFill, width: `${width}%` }} />
      </div>
      <small>{category.quantity} articulo(s) vendidos</small>
    </div>
  )
}

function AuditSaleCard({ sale, onSelect, onCancel }) {
  const cancelled = isCancelledSale(sale)

  return (
    <article style={styles.auditCard}>
      <button type="button" style={styles.auditMain} onClick={() => onSelect?.(sale)}>
        <span style={styles.ticketInfo}>
          <strong>{sale.folio || 'Sin folio'}</strong>
          <small>{sale.city || 'Sin ciudad'} / {sale.payment_method || 'Pago'} / {ticketTimeLabel(sale)}</small>
        </span>
        <span style={styles.ticketRight}>
          <strong>{money(sale.total)}</strong>
          <small>{cancelled ? 'Cancelada' : 'Sincronizada'}</small>
        </span>
      </button>
      {!cancelled && (
        <button type="button" style={styles.auditCancelButton} onClick={() => onCancel?.(sale)}>
          Anular
        </button>
      )}
      {cancelled && <div style={styles.auditReason}>{cancellationReasonOf(sale) || 'Venta anulada'}</div>}
    </article>
  )
}

function AuditInfoCard({ title, meta, value, status }) {
  return (
    <article style={styles.auditCard}>
      <div style={styles.auditMainStatic}>
        <span style={styles.ticketInfo}>
          <strong>{title}</strong>
          <small>{meta || 'Sin detalle'}</small>
        </span>
        <span style={styles.ticketRight}>
          <strong>{value}</strong>
          <small>{status}</small>
        </span>
      </div>
    </article>
  )
}

function TicketRow({ sale, onSelect }) {
  const time = sale.created_at ? new Date(sale.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <button type="button" style={styles.ticketRow} onClick={() => onSelect?.(sale)}>
      <span style={styles.ticketInfo}>
        <strong>{sale.folio || 'Sin folio'}</strong>
        <small>{sale.customer_name || sale.cashier_name || 'Venta'} / {sale.payment_method || 'Pago'}</small>
      </span>
      <span style={styles.ticketRight}>
        <strong>{money(sale.total)}</strong>
        <small>{time}</small>
      </span>
    </button>
  )
}

function TicketDetail({ sale, inventory, isInvestor, onCopy, onResendWhatsApp, onClose, closeLabel = 'Cerrar' }) {
  const detail = buildTicketAnalytics(sale, inventory)
  const items = saleItemsOf(sale)
  const timestamp = sale.created_at ? new Date(sale.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin fecha'
  const cancelled = isCancelledSale(sale)
  const ticketText = buildDashboardTicket(sale)

  return (
    <section style={styles.detailBox}>
      <div style={styles.sectionHead}><h2 style={styles.sectionTitle}>Detalle ticket</h2><button type="button" style={styles.linkButton} onClick={onClose}>{closeLabel}</button></div>
      <DataRow label="Folio" value={sale.folio || 'Sin folio'} />
      <DataRow label="Estado" value={cancelled ? 'Cancelada' : 'Activa'} />
      <DataRow label="Subtotal" value={money(sale.subtotal)} />
      <DataRow label="Descuento" value={`-${money(sale.discount_amount)}`} />
      <DataRow label="Total" value={money(sale.total)} strong />
      <DataRow label="Pago" value={sale.payment_method || 'Sin metodo'} />
      <DataRow label="Ciudad/evento" value={sale.city || 'Sin ciudad'} />
      <DataRow label="Fecha/hora" value={timestamp} />
      <DataRow label="Categorias" value={detail.categories || 'Sin detalle'} />
      <DataRow label="Utilidad est." value={money(detail.estimatedProfit)} strong />
      <DataRow label="Cliente" value={sale.customer_name || 'Sin cliente'} />
      <DataRow label="WhatsApp" value={sale.customer_whatsapp || 'Sin numero'} />
      <DataRow label="Cajera" value={sale.cashier_name || 'Sin cajera'} />
      {sale.ticket_sent_at && <DataRow label="Ticket enviado" value={new Date(sale.ticket_sent_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })} />}
      {cancelled && <DataRow label="Motivo anulacion" value={cancellationReasonOf(sale) || 'Sin motivo'} strong />}
      <div style={styles.itemStack}>
        <div style={styles.sectionHead}>
          <h3 style={styles.auditTitle}>Articulos</h3>
          <span style={styles.chip}>{items.length ? `${saleUnits(sale)} pza(s)` : 'Sin detalle'}</span>
        </div>
        {items.length === 0 ? (
          <div style={styles.empty}>Esta venta no tiene detalle de articulos.</div>
        ) : (
          items.map((item) => <TicketItemCard key={item.id || `${item.category}-${item.code_detected}-${item.quantity}`} item={item} inventory={inventory} />)
        )}
      </div>
      <div style={styles.ticketTextBox}>
        <div style={styles.sectionHead}>
          <h3 style={styles.auditTitle}>Ticket cliente</h3>
          <span style={styles.chip}>WhatsApp</span>
        </div>
        <pre style={styles.ticketText}>{ticketText}</pre>
      </div>
      <div style={styles.exportGrid}>
        <button type="button" style={styles.smallActionButton} onClick={() => onCopy?.(sale)}>Copiar ticket</button>
        {!isInvestor && sale.customer_whatsapp && <button type="button" style={styles.smallActionButton} onClick={() => onResendWhatsApp?.(sale)}>Reenviar WhatsApp</button>}
      </div>
    </section>
  )
}

function TicketItemCard({ item, inventory }) {
  return (
    <article style={styles.itemCard}>
      <div style={styles.rankTop}>
        <strong>{item.category || 'Sin categoria'}</strong>
        <span>{money(itemLineTotal(item))}</span>
      </div>
      <small style={styles.itemMeta}>{[item.material, item.code_detected, item.capture_origin].filter(Boolean).join(' / ') || 'Manual'}</small>
      <div style={styles.threeColumns}>
        <Metric label="Cant." value={Number(item.quantity || 0)} />
        <Metric label="Precio" value={money(item.unit_price ?? item.unitPrice)} />
        <Metric label="Utilidad" value={money(estimateItemProfit(item, inventory))} />
      </div>
    </article>
  )
}

function SuperAdminHierarchy({
  month,
  activeView,
  setActiveView,
  selectedCity,
  setSelectedCity,
  operationsCity,
  setOperationsCity,
  analytics,
  cityAnalytics,
  operationsSales,
  inventory,
  isInvestor,
  selectedTicket,
  onSelectTicket,
  onBackTicket,
  onCopyTicket,
  onResendWhatsApp
}) {
  const currentCityAnalytics = cityAnalytics || analytics
  const cityOperationRows = selectedCity ? operationsSales.filter((sale) => cityEquals(sale.city, selectedCity)) : []

  function openCity(city) {
    onBackTicket()
    setSelectedCity(city)
    setOperationsCity(city)
    setActiveView('city')
  }

  function openOperations(city = '') {
    onBackTicket()
    setOperationsCity(city)
    setActiveView('operations')
  }

  return (
    <section style={styles.cleanSection}>
      <div style={styles.segmented}>
        <ViewButton active={activeView === 'month'} onClick={() => { onBackTicket(); setActiveView('month'); setSelectedCity(''); setOperationsCity('') }}>Mes</ViewButton>
        <ViewButton active={activeView === 'city'} onClick={() => { onBackTicket(); setActiveView('city') }}>Ciudad</ViewButton>
        <ViewButton active={activeView === 'operations'} onClick={() => setActiveView('operations')}>Operaciones</ViewButton>
        <ViewButton active={activeView === 'breakdown'} onClick={() => { onBackTicket(); setActiveView('breakdown') }}>Desglose</ViewButton>
      </div>

      {activeView === 'month' && (
        <>
          <section style={styles.cleanSection}>
            <div style={styles.sectionHead}>
              <h2 style={styles.sectionTitle}>Resumen mensual</h2>
              <span style={styles.chip}>{monthLabel(month)}</span>
            </div>
            <div style={styles.grid}>
              <Metric label="Venta mensual" value={money(analytics.totalSold)} />
              <Metric label="Tickets" value={analytics.salesCount} />
              <Metric label="Ticket promedio" value={money(analytics.averageTicket)} />
              <Metric label="Unidades" value={analytics.unitsSold} />
              <Metric label="Unid/ticket" value={formatDecimal(analytics.averageUnitsPerTicket)} />
              <Metric label="Clientes" value={analytics.customersCaptured} />
              <Metric label="Utilidad bruta" value={money(analytics.grossProfit)} />
              <Metric label="Utilidad neta" value={money(analytics.netProfit)} />
              <Metric label="Gastos" value={money(analytics.totalExpenses)} />
            </div>
            <button type="button" style={styles.primaryButton} onClick={() => openOperations('')}>Ver todas las operaciones</button>
          </section>

          <section style={styles.cleanSection}>
            <div style={styles.sectionHead}>
              <h2 style={styles.sectionTitle}>Ranking ciudades</h2>
              <span style={styles.chip}>{analytics.cityRows.length}</span>
            </div>
            {analytics.cityRows.length === 0 ? (
              <div style={styles.empty}>Sin ciudades en este mes.</div>
            ) : (
              analytics.cityRows.map((city) => <CityDrillRow key={city.city} city={city} max={analytics.topCitySales} onOpen={openCity} />)
            )}
          </section>
        </>
      )}

      {activeView === 'city' && (
        <section style={styles.cleanSection}>
          <div style={styles.sectionHead}>
            <h2 style={styles.sectionTitle}>{selectedCity || 'Selecciona ciudad'}</h2>
            <button type="button" style={styles.linkButton} onClick={() => setActiveView('month')}>Volver al mes</button>
          </div>
          {!selectedCity ? (
            <div style={styles.empty}>Toca una ciudad del ranking para ver su detalle.</div>
          ) : (
            <>
              <div style={styles.grid}>
                <Metric label="Venta ciudad" value={money(currentCityAnalytics.totalSold)} />
                <Metric label="Tickets" value={currentCityAnalytics.salesCount} />
                <Metric label="Ticket promedio" value={money(currentCityAnalytics.averageTicket)} />
                <Metric label="Unidades" value={currentCityAnalytics.unitsSold} />
                <Metric label="Unid/ticket" value={formatDecimal(currentCityAnalytics.averageUnitsPerTicket)} />
                <Metric label="Clientes" value={currentCityAnalytics.customersCaptured} />
              </div>
              <BreakdownGroup title="Metodos de pago" rows={currentCityAnalytics.paymentRows} moneyValues />
              <BreakdownGroup title="Categorias top" rows={currentCityAnalytics.categoryRows.map((row) => ({ name: row.name, value: row.sales, meta: `${row.quantity} pza(s)` }))} moneyValues />
              <div style={styles.itemStack}>
                <div style={styles.sectionHead}>
                  <h3 style={styles.auditTitle}>Operaciones ciudad</h3>
                  <span style={styles.chip}>{cityOperationRows.length}</span>
                </div>
                {cityOperationRows.slice(0, 5).map((sale) => (
                  <OperationRow
                    key={sale.id || sale.folio}
                    sale={sale}
                    onSelect={(ticket) => {
                      setOperationsCity(selectedCity)
                      onSelectTicket(ticket)
                      setActiveView('operations')
                    }}
                  />
                ))}
              </div>
              <button type="button" style={styles.primaryButton} onClick={() => openOperations(selectedCity)}>Ver operaciones de ciudad</button>
            </>
          )}
        </section>
      )}

      {activeView === 'operations' && (
        <section style={styles.cleanSection}>
          <div style={styles.sectionHead}>
            <h2 style={styles.sectionTitle}>Operaciones</h2>
            <button type="button" style={styles.linkButton} onClick={() => setActiveView(operationsCity ? 'city' : 'month')}>Volver</button>
          </div>
          <div style={styles.notice}>{operationsCity ? `Filtro: ${operationsCity}` : `Mes completo: ${monthLabel(month)}`}</div>
          {selectedTicket ? (
            <TicketDetail
              sale={selectedTicket}
              inventory={inventory}
              isInvestor={isInvestor}
              onCopy={onCopyTicket}
              onResendWhatsApp={onResendWhatsApp}
              onClose={onBackTicket}
              closeLabel="Volver a operaciones"
            />
          ) : operationsSales.length === 0 ? (
            <div style={styles.empty}>Sin operaciones en este contexto.</div>
          ) : (
            <div style={styles.operationList}>
              {operationsSales.map((sale) => <OperationRow key={sale.id || sale.folio} sale={sale} onSelect={onSelectTicket} />)}
            </div>
          )}
        </section>
      )}

      {activeView === 'breakdown' && (
        <section style={styles.cleanSection}>
          <div style={styles.sectionHead}>
            <h2 style={styles.sectionTitle}>Desglose general</h2>
            <span style={styles.chip}>{monthLabel(month)}</span>
          </div>
          <BreakdownGroup title="Por metodo de pago" rows={analytics.paymentRows} moneyValues />
          <BreakdownGroup title="Por categoria" rows={analytics.categoryRows.map((row) => ({ name: row.name, value: row.sales, meta: `${row.quantity} pza(s)` }))} moneyValues />
          <BreakdownGroup title="Por ciudad" rows={analytics.cityRows.map((row) => ({ name: row.city, value: row.totalSold, meta: `${row.unitsSold} pza(s)` }))} moneyValues />
          <BreakdownGroup title="Por dia del mes" rows={analytics.dayRows} moneyValues />
          <BreakdownGroup title="Por cajero" rows={analytics.cashierRows} moneyValues />
          <BreakdownGroup title="Por estado de venta" rows={analytics.statusRows} />
        </section>
      )}
    </section>
  )
}

function ViewButton({ active, onClick, children }) {
  return <button type="button" style={{ ...styles.segmentButton, ...(active ? styles.segmentButtonActive : {}) }} onClick={onClick}>{children}</button>
}

function CityDrillRow({ city, max, onOpen }) {
  const width = max > 0 ? Math.max(7, (city.totalSold / max) * 100) : 7

  return (
    <button type="button" style={styles.drillRow} onClick={() => onOpen(city.city)}>
      <div style={styles.rankTop}>
        <strong>{city.city}</strong>
        <span>{money(city.totalSold)}</span>
      </div>
      <div style={styles.miniBarTrack}>
        <div style={{ ...styles.miniBarFill, width: `${width}%` }} />
      </div>
      <small>{city.salesCount} ticket(s) / {city.unitsSold} pza(s) / Prom. {money(city.averageTicket)}</small>
    </button>
  )
}

function OperationRow({ sale, onSelect }) {
  const units = saleUnits(sale)
  const timestamp = sale.created_at ? new Date(sale.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin fecha'

  return (
    <button type="button" style={styles.operationRow} onClick={() => onSelect?.(sale)}>
      <span style={styles.ticketInfo}>
        <strong>{sale.folio || 'Sin folio'} · {sale.city || 'Sin ciudad'}</strong>
        <small>{timestamp} / {sale.payment_method || 'Pago'} / {sale.customer_name || 'Sin cliente'}</small>
        <small>{units ? `${units} pza(s)` : 'sin detalle de articulos'} / {saleStatusLabel(sale)}</small>
      </span>
      <span style={styles.ticketRight}>
        <strong>{money(sale.total)}</strong>
        <small>{isCancelledSale(sale) ? 'Cancelada' : sale.pendingSync ? 'Pendiente' : 'Sincronizada'}</small>
      </span>
    </button>
  )
}

function BreakdownGroup({ title, rows, moneyValues = false }) {
  return (
    <details style={styles.breakdownGroup}>
      <summary style={styles.breakdownSummary}>{title}<span>{rows.length}</span></summary>
      {rows.length === 0 ? (
        <div style={styles.empty}>Sin datos para mostrar.</div>
      ) : (
        <div style={styles.miniBars}>
          {rows.slice(0, 12).map((row) => <DataRow key={row.name} label={row.meta ? `${row.name} / ${row.meta}` : row.name} value={moneyValues ? money(row.value) : row.value} />)}
        </div>
      )}
    </details>
  )
}

function buildCriticalChanges(cancelledSales) {
  return cancelledSales.map((sale) => ({
    id: sale.id || sale.folio,
    title: `Venta anulada ${sale.folio || ''}`,
    meta: cancellationReasonOf(sale) || sale.city || 'Sin motivo',
    value: money(sale.total),
    status: ticketTimeLabel(sale)
  }))
}

function isCancelledSale(sale) {
  const status = String(sale.status || '').trim().toLowerCase()
  return ['cancelled', 'canceled', 'cancelada', 'cancelado', 'anulada', 'anulado', 'void'].includes(status)
}

function cancellationReasonOf(sale) {
  return sale.cancellation_reason || sale.cancel_reason || sale.canceled_reason || sale.audit_notes || ''
}

function filterPendingByDate(sales, date) {
  if (!date) return sales
  return sales.filter((sale) => new Date(sale.created_at).toISOString().slice(0, 10) === date)
}

function filterPendingByPeriod(sales, filters) {
  if (filters.monthly) {
    return sales.filter((sale) => new Date(sale.created_at).toISOString().slice(0, 7) === filters.month)
  }

  return filterPendingByDate(sales, filters.date)
}

function ticketTimeLabel(sale) {
  return sale.created_at ? new Date(sale.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : 'Sin hora'
}

function buildDashboardTicket(sale) {
  const items = saleItemsOf(sale)
  const date = sale.created_at ? new Date(sale.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin fecha'
  const itemLines = items.length
    ? items.map((item) => `${item.quantity} x ${[item.category, item.material, item.code_detected].filter(Boolean).join(' / ')} @ ${money(item.unit_price ?? item.unitPrice)} = ${money(itemLineTotal(item))}`).join('\n')
    : 'Sin detalle de articulos'

  return `JOYERIA CHULADAS MAYOREO

Folio: ${sale.folio || 'Sin folio'}
Ciudad: ${sale.city || 'Sin ciudad'}
Fecha: ${date}
Cajero: ${sale.cashier_name || 'Sin cajera'}

ARTICULOS
${itemLines}

Subtotal: ${money(sale.subtotal)}
Descuento: -${money(sale.discount_amount)}
TOTAL: ${money(sale.total)}
Pago: ${sale.payment_method || 'Sin metodo'}
${sale.customer_name ? `Cliente: ${sale.customer_name}\n` : ''}${sale.customer_whatsapp ? `WhatsApp: ${sale.customer_whatsapp}\n` : ''}
Gracias por tu compra.`
}

function buildDashboardWhatsAppUrl(sale) {
  const digits = String(sale.customer_whatsapp || '').replace(/\D/g, '')
  const phone = digits.length === 10 ? `52${digits}` : digits
  const text = encodeURIComponent(buildDashboardTicket(sale))
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`
}

function downloadCsv(filename, rows) {
  const csv = rowsToCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function rowsToCsv(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))
  ].join('\n')
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function buildSalesCsvRows(sales) {
  return sales.map((sale) => ({
    folio: sale.folio || '',
    city: sale.city || '',
    status: sale.status || 'completed',
    created_at: sale.created_at || '',
    total: sale.total || 0,
    payment_method: sale.payment_method || '',
    customer_name: sale.customer_name || '',
    cashier_name: sale.cashier_name || '',
    categories: [...new Set(saleItemsOf(sale).map((item) => item.category).filter(Boolean))].join(' / '),
    cancellation_reason: cancellationReasonOf(sale)
  }))
}

function buildExpenseCsvRows(expenses) {
  return expenses.map((expense) => ({
    city: expense.city || '',
    category: expense.category || '',
    description: expense.description || '',
    amount: expense.amount || 0,
    payment_method: expense.payment_method || '',
    created_at: expense.created_at || ''
  }))
}

function buildCashCutCsvRows(cuts) {
  return cuts.map((cut) => ({
    city: cut.city || '',
    cashier_name: cut.cashier_name || '',
    total_sales: cut.total_sales || 0,
    expected_cash: cut.expected_cash || 0,
    cash_counted: cut.cash_counted || 0,
    transfer_total: cut.transfer_total || 0,
    card_total: cut.card_total || 0,
    cash_expenses: cut.cash_expenses || 0,
    difference: cut.difference || 0,
    notes: cut.notes || '',
    created_at: cut.created_at || ''
  }))
}

function buildOperationalAnalytics(sales, expenses, inventory) {
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
  const lastHourSalesList = sales.filter((sale) => saleDate(sale) >= oneHourAgo)
  const previousHourSalesList = sales.filter((sale) => {
    const date = saleDate(sale)
    return date >= twoHoursAgo && date < oneHourAgo
  })
  const totalSold = sales.reduce((sum, sale) => sum + saleTotal(sale), 0)
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  const paymentTotals = groupPaymentTotals(sales)
  const categoryRows = buildCategoryRows(sales)
  const categoryTotals = Object.fromEntries(categoryRows.map((category) => [category.name, category.sales]))
  const materialTotals = groupItemTotals(sales, 'material')
  const hourly = buildHourlyStats(sales)
  const cityRanking = buildCityRanking(sales, totalExpenses)
  const customerMetrics = buildCustomerMetrics(sales)
  const estimatedProfit = estimateSalesProfit(sales, inventory) - totalExpenses
  const topCategory = categoryRows[0] ? { name: categoryRows[0].name, value: categoryRows[0].sales, quantity: categoryRows[0].quantity } : null
  const topMaterial = topEntry(materialTotals)
  const dominantPayment = topEntry(paymentTotals)?.name || ''
  const insights = buildInsights({
    sales,
    totalSold,
    topCategory,
    topMaterial,
    dominantPayment,
    paymentTotals,
    cityRanking,
    lastHourSalesList,
    previousHourSalesList
  })

  return {
    lastHourSales: lastHourSalesList.reduce((sum, sale) => sum + saleTotal(sale), 0),
    lastHourTickets: lastHourSalesList.length,
    dominantPayment,
    topCategory,
    categoryRows,
    categoryTotals,
    materialTotals,
    hourly,
    maxHourlySales: hourly.reduce((max, hour) => Math.max(max, hour.sales), 0),
    estimatedProfit,
    insights,
    customerMetrics,
    cityRanking,
    topCitySales: cityRanking.reduce((max, city) => Math.max(max, city.totalSold), 0),
    topCategorySales: categoryRows.reduce((max, category) => Math.max(max, category.sales), 0)
  }
}

function buildMonthlyAnalytics(activeSales, allSales, expenses, inventory) {
  const salesCount = activeSales.length
  const totalSold = activeSales.reduce((sum, sale) => sum + saleTotal(sale), 0)
  const unitsSold = totalUnitsOfSales(activeSales)
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  const grossProfit = estimateSalesProfit(activeSales, inventory)
  const cityRows = buildCityRows(activeSales, expenses, inventory)

  return {
    salesCount,
    totalSold,
    averageTicket: salesCount ? totalSold / salesCount : 0,
    unitsSold,
    averageUnitsPerTicket: salesCount ? unitsSold / salesCount : 0,
    customersCaptured: activeSales.filter((sale) => sale.customer_name || sale.customer_whatsapp).length,
    grossProfit,
    netProfit: grossProfit - totalExpenses,
    totalExpenses,
    cityRows,
    categoryRows: buildCategoryRows(activeSales),
    paymentRows: totalsToRows(groupPaymentTotals(activeSales)),
    dayRows: buildDayRows(activeSales),
    cashierRows: buildCashierRows(activeSales),
    statusRows: buildStatusRows(allSales),
    topCitySales: cityRows.reduce((max, city) => Math.max(max, city.totalSold), 0)
  }
}

function buildCityRows(sales, expenses, inventory) {
  const rows = new Map()

  sales.forEach((sale) => {
    const city = sale.city || 'Sin ciudad'
    const current = rows.get(city) || { city, sales: [], expenses: [] }
    current.sales.push(sale)
    rows.set(city, current)
  })

  expenses.forEach((expense) => {
    const city = expense.city || 'Sin ciudad'
    const current = rows.get(city) || { city, sales: [], expenses: [] }
    current.expenses.push(expense)
    rows.set(city, current)
  })

  return [...rows.values()]
    .map((row) => {
      const totalSold = row.sales.reduce((sum, sale) => sum + saleTotal(sale), 0)
      const salesCount = row.sales.length
      const unitsSold = totalUnitsOfSales(row.sales)
      const cityExpenses = row.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
      const grossProfit = estimateSalesProfit(row.sales, inventory)

      return {
        city: row.city,
        salesCount,
        totalSold,
        averageTicket: salesCount ? totalSold / salesCount : 0,
        unitsSold,
        averageUnitsPerTicket: salesCount ? unitsSold / salesCount : 0,
        grossProfit,
        netProfit: grossProfit - cityExpenses,
        totalExpenses: cityExpenses
      }
    })
    .sort((a, b) => b.totalSold - a.totalSold)
}

function buildDayRows(sales) {
  const rows = new Map()

  sales.forEach((sale) => {
    const date = saleDate(sale)
    if (Number.isNaN(date.getTime())) return
    const key = date.toISOString().slice(0, 10)
    const current = rows.get(key) || { name: date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }), value: 0, meta: '0 ticket(s)' }
    current.value += saleTotal(sale)
    current.tickets = Number(current.tickets || 0) + 1
    current.meta = `${current.tickets} ticket(s)`
    rows.set(key, current)
  })

  return [...rows.values()].sort((a, b) => b.value - a.value)
}

function buildCashierRows(sales) {
  const rows = new Map()

  sales.forEach((sale) => {
    const name = sale.cashier_name || 'Sin cajero'
    const current = rows.get(name) || { name, value: 0, tickets: 0 }
    current.value += saleTotal(sale)
    current.tickets += 1
    current.meta = `${current.tickets} ticket(s)`
    rows.set(name, current)
  })

  return [...rows.values()].sort((a, b) => b.value - a.value)
}

function buildStatusRows(sales) {
  const rows = new Map()

  sales.forEach((sale) => {
    const name = saleStatusLabel(sale)
    const current = rows.get(name) || { name, value: 0 }
    current.value += 1
    rows.set(name, current)
  })

  return [...rows.values()].sort((a, b) => b.value - a.value)
}

function totalsToRows(totals) {
  return Object.entries(totals)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

function buildInsights(context) {
  const insights = []
  const cashTotal = Number(context.paymentTotals.Efectivo || 0)

  if (context.topCategory && context.totalSold > 0) {
    const percent = Math.round((context.topCategory.value / context.totalSold) * 100)
    insights.push(`${context.topCategory.name} son ${percent}% de ventas`)
  }

  if (context.topMaterial && context.topMaterial.value > 0) {
    insights.push(`${context.topMaterial.name} domina hoy`)
  }

  if (context.lastHourSalesList.length && context.previousHourSalesList.length) {
    const currentAverage = averageSaleValue(context.lastHourSalesList)
    const previousAverage = averageSaleValue(context.previousHourSalesList)
    if (currentAverage > previousAverage * 1.1) insights.push('Ticket promedio subiendo')
  }

  if (context.totalSold > 0 && cashTotal / context.totalSold >= 0.55) {
    insights.push('Muchos pagos en efectivo')
  }

  if (context.cityRanking.length > 1) {
    insights.push(`${context.cityRanking[0].city} trae mejor rendimiento`)
  }

  if (!insights.length && context.sales.length > 0) {
    insights.push('Evento activo con datos suficientes para operar')
  }

  return insights.slice(0, 5)
}

function buildHourlyStats(sales) {
  const rows = new Map()

  sales.forEach((sale) => {
    const date = saleDate(sale)
    if (Number.isNaN(date.getTime())) return
    const hour = date.getHours()
    const current = rows.get(hour) || { hour, label: `${String(hour).padStart(2, '0')}:00`, tickets: 0, sales: 0 }
    current.tickets += 1
    current.sales += saleTotal(sale)
    rows.set(hour, current)
  })

  return [...rows.values()].sort((a, b) => a.hour - b.hour)
}

function buildCityRanking(sales, totalExpenses) {
  const rows = new Map()

  sales.forEach((sale) => {
    const city = sale.city || 'Sin ciudad'
    const current = rows.get(city) || { city, salesCount: 0, totalSold: 0, estimatedProfit: 0 }
    current.salesCount += 1
    current.totalSold += saleTotal(sale)
    current.estimatedProfit += estimateSaleProfit(sale)
    rows.set(city, current)
  })

  const cityCount = rows.size || 1
  return [...rows.values()]
    .map((city) => ({
      ...city,
      estimatedProfit: city.estimatedProfit - totalExpenses / cityCount,
      averageTicket: city.salesCount ? city.totalSold / city.salesCount : 0
    }))
    .sort((a, b) => b.totalSold - a.totalSold)
}

function buildCustomerMetrics(sales) {
  const customers = new Map()

  sales.forEach((sale) => {
    const key = customerKey(sale)
    if (!key) return
    const name = sale.customer_name || sale.customer_whatsapp || 'Cliente'
    const current = customers.get(key) || { name, count: 0, total: 0 }
    current.count += 1
    current.total += saleTotal(sale)
    customers.set(key, current)
  })

  const customerRows = [...customers.values()].sort((a, b) => b.total - a.total)
  const captured = customerRows.length
  return {
    captured,
    repeatCustomers: customerRows.filter((customer) => customer.count > 1).length,
    averagePerCustomer: captured ? customerRows.reduce((sum, customer) => sum + customer.total, 0) / captured : 0,
    topCustomer: customerRows[0] || null
  }
}

function groupPaymentTotals(sales) {
  return sales.reduce((acc, sale) => {
    const key = sale.payment_method || sale.paymentMethod || 'Sin metodo'
    acc[key] = (acc[key] || 0) + saleTotal(sale)
    return acc
  }, {})
}

function groupItemTotals(sales, field) {
  const totals = {}

  sales.forEach((sale) => {
    saleItemsOf(sale).forEach((item) => {
      const key = item[field] || 'Sin dato'
      if (key === 'Sin dato') return
      totals[key] = (totals[key] || 0) + itemLineTotal(item)
    })
  })

  return totals
}

function buildCategoryRows(sales) {
  const rows = new Map()

  sales.forEach((sale) => {
    saleItemsOf(sale).forEach((item) => {
      const name = item.category || 'Sin categoria'
      const current = rows.get(name) || { name, quantity: 0, sales: 0 }
      current.quantity += Number(item.quantity || 0)
      current.sales += itemLineTotal(item)
      rows.set(name, current)
    })
  })

  return [...rows.values()].sort((a, b) => b.sales - a.sales)
}

function topEntry(totals) {
  const [name, value] = Object.entries(totals).sort((a, b) => b[1] - a[1])[0] || []
  return name ? { name, value } : null
}

function buildTicketAnalytics(sale, inventory) {
  const items = saleItemsOf(sale)
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].join(', ')
  return {
    categories,
    estimatedProfit: estimateSaleProfit(sale, inventory)
  }
}

function estimateSalesProfit(sales, inventory) {
  return sales.reduce((sum, sale) => sum + estimateSaleProfit(sale, inventory), 0)
}

function estimateSaleProfit(sale, inventory = {}) {
  const items = saleItemsOf(sale)
  const codeCosts = buildCodeCostMap(inventory)

  if (!items.length) {
    const total = saleTotal(sale)
    return total - total / 3
  }

  return items.reduce((sum, item) => {
    const subtotal = itemLineTotal(item)
    const quantity = Number(item.quantity || 0)
    const unitCost = Number(item.unit_cost || codeCosts.get(normalizeCode(item.code_detected)) || 0)
    const fallbackCost = subtotal / 3
    return sum + subtotal - (unitCost > 0 ? unitCost * quantity : fallbackCost)
  }, 0)
}

function buildCodeCostMap(inventory = {}) {
  const map = new Map()

  ;(inventory.productCodes || []).forEach((code) => {
    if (code.code && Number(code.unit_cost || 0) > 0) map.set(normalizeCode(code.code), Number(code.unit_cost))
  })

  ;(inventory.lotItems || []).forEach((item) => {
    if (item.code && Number(item.unit_cost || 0) > 0) map.set(normalizeCode(item.code), Number(item.unit_cost))
  })

  return map
}

function saleItemsOf(sale) {
  return sale.items || sale.sale_items || []
}

function saleUnits(sale) {
  return saleItemsOf(sale).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
}

function totalUnitsOfSales(sales) {
  return sales.reduce((sum, sale) => sum + saleUnits(sale), 0)
}

function saleTotal(sale) {
  return Number(sale.total || 0)
}

function itemLineTotal(item) {
  const quantity = Number(item.quantity || 0)
  const unitPrice = Number(item.unit_price ?? item.unitPrice ?? 0)
  return Number(item.subtotal ?? item.line_total ?? quantity * unitPrice)
}

function estimateItemProfit(item, inventory = {}) {
  const subtotal = itemLineTotal(item)
  const quantity = Number(item.quantity || 0)
  const codeCosts = buildCodeCostMap(inventory)
  const unitCost = Number(item.unit_cost || codeCosts.get(normalizeCode(item.code_detected)) || 0)
  return subtotal - (unitCost > 0 ? unitCost * quantity : subtotal / 3)
}

function saleDate(sale) {
  return new Date(sale.created_at || Date.now())
}

function averageSaleValue(sales) {
  return sales.length ? sales.reduce((sum, sale) => sum + saleTotal(sale), 0) / sales.length : 0
}

function customerKey(sale) {
  const whatsapp = String(sale.customer_whatsapp || '').replace(/\D/g, '')
  if (whatsapp) return `wa:${whatsapp}`
  const name = String(sale.customer_name || '').trim().toLowerCase()
  return name ? `name:${name}` : ''
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
  const estimatedCost = totalSold / 3
  const grossProfit = totalSold - estimatedCost
  const netProfit = grossProfit - totalExpenses

  return { salesCount, totalSold, averageTicket, byPayment, totalExpenses, cashExpenses, cashSales, estimatedCost, grossProfit, netProfit, estimatedProfit: netProfit, expectedCash, transferTotal, cardTotal, mixedTotal, latestDifference, customersCaptured }
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
    const unitPrice = Number(saleItem.unit_price || 0)
    const subtotal = Number(saleItem.subtotal || quantity * unitPrice)
    const suggestedPrice = Number(relatedItem?.suggested_price || codeRow?.suggested_price || unitPrice || 0)
    const unitCost = Number(relatedItem?.unit_cost || codeRow?.unit_cost || saleItem.unit_cost || 0) || (unitPrice || subtotal / Math.max(quantity, 1)) / 3
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

function cashCutStatus(value) {
  if (Number(value) > 0) return 'Sobrante'
  if (Number(value) < 0) return 'Faltante'
  return 'Exacto'
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function monthInputValue() {
  return new Date().toISOString().slice(0, 7)
}

function monthLabel(month) {
  const now = new Date()
  const [year, monthNumber] = String(month || monthInputValue()).split('-').map(Number)
  const date = new Date(year || now.getFullYear(), (monthNumber || now.getMonth() + 1) - 1, 1)
  return date.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
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

function cityEquals(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
}

function saleStatusLabel(sale) {
  if (isCancelledSale(sale)) return 'Cancelada'
  if (sale.pendingSync) return 'Pendiente'
  return 'Sincronizada'
}

function formatDecimal(value) {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(Number(value) || 0)
}

const styles = {
  page: { minHeight: '100dvh', background: '#f4f4f4', color: '#111111', fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: 'calc(18px + env(safe-area-inset-top)) 18px calc(26px + env(safe-area-inset-bottom))', boxSizing: 'border-box', overflowX: 'hidden', overflowY: 'visible', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' },
  shell: { width: '100%', maxWidth: 430, minWidth: 0, margin: '0 auto', boxSizing: 'border-box' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, background: '#ffffff', border: '1px solid rgba(17, 17, 17, 0.84)', borderRadius: 999, padding: '8px 8px 8px 16px', boxShadow: '0 10px 24px rgba(17, 17, 17, 0.06)' },
  headerTitle: { fontSize: 16, fontWeight: 700, lineHeight: 1.15 },
  headerMeta: { color: '#555555', fontSize: 14, fontWeight: 500, marginTop: 2 },
  blackPill: { minWidth: 74, height: 48, border: 'none', borderRadius: 999, background: '#111111', color: '#ffffff', fontSize: 15, fontWeight: 700, transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease' },
  panel: { background: '#ffffff', border: '1px solid rgba(17, 17, 17, 0.8)', borderRadius: 28, padding: 16, boxShadow: '0 14px 30px rgba(17, 17, 17, 0.06)', boxSizing: 'border-box', maxWidth: '100%', minWidth: 0, overflow: 'hidden' },
  stack: { display: 'grid', gap: 15, minWidth: 0 },
  heroBlock: { display: 'grid', gap: 4 },
  kicker: { margin: 0, color: '#666666', fontSize: 13, fontWeight: 700, textTransform: 'uppercase' },
  title: { margin: 0, color: '#111111', fontSize: 40, lineHeight: 1, fontWeight: 700, letterSpacing: 0 },
  copy: { margin: 0, color: '#555555', fontSize: 15 },
  cleanSection: { display: 'grid', gap: 11, padding: '2px 0 4px' },
  segmented: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 7, border: '1px solid #e4e4e4', borderRadius: 18, background: '#f7f7f7', padding: 5, minWidth: 0, boxSizing: 'border-box' },
  segmentButton: { minWidth: 0, minHeight: 42, border: 'none', borderRadius: 14, background: 'transparent', color: '#333333', fontSize: 12, fontWeight: 760, padding: '0 6px', boxSizing: 'border-box' },
  segmentButtonActive: { background: '#111111', color: '#ffffff', boxShadow: '0 8px 14px rgba(17, 17, 17, 0.12)' },
  sectionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { margin: 0, fontSize: 18, fontWeight: 720 },
  auditTitle: { margin: 0, fontSize: 15, fontWeight: 760 },
  chip: { border: '1px solid #d7d7d7', borderRadius: 999, padding: '6px 10px', background: '#f7f7f7', color: '#555555', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10, minWidth: 0 },
  metricCard: { border: '1px solid #e6e6e6', borderRadius: 18, background: '#fbfbfb', padding: 13, display: 'grid', gap: 5, boxShadow: '0 7px 16px rgba(17, 17, 17, 0.035)', minWidth: 0, overflow: 'hidden' },
  exportGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, minWidth: 0 },
  smallActionButton: { width: '100%', minHeight: 44, border: '1px solid #111111', borderRadius: 16, background: '#ffffff', color: '#111111', fontSize: 13, fontWeight: 740, boxSizing: 'border-box' },
  auditGroup: { display: 'grid', gap: 8, minWidth: 0, maxWidth: '100%' },
  auditCard: { border: '1px solid #e6e6e6', borderRadius: 18, background: '#fbfbfb', padding: 11, display: 'grid', gap: 8, minWidth: 0, boxSizing: 'border-box' },
  auditMain: { width: '100%', border: 'none', background: 'transparent', padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, auto)', gap: 10, minWidth: 0, textAlign: 'left' },
  auditMainStatic: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, auto)', gap: 10, minWidth: 0 },
  auditCancelButton: { width: '100%', minHeight: 42, border: '1px solid #b91c1c', borderRadius: 16, background: '#fff5f5', color: '#b91c1c', fontSize: 13, fontWeight: 760 },
  auditReason: { border: '1px solid #fed7aa', borderRadius: 15, background: '#fff7ed', color: '#9a3412', padding: 9, fontSize: 13, fontWeight: 650, overflowWrap: 'anywhere' },
  cancelBox: { border: '1px solid #b91c1c', borderRadius: 20, background: '#fffafa', padding: 13, display: 'grid', gap: 10, minWidth: 0, boxSizing: 'border-box' },
  insightStack: { display: 'grid', gap: 8, minWidth: 0, maxWidth: '100%' },
  insightPill: { border: '1px solid #0EA371', borderRadius: 18, background: '#DFF8EC', color: '#064E3B', padding: '11px 12px', fontSize: 14, fontWeight: 720, lineHeight: 1.25, boxSizing: 'border-box', maxWidth: '100%', overflowWrap: 'anywhere' },
  miniBars: { display: 'grid', gap: 9, minWidth: 0, maxWidth: '100%' },
  miniBarRow: { display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) 28px', alignItems: 'center', gap: 8, color: '#333333', fontSize: 13, fontWeight: 700, minWidth: 0 },
  miniBarTrack: { width: '100%', height: 10, borderRadius: 999, background: '#eeeeee', overflow: 'hidden', minWidth: 0 },
  miniBarFill: { height: '100%', borderRadius: 999, background: '#10B981' },
  rankRow: { border: '1px solid #e6e6e6', borderRadius: 18, background: '#fbfbfb', padding: 12, display: 'grid', gap: 8, minWidth: 0, boxSizing: 'border-box' },
  drillRow: { width: '100%', border: '1px solid #e6e6e6', borderRadius: 18, background: '#fbfbfb', padding: 12, display: 'grid', gap: 8, minWidth: 0, boxSizing: 'border-box', textAlign: 'left' },
  rankTop: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, auto)', gap: 10, alignItems: 'center', minWidth: 0, overflowWrap: 'anywhere' },
  dataRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10, padding: '11px 0', borderTop: '1px solid #eeeeee', fontSize: 15, color: '#333333', minWidth: 0, overflowWrap: 'anywhere' },
  operationList: { display: 'grid', gap: 8, minWidth: 0, maxWidth: '100%' },
  operationRow: { width: '100%', maxWidth: '100%', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, auto)', gap: 12, padding: 12, border: '1px solid #e6e6e6', borderRadius: 18, background: '#fbfbfb', fontSize: 14, minWidth: 0, textAlign: 'left', boxSizing: 'border-box' },
  ticketRow: { width: '100%', maxWidth: '100%', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, auto)', gap: 12, padding: '12px 0', border: 'none', borderTop: '1px solid #eeeeee', background: 'transparent', fontSize: 14, minWidth: 0, textAlign: 'left', boxSizing: 'border-box' },
  ticketInfo: { display: 'grid', gap: 3, minWidth: 0, overflow: 'hidden' },
  ticketRight: { display: 'grid', justifyItems: 'end', gap: 3, minWidth: 0, overflowWrap: 'anywhere', textAlign: 'right' },
  detailBox: { border: '1px solid #111111', borderRadius: 20, padding: 14, display: 'grid', gap: 4, minWidth: 0, boxSizing: 'border-box' },
  itemStack: { display: 'grid', gap: 8, minWidth: 0, maxWidth: '100%', paddingTop: 8 },
  itemCard: { border: '1px solid #e6e6e6', borderRadius: 18, background: '#fbfbfb', padding: 12, display: 'grid', gap: 8, minWidth: 0, boxSizing: 'border-box' },
  itemMeta: { color: '#555555', fontSize: 13, fontWeight: 650, overflowWrap: 'anywhere' },
  ticketTextBox: { border: '1px solid #e6e6e6', borderRadius: 18, background: '#fbfbfb', padding: 12, display: 'grid', gap: 8, minWidth: 0, boxSizing: 'border-box', marginTop: 8 },
  ticketText: { margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#111111', fontSize: 12, lineHeight: 1.45, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" },
  breakdownGroup: { border: '1px solid #e6e6e6', borderRadius: 18, background: '#fbfbfb', padding: 12, display: 'grid', gap: 8, minWidth: 0, boxSizing: 'border-box' },
  breakdownSummary: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', color: '#111111', fontSize: 15, fontWeight: 760, cursor: 'pointer', minWidth: 0 },
  linkButton: { border: 'none', background: 'transparent', color: '#0EA371', fontSize: 14, fontWeight: 760 },
  notice: { border: '1px solid #0EA371', borderRadius: 18, background: '#DFF8EC', color: '#064E3B', padding: 12, fontSize: 14, fontWeight: 700, textAlign: 'center' },
  error: { border: '1px solid #fecaca', borderRadius: 18, background: '#fff5f5', color: '#991b1b', padding: 12, fontSize: 14, fontWeight: 700, textAlign: 'center' },
  empty: { border: '1px dashed #a3a3a3', borderRadius: 18, background: '#f7f7f7', color: '#555555', padding: 18, textAlign: 'center', fontSize: 15, fontWeight: 560 },
  labelBlock: { display: 'grid', gap: 7, color: '#333333', fontSize: 14, fontWeight: 700 },
  input: { width: '100%', maxWidth: '100%', minWidth: 0, minHeight: 54, border: '1px solid rgba(17, 17, 17, 0.86)', borderRadius: 18, background: '#ffffff', color: '#111111', fontSize: 16, fontWeight: 540, padding: '0 13px', boxSizing: 'border-box', transition: 'border-color 140ms ease, box-shadow 140ms ease' },
  textarea: { width: '100%', maxWidth: '100%', minWidth: 0, minHeight: 84, border: '1px solid rgba(17, 17, 17, 0.86)', borderRadius: 18, background: '#ffffff', color: '#111111', fontSize: 16, fontWeight: 540, padding: 13, boxSizing: 'border-box', resize: 'vertical' },
  twoColumns: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 9, minWidth: 0 },
  threeColumns: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 8, minWidth: 0 },
  primaryButton: { width: '100%', maxWidth: '100%', boxSizing: 'border-box', minHeight: 58, border: '1px solid #0EA371', borderRadius: 20, background: '#10B981', color: '#ffffff', fontSize: 16, fontWeight: 720, boxShadow: '0 12px 22px rgba(16, 185, 129, 0.18)', transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease' },
  dangerButton: { width: '100%', maxWidth: '100%', boxSizing: 'border-box', minHeight: 56, border: '1px solid #b91c1c', borderRadius: 20, background: '#b91c1c', color: '#ffffff', fontSize: 16, fontWeight: 720, transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease' },
  secondaryButton: { width: '100%', maxWidth: '100%', boxSizing: 'border-box', minHeight: 56, border: '1px solid #111111', borderRadius: 20, background: '#ffffff', color: '#111111', fontSize: 16, fontWeight: 720, transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease' }
}

export default AdminDashboard
