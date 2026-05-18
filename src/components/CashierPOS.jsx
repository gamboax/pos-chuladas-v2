import { useEffect, useMemo, useState } from 'react'
import { createFolio } from '../lib/folio'
import { fetchTodayAdminData, getPendingLocalSales, retryPendingLocalSales, saveSale } from '../lib/sales'
import { buildTicket, money } from '../lib/ticket'
import { buildWhatsAppUrl } from '../lib/whatsapp'
import CaptureCalculator from './pos/CaptureCalculator'
import CheckoutPanel from './pos/CheckoutPanel'
import HeaderBar from './pos/HeaderBar'
import ProductGrid from './pos/ProductGrid'
import SaleEditor from './pos/SaleEditor'
import SaleSummaryCard from './pos/SaleSummaryCard'
import SavedTicketView from './pos/SavedTicketView'
import ScannerPanel from './pos/ScannerPanel'
import { Kicker, Muted, Page, Panel, PrimaryButton, Stack, TextInput, Title } from './pos/ui'

const CATEGORIES = [
  'Anillo',
  'Pulsera',
  'Tobillera',
  'Collar',
  'Cadena',
  'Dije',
  'Rosario',
  'Juego',
  'Arete',
  'Caja'
]

const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Mixto']
const CUSTOMER_TYPES = ['Revender', 'Uso propio']
const DRAFT_KEY = 'pos_chuladas_sale_draft_v2'

const SCANNER_EXAMPLES = [
  {
    id: 'scan-a2',
    code_detected: 'A2',
    category: 'Anillo',
    material: 'Oro laminado',
    quantity: 2,
    unitPrice: 35,
    subtotal: 70
  },
  {
    id: 'scan-e1',
    code_detected: 'E1',
    category: 'Arete',
    material: 'Acero inoxidable',
    quantity: 1,
    unitPrice: 30,
    subtotal: 30
  }
]

function CashierPOS({ user, onLogout, onOpenAdmin }) {
  const draft = useMemo(() => readDraft(), [])
  const [screen, setScreen] = useState(draft.activeCity ? 'cashier' : 'city')
  const [cityInput, setCityInput] = useState(draft.activeCity || '')
  const [activeCity, setActiveCity] = useState(draft.activeCity || '')
  const [folio, setFolio] = useState(draft.folio || '')
  const [menuOpen, setMenuOpen] = useState(false)
  const [cart, setCart] = useState(draft.cart || [])
  const [feedback, setFeedback] = useState('')

  const [captureCategory, setCaptureCategory] = useState('')
  const [captureStep, setCaptureStep] = useState('quantity')
  const [quantityInput, setQuantityInput] = useState('')
  const [priceInput, setPriceInput] = useState('')

  const [scannedItems, setScannedItems] = useState(getScannerExamples)

  const [discountMode, setDiscountMode] = useState(draft.discountMode || '0')
  const [customDiscount, setCustomDiscount] = useState(draft.customDiscount || '')
  const [paymentMethod, setPaymentMethod] = useState(draft.paymentMethod || 'Efectivo')
  const [customerName, setCustomerName] = useState(draft.customerName || '')
  const [customerPhone, setCustomerPhone] = useState(draft.customerPhone || '')
  const [customerType, setCustomerType] = useState(draft.customerType || '')
  const [lastSale, setLastSale] = useState(null)
  const [isSavingSale, setIsSavingSale] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [summaryData, setSummaryData] = useState({ storage: 'supabase', sales: [] })
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [selectedSummaryTicket, setSelectedSummaryTicket] = useState(null)
  const [pendingSales, setPendingSales] = useState([])
  const [pendingSyncMessage, setPendingSyncMessage] = useState('')
  const [isSyncingPending, setIsSyncingPending] = useState(false)

  const cashierName = user?.name || 'Cajera'
  const cashierId = user?.id || user?.user_id || null
  const canSeeAdmin = ['manager', 'admin_operativo', 'admin', 'super_admin'].includes(user?.role)
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), [cart])
  const discountPercent = discountMode === 'custom' ? Number(customDiscount) || 0 : Number(discountMode)
  const safeDiscountPercent = Math.max(0, Math.min(100, discountPercent))
  const discountAmount = subtotal * (safeDiscountPercent / 100)
  const total = Math.max(0, subtotal - discountAmount)
  const menuItems = buildMenuItems({ setScreen, changeCity, openPendingSales, onLogout, canSeeAdmin, onOpenAdmin, setMenuOpen })
  const ticketText = lastSale ? buildTicket(lastSale) : ''

  useEffect(() => {
    if (!activeCity || !folio || screen === 'saved') return

    writeDraft({
      activeCity,
      folio,
      cart,
      discountMode,
      customDiscount,
      paymentMethod,
      customerName,
      customerPhone,
      customerType
    })
  }, [screen, activeCity, folio, cart, discountMode, customDiscount, paymentMethod, customerName, customerPhone, customerType])

  useEffect(() => {
    if (screen !== 'summary' || !activeCity) return

    let alive = true
    const timeout = window.setTimeout(() => {
      setSummaryLoading(true)
      setSummaryError('')

      fetchTodayAdminData({ city: activeCity })
        .then((result) => {
          if (!alive) return
          setSummaryData({ storage: result.storage, reason: result.reason, sales: result.sales || [] })
        })
        .catch((error) => {
          if (alive) setSummaryError(error.message || 'No se pudo cargar el resumen del dia.')
        })
        .finally(() => {
          if (alive) setSummaryLoading(false)
        })
    }, 0)

    return () => {
      alive = false
      window.clearTimeout(timeout)
    }
  }, [screen, activeCity])

  useEffect(() => {
    if (!feedback) return

    const timeout = window.setTimeout(() => setFeedback(''), 1200)
    return () => window.clearTimeout(timeout)
  }, [feedback])

  function startCity() {
    const nextCity = cityInput.trim()

    if (!nextCity) return

    setActiveCity(nextCity)
    setFolio(createFolio(nextCity))
    resetSale({ keepCity: true })
    setScreen('cashier')
  }

  function changeCity() {
    setMenuOpen(false)

    if (cart.length) {
      setScreen('confirmCityChange')
      return
    }

    performCityChange()
  }

  function performCityChange() {
    setCityInput(activeCity)
    setMenuOpen(false)
    clearDraft()
    resetSale({ keepCity: false })
    setSelectedSummaryTicket(null)
    setScreen('city')
  }

  function resetSale({ keepCity = true } = {}) {
    setCart([])
    setDiscountMode('0')
    setCustomDiscount('')
    setPaymentMethod('Efectivo')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerType('')
    setSaveError('')
    setScannedItems(getScannerExamples())

    if (!keepCity) {
      setActiveCity('')
      setFolio('')
    }
  }

  function startNewSale() {
    resetSale()
    clearDraft()
    setFolio(createFolio(activeCity))
    setScreen('cashier')
    setMenuOpen(false)
  }

  function openCapture(category) {
    setCaptureCategory(category)
    setCaptureStep('quantity')
    setQuantityInput('')
    setPriceInput('')
    setScreen('capture')
  }

  function pressKey(key) {
    const setter = captureStep === 'quantity' ? setQuantityInput : setPriceInput
    const current = captureStep === 'quantity' ? quantityInput : priceInput

    if (captureStep === 'quantity' && key === '.') return
    if (key === '.' && current.includes('.')) return

    setter(normalizeNumberInput(`${current}${key}`))
  }

  function deleteKey() {
    if (captureStep === 'quantity') {
      setQuantityInput((current) => current.slice(0, -1))
      return
    }

    setPriceInput((current) => current.slice(0, -1))
  }

  function nextCaptureStep() {
    if (captureStep === 'quantity') {
      if (Number(quantityInput) <= 0) return
      setCaptureStep('price')
      return
    }

    addManualItem()
  }

  function addManualItem() {
    const quantity = Number(quantityInput)
    const unitPrice = Number(priceInput)

    if (!captureCategory || quantity <= 0 || unitPrice <= 0) return

    const item = {
      id: createId('manual'),
      capture_origin: 'manual',
      category: captureCategory,
      quantity,
      unitPrice,
      material: '',
      code_detected: null,
      subtotal: quantity * unitPrice
    }

    setCart((current) => [...current, item])
    setFeedback(`${captureCategory} agregado`)
    setScreen('cashier')
    setCaptureCategory('')
    setQuantityInput('')
    setPriceInput('')
    setCaptureStep('quantity')
  }

  function openScanner() {
    setScannedItems((current) => (current.length ? current : getScannerExamples()))
    setScreen('scanner')
  }

  function updateScannedItem(id, field, value) {
    setScannedItems((current) => current.map((item) => (item.id === id ? normalizeItemValue(item, field, value) : item)))
  }

  function removeScannedItem(id) {
    setScannedItems((current) => current.filter((item) => item.id !== id))
  }

  function confirmScannedItems() {
    const itemsToAdd = scannedItems
      .filter((item) => item.quantity > 0 && item.unitPrice > 0)
      .map((item) => ({
        id: createId('scanner'),
        capture_origin: 'scanner',
        category: item.category,
        material: item.material,
        code_detected: item.code_detected,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.quantity) * Number(item.unitPrice)
      }))

    if (!itemsToAdd.length) return

    setCart((current) => [...current, ...itemsToAdd])
    setFeedback(`${itemsToAdd.length} articulo(s) agregados`)
    setScannedItems(getScannerExamples())
    setScreen('cashier')
  }

  function updateCartItem(id, field, value) {
    setCart((current) => current.map((item) => (item.id === id ? normalizeItemValue(item, field, value) : item)))
  }

  function removeCartItem(id) {
    setCart((current) => current.filter((item) => item.id !== id))
  }

  async function finishSale() {
    if (!cart.length || isSavingSale) return

    setIsSavingSale(true)
    setSaveError('')

    const savedAt = new Date()
    const saleToSave = {
      folio,
      city: activeCity,
      cashierId,
      cashierName,
      items: cart,
      subtotal,
      discountPercent: safeDiscountPercent,
      discountAmount,
      total,
      paymentMethod,
      customerName: customerName.trim(),
      customerWhatsapp: customerPhone.trim(),
      customerType
    }

    try {
      const savedSale = await saveSale(saleToSave)
      const createdAt = savedSale.created_at ? new Date(savedSale.created_at) : savedAt
      const ticketSale = {
        ...saleToSave,
        id: savedSale.id,
        storage: savedSale.storage || 'supabase',
        storageLabel: savedSale.storageLabel || 'Guardada en Supabase',
        storageReason: savedSale.storageReason || '',
        cashier: cashierName,
        customerPhone: saleToSave.customerWhatsapp,
        date: createdAt.toLocaleDateString('es-MX'),
        time: createdAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
      }

      setLastSale(ticketSale)
      clearDraft()
      resetSale()
      setScreen('saved')
    } catch (error) {
      setSaveError(error.message || 'No se pudo guardar la venta. Intenta de nuevo.')
    } finally {
      setIsSavingSale(false)
    }
  }

  function openPendingSales() {
    setPendingSales(getPendingLocalSales({ city: activeCity }))
    setPendingSyncMessage('')
    setMenuOpen(false)
    setScreen('pending')
  }

  async function retryPendingSales() {
    if (isSyncingPending) return

    setIsSyncingPending(true)
    setPendingSyncMessage('Sincronizando ventas pendientes...')

    try {
      const result = await retryPendingLocalSales({ city: activeCity })
      setPendingSales(getPendingLocalSales({ city: activeCity }))
      setPendingSyncMessage(result.failed.length ? `${result.synced.length} sincronizada(s), ${result.failed.length} pendiente(s).` : 'Pendientes sincronizadas.')
    } catch (error) {
      setPendingSyncMessage(error.message || 'No se pudieron sincronizar las ventas pendientes.')
    } finally {
      setIsSyncingPending(false)
    }
  }

  function sendWhatsApp() {
    if (!lastSale) return
    window.open(buildWhatsAppUrl(lastSale, ticketText), '_blank', 'noopener,noreferrer')
  }

  if (screen === 'city') {
    return (
      <Page centered>
        <Panel style={styles.cityPanel}>
          <Stack style={styles.cityStack}>
            <div style={styles.cityIntro}>
              <Kicker>POS Chuladas V2</Kicker>
              <Title>Ciudad del evento</Title>
              <Muted>Define la ciudad antes de empezar a cobrar.</Muted>
            </div>

            <TextInput
              autoFocus
              value={cityInput}
              onChange={(event) => setCityInput(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && startCity()}
              placeholder="Ej. Matehuala"
              style={styles.cityInput}
            />

            <PrimaryButton tone="success" disabled={!cityInput.trim()} onClick={startCity}>
              Empezar venta
            </PrimaryButton>
          </Stack>
        </Panel>
      </Page>
    )
  }

  return (
    <Page>
      {screen === 'capture' && (
        <CaptureCalculator
          cashierName={cashierName}
          city={activeCity}
          menuOpen={menuOpen}
          menuItems={menuItems}
          onToggleMenu={() => setMenuOpen((open) => !open)}
          category={captureCategory}
          step={captureStep}
          quantityInput={quantityInput}
          priceInput={priceInput}
          onSelectStep={setCaptureStep}
          onPressKey={pressKey}
          onDeleteKey={deleteKey}
          onCancel={() => setScreen('cashier')}
          onNext={nextCaptureStep}
        />
      )}

      {screen === 'scanner' && (
        <ScannerPanel
          items={scannedItems}
          onBack={() => setScreen('cashier')}
          onChange={updateScannedItem}
          onRemove={removeScannedItem}
          onConfirm={confirmScannedItems}
        />
      )}

      {screen === 'sale' && (
        <SaleEditor
          city={activeCity}
          folio={folio}
          cart={cart}
          subtotal={subtotal}
          onBack={() => setScreen('cashier')}
          onChange={updateCartItem}
          onRemove={removeCartItem}
          onClear={() => resetSale()}
          onCheckout={() => setScreen('checkout')}
        />
      )}

      {screen === 'confirmCityChange' && (
        <ConfirmCityChangeView
          city={activeCity}
          cartCount={cart.length}
          onCancel={() => setScreen('cashier')}
          onConfirm={performCityChange}
        />
      )}

      {screen === 'pending' && (
        <PendingSalesView
          city={activeCity}
          sales={pendingSales}
          message={pendingSyncMessage}
          syncing={isSyncingPending}
          onBack={() => setScreen('cashier')}
          onRetry={retryPendingSales}
        />
      )}
      {screen === 'summary' && (
        <CashierDaySummaryView
          cashierName={cashierName}
          city={activeCity}
          data={summaryData}
          loading={summaryLoading}
          error={summaryError}
          selectedTicket={selectedSummaryTicket}
          onSelectTicket={setSelectedSummaryTicket}
          onBack={() => setScreen('cashier')}
        />
      )}

      {screen === 'checkout' && (
        <CheckoutPanel
          folio={folio}
          cartLength={cart.length}
          subtotal={subtotal}
          safeDiscountPercent={safeDiscountPercent}
          discountAmount={discountAmount}
          total={total}
          discountMode={discountMode}
          customDiscount={customDiscount}
          paymentMethod={paymentMethod}
          customerName={customerName}
          customerPhone={customerPhone}
          customerType={customerType}
          paymentMethods={PAYMENT_METHODS}
          customerTypes={CUSTOMER_TYPES}
          saveError={saveError}
          isSavingSale={isSavingSale}
          onBack={() => setScreen('sale')}
          onDiscountMode={setDiscountMode}
          onCustomDiscount={setCustomDiscount}
          onPaymentMethod={setPaymentMethod}
          onCustomerName={setCustomerName}
          onCustomerPhone={setCustomerPhone}
          onCustomerType={setCustomerType}
          onClear={() => resetSale()}
          onSave={finishSale}
        />
      )}

      {screen === 'saved' && lastSale && (
        <SavedTicketView
          sale={lastSale}
          ticketText={ticketText}
          onSendWhatsApp={sendWhatsApp}
          onNewSale={startNewSale}
          onBack={() => setScreen('cashier')}
        />
      )}

      {screen === 'cashier' && (
        <>
          <HeaderBar
            title={`Cobrando: ${cashierName}`}
            subtitle={`${activeCity} / ${folio}`}
            menuOpen={menuOpen}
            onToggleMenu={() => setMenuOpen((open) => !open)}
            menuItems={menuItems}
          />

          <Panel style={styles.cashierPanel}>
            <div style={styles.mainStack}>
              <SaleSummaryCard city={activeCity} folio={folio} total={total} count={cart.length} />
              {feedback && <div style={styles.feedback}>{feedback}</div>}
              <ProductGrid categories={CATEGORIES} onSelect={openCapture} />

              <button type="button" style={styles.scannerButton} onClick={openScanner}>
                Escanear articulos
              </button>

              <div style={styles.bottomActions}>
                <button type="button" style={styles.bottomButton} onClick={() => resetSale()}>
                  Borrar
                </button>
                <button
                  type="button"
                  disabled={!cart.length}
                  style={{ ...styles.bottomButton, opacity: cart.length ? 1 : 0.45 }}
                  onClick={() => setScreen('sale')}
                >
                  Ver venta
                </button>
                <button
                  type="button"
                  disabled={!cart.length}
                  style={{ ...styles.totalButton, opacity: cart.length ? 1 : 0.45 }}
                  onClick={() => setScreen('checkout')}
                >
                  Totalizar
                </button>
              </div>
            </div>
          </Panel>
        </>
      )}
    </Page>
  )
}

function ConfirmCityChangeView({ city, cartCount, onCancel, onConfirm }) {
  return (
    <>
      <HeaderBar title="Cambiar ciudad" subtitle={city} actionLabel="Caja" onAction={onCancel} />
      <Panel style={styles.warningPanel}>
        <div style={styles.summaryStack}>
          <Kicker>Venta en progreso</Kicker>
          <Title>Se limpiara la venta actual.</Title>
          <Muted>Tienes {cartCount} articulo(s). Al cambiar ciudad se inicia una venta nueva para no mezclar eventos.</Muted>
          <div style={styles.bottomActions}>
            <button type="button" style={styles.bottomButton} onClick={onCancel}>Cancelar</button>
            <button type="button" style={styles.totalButton} onClick={onConfirm}>Cambiar</button>
          </div>
        </div>
      </Panel>
    </>
  )
}

function PendingSalesView({ city, sales, message, syncing, onBack, onRetry }) {
  return (
    <>
      <HeaderBar title="Pendientes" subtitle={city} actionLabel="Caja" onAction={onBack} />
      <Panel style={styles.summaryPanel}>
        <div style={styles.summaryStack}>
          <div style={styles.summaryHero}>
            <Kicker>Sincronizacion</Kicker>
            <div style={styles.summaryCity}>Ventas pendientes</div>
            <Muted>{sales.length} venta(s) guardada(s) localmente.</Muted>
          </div>
          {message && <div style={styles.summaryNotice}>{message}</div>}
          {sales.length === 0 ? (
            <div style={styles.summaryEmpty}>No hay ventas pendientes en esta ciudad.</div>
          ) : (
            sales.map((sale) => (
              <div key={sale.id || sale.folio} style={styles.pendingCard}>
                <strong>{sale.folio}</strong>
                <span>{money(sale.total)} / {sale.paymentMethod || sale.payment_method || 'Pago'}</span>
                <small>Pendiente de sincronizar</small>
              </div>
            ))
          )}
          <button type="button" disabled={!sales.length || syncing} style={{ ...styles.totalButton, opacity: sales.length && !syncing ? 1 : 0.45 }} onClick={onRetry}>
            {syncing ? 'Sincronizando...' : 'Reintentar sincronizar'}
          </button>
        </div>
      </Panel>
    </>
  )
}
function CashierDaySummaryView({ cashierName, city, data, loading, error, selectedTicket, onSelectTicket, onBack }) {
  const metrics = useMemo(() => buildCashierMetrics(data.sales || []), [data.sales])
  const visibleTickets = (data.sales || []).slice(0, 8)

  return (
    <>
      <HeaderBar title="Resumen del dia" subtitle={`${cashierName} / ${city}`} actionLabel="Caja" onAction={onBack} />

      <Panel style={styles.summaryPanel}>
        <div style={styles.summaryStack}>
          <div style={styles.summaryHero}>
            <Kicker>Evento activo</Kicker>
            <div style={styles.summaryCity}>{city}</div>
            <div style={styles.summaryTotal}>{money(metrics.totalSold)}</div>
            <Muted>{metrics.salesCount} ticket(s) / Promedio {money(metrics.averageTicket)}</Muted>
          </div>

          {loading && <div style={styles.summaryNotice}>Actualizando resumen...</div>}
          {error && <div style={styles.summaryError}>{error}</div>}
          {data.reason && !loading && <div style={styles.summaryNotice}>{data.reason}</div>}

          <div style={styles.summaryGrid}>
            <SummaryMetric label="Ventas" value={metrics.salesCount} />
            <SummaryMetric label="Clientes" value={metrics.customersCaptured} />
            <SummaryMetric label="Efectivo" value={money(metrics.cashSales)} />
            <SummaryMetric label="Tarj/Trans" value={money(metrics.cardTransfer)} />
          </div>

          <section style={styles.summarySection}>
            <div style={styles.summaryHead}>
              <h2 style={styles.summaryTitle}>Tickets recientes</h2>
              <span style={styles.summaryChip}>{visibleTickets.length}</span>
            </div>

            {visibleTickets.length === 0 ? (
              <div style={styles.summaryEmpty}>Aun no hay operaciones en esta ciudad.</div>
            ) : (
              visibleTickets.map((sale) => (
                <button key={sale.id || sale.folio} type="button" style={styles.summaryTicket} onClick={() => onSelectTicket(sale)}>
                  <span style={styles.summaryTicketInfo}>
                    <strong>{sale.folio || 'Sin folio'}</strong>
                    <small>{sale.customer_name || sale.cashier_name || 'Venta'} / {sale.payment_method || 'Pago'}</small>
                  </span>
                  <span style={styles.summaryTicketAmount}>{money(sale.total)}</span>
                </button>
              ))
            )}
          </section>

          {selectedTicket && (
            <section style={styles.summaryDetail}>
              <div style={styles.summaryHead}>
                <h2 style={styles.summaryTitle}>Detalle ticket</h2>
                <button type="button" style={styles.summaryLink} onClick={() => onSelectTicket(null)}>Cerrar</button>
              </div>
              <div style={styles.summaryDetailRows}>
                <SummaryDataRow label="Folio" value={selectedTicket.folio || 'Sin folio'} />
                <SummaryDataRow label="Total" value={money(selectedTicket.total)} />
                <SummaryDataRow label="Pago" value={selectedTicket.payment_method || 'Sin metodo'} />
                <SummaryDataRow label="Cliente" value={selectedTicket.customer_name || 'Sin cliente'} />
                <SummaryDataRow label="Hora" value={ticketTime(selectedTicket)} />
              </div>
            </section>
          )}
        </div>
      </Panel>
    </>
  )
}

function SummaryMetric({ label, value }) {
  return (
    <div style={styles.summaryMetric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function SummaryDataRow({ label, value }) {
  return (
    <div style={styles.summaryDataRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function buildCashierMetrics(sales) {
  const salesCount = sales.length
  const totalSold = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)
  const averageTicket = salesCount ? totalSold / salesCount : 0
  const customersCaptured = sales.filter((sale) => sale.customer_name || sale.customer_whatsapp).length
  const cashSales = sales.filter((sale) => sale.payment_method === 'Efectivo').reduce((sum, sale) => sum + Number(sale.total || 0), 0)
  const cardTransfer = sales.filter((sale) => ['Transferencia', 'Tarjeta', 'Mixto'].includes(sale.payment_method)).reduce((sum, sale) => sum + Number(sale.total || 0), 0)

  return { salesCount, totalSold, averageTicket, customersCaptured, cashSales, cardTransfer }
}

function ticketTime(sale) {
  if (!sale.created_at) return 'Sin hora'
  return new Date(sale.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}
function getScannerExamples() {
  return SCANNER_EXAMPLES.map((item) => ({ ...item }))
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeNumberInput(value) {
  if (value === '.') return '0.'
  return value.replace(/[^\d.]/g, '').replace(/^0+(?=\d)/, '')
}

function normalizeItemValue(item, field, value) {
  const number = Number(value)
  const minimum = field === 'unitPrice' ? 0 : 1
  const nextItem = {
    ...item,
    [field]: Number.isFinite(number) ? Math.max(minimum, number) : minimum
  }

  return {
    ...nextItem,
    subtotal: Number(nextItem.quantity || 0) * Number(nextItem.unitPrice || 0)
  }
}

function buildMenuItems({ setScreen, changeCity, openPendingSales, onLogout, canSeeAdmin, onOpenAdmin, setMenuOpen }) {
  const closeTo = (nextScreen) => {
    setScreen(nextScreen)
    setMenuOpen(false)
  }

  return [
    { label: 'Caja', onClick: () => closeTo('cashier') },
    { label: 'Resumen del dia', onClick: () => closeTo('summary') },
    { label: 'Pendientes', onClick: openPendingSales },
    { label: 'Cambiar ciudad', onClick: changeCity },
    ...(canSeeAdmin
      ? [
          {
            label: 'Dashboard operativo',
            onClick: () => {
              setMenuOpen(false)
              onOpenAdmin?.()
            }
          }
        ]
      : []),
    { label: 'Cerrar sesion', danger: true, onClick: onLogout }
  ]
}

function readDraft() {
  try {
    return JSON.parse(window.localStorage.getItem(DRAFT_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeDraft(draft) {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
}

function clearDraft() {
  window.localStorage.removeItem(DRAFT_KEY)
}

const styles = {
  mainStack: {
    display: 'grid',
    gap: 14
  },
  cityPanel: {
    borderRadius: 34,
    padding: '28px 24px 24px',
    boxShadow: '0 18px 38px rgba(17, 17, 17, 0.075)',
    maxWidth: '100%',
    boxSizing: 'border-box'
  },
  cityStack: {
    gap: 20
  },
  cityIntro: {
    display: 'grid',
    gap: 8,
    textAlign: 'center',
    padding: '6px 4px 2px'
  },
  cityInput: {
    minHeight: 60,
    borderRadius: 22,
    textAlign: 'center'
  },
  cashierPanel: {
    padding: 18,
    borderRadius: 30,
    boxShadow: '0 14px 30px rgba(17, 17, 17, 0.065)',
    maxWidth: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden'
  },
  feedback: {
    border: '1px solid #0EA371',
    borderRadius: 18,
    background: '#10B981',
    color: '#ffffff',
    padding: '12px 14px',
    fontSize: 14,
    fontWeight: 720,
    textAlign: 'center',
    animation: 'posPop 220ms ease both'
  },
  scannerButton: {
    width: '100%',
    maxWidth: '100%',
    minHeight: 64,
    border: '1px solid #111111',
    borderRadius: 24,
    background: '#DFF8EC',
    color: '#111111',
    fontSize: 18,
    fontWeight: 720,
    boxShadow: '0 10px 20px rgba(16, 185, 129, 0.14)',
    transition: 'transform 140ms ease, opacity 140ms ease'
  },
  bottomActions: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
    gap: 8,
    minWidth: 0
  },
  bottomButton: {
    width: '100%',
    maxWidth: '100%',
    minHeight: 56,
    border: '1px solid #111111',
    borderRadius: 18,
    background: '#ffffff',
    color: '#111111',
    fontSize: 16,
    fontWeight: 680,
    boxShadow: '0 8px 16px rgba(17, 17, 17, 0.04)',
    transition: 'transform 140ms ease, opacity 140ms ease'
  },
  warningPanel: {
    padding: 20,
    borderRadius: 30,
    boxShadow: '0 14px 30px rgba(17, 17, 17, 0.065)',
    maxWidth: '100%',
    boxSizing: 'border-box'
  },
  summaryPanel: {
    padding: 18,
    borderRadius: 30,
    boxShadow: '0 14px 30px rgba(17, 17, 17, 0.065)',
    maxWidth: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden'
  },
  summaryStack: {
    display: 'grid',
    gap: 14,
    minWidth: 0
  },
  summaryHero: {
    display: 'grid',
    gap: 6,
    minWidth: 0
  },
  summaryCity: {
    fontSize: 18,
    fontWeight: 700,
    color: '#111111',
    overflowWrap: 'anywhere'
  },
  summaryTotal: {
    fontSize: 44,
    lineHeight: 1,
    fontWeight: 720,
    color: '#111111'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: 9,
    minWidth: 0
  },
  summaryMetric: {
    border: '1px solid #e7e7e7',
    borderRadius: 18,
    background: '#fbfbfb',
    padding: 12,
    display: 'grid',
    gap: 4,
    minWidth: 0
  },
  summarySection: {
    display: 'grid',
    gap: 9,
    minWidth: 0
  },
  summaryHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minWidth: 0
  },
  summaryTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 720
  },
  summaryChip: {
    border: '1px solid #d7d7d7',
    borderRadius: 999,
    padding: '5px 9px',
    background: '#f7f7f7',
    color: '#555555',
    fontSize: 12,
    fontWeight: 700
  },
  summaryTicket: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    minHeight: 58,
    border: '1px solid #eeeeee',
    borderRadius: 18,
    background: '#ffffff',
    padding: '10px 12px',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 10,
    alignItems: 'center',
    textAlign: 'left',
    boxSizing: 'border-box'
  },
  summaryTicketInfo: {
    display: 'grid',
    gap: 3,
    minWidth: 0,
    overflow: 'hidden'
  },
  summaryTicketAmount: {
    fontSize: 16,
    fontWeight: 760,
    color: '#111111',
    whiteSpace: 'nowrap'
  },
  summaryDetail: {
    border: '1px solid #111111',
    borderRadius: 22,
    padding: 14,
    display: 'grid',
    gap: 8,
    minWidth: 0,
    boxSizing: 'border-box'
  },
  summaryDetailRows: {
    display: 'grid',
    gap: 2,
    minWidth: 0
  },
  summaryDataRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, auto)',
    gap: 10,
    padding: '9px 0',
    borderTop: '1px solid #eeeeee',
    fontSize: 14,
    minWidth: 0,
    overflowWrap: 'anywhere'
  },
  summaryLink: {
    border: 'none',
    background: 'transparent',
    color: '#0EA371',
    fontSize: 14,
    fontWeight: 760
  },
  summaryNotice: {
    border: '1px solid #0EA371',
    borderRadius: 18,
    background: '#DFF8EC',
    color: '#064E3B',
    padding: 11,
    fontSize: 14,
    fontWeight: 700,
    textAlign: 'center'
  },
  summaryError: {
    border: '1px solid #fecaca',
    borderRadius: 18,
    background: '#fff5f5',
    color: '#991b1b',
    padding: 11,
    fontSize: 14,
    fontWeight: 700,
    textAlign: 'center'
  },
  pendingCard: {
    border: '1px solid #e7e7e7',
    borderRadius: 18,
    background: '#fbfbfb',
    padding: 13,
    display: 'grid',
    gap: 4,
    minWidth: 0,
    overflowWrap: 'anywhere'
  },
  summaryEmpty: {
    border: '1px dashed #a3a3a3',
    borderRadius: 18,
    background: '#f7f7f7',
    color: '#555555',
    padding: 16,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: 560
  },
  totalButton: {
    width: '100%',
    maxWidth: '100%',
    minHeight: 56,
    border: '1px solid #0EA371',
    borderRadius: 18,
    background: '#10B981',
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 680,
    boxShadow: '0 10px 18px rgba(16, 185, 129, 0.22)',
    transition: 'transform 140ms ease, opacity 140ms ease'
  }
}

export default CashierPOS
