import { useEffect, useMemo, useState } from 'react'
import { createFolio } from '../lib/folio'
import { saveSale } from '../lib/sales'
import { buildTicket } from '../lib/ticket'
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
  'Arete'
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
  const draft = useMemo(readDraft, [])
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

  const cashierName = user?.name || 'Cajera'
  const cashierId = user?.id || user?.user_id || null
  const canSeeAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), [cart])
  const discountPercent = discountMode === 'custom' ? Number(customDiscount) || 0 : Number(discountMode)
  const safeDiscountPercent = Math.max(0, Math.min(100, discountPercent))
  const discountAmount = subtotal * (safeDiscountPercent / 100)
  const total = Math.max(0, subtotal - discountAmount)
  const menuItems = buildMenuItems({ setScreen, changeCity, onLogout, canSeeAdmin, onOpenAdmin, setMenuOpen })
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
    setCityInput(activeCity)
    setMenuOpen(false)
    clearDraft()
    resetSale({ keepCity: false })
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

  function sendWhatsApp() {
    if (!lastSale) return
    window.open(buildWhatsAppUrl(lastSale, ticketText), '_blank', 'noopener,noreferrer')
  }

  if (screen === 'city') {
    return (
      <Page centered>
        <Panel style={{ borderRadius: 32, padding: 22 }}>
          <Stack>
            <div>
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

          <Panel>
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

function buildMenuItems({ setScreen, changeCity, onLogout, canSeeAdmin, onOpenAdmin, setMenuOpen }) {
  const closeTo = (nextScreen) => {
    setScreen(nextScreen)
    setMenuOpen(false)
  }

  return [
    { label: 'Caja', onClick: () => closeTo('cashier') },
    { label: 'Venta', onClick: () => closeTo('sale') },
    { label: 'Cambiar ciudad', onClick: changeCity },
    ...(canSeeAdmin
      ? [
          {
            label: 'Dashboard',
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
    gap: 12
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
    minHeight: 66,
    border: '2px solid #111111',
    borderRadius: 26,
    background: '#DFF8EC',
    color: '#111111',
    fontSize: 18,
    fontWeight: 720,
    boxShadow: '0 10px 20px rgba(16, 185, 129, 0.18)',
    transition: 'transform 140ms ease, opacity 140ms ease'
  },
  bottomActions: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 10
  },
  bottomButton: {
    width: '100%',
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
  totalButton: {
    width: '100%',
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
