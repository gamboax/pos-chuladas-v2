import { useMemo, useState } from 'react'
import { saveSale } from '../sales'

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

const SCANNER_EXAMPLES = [
  {
    id: 'scan-a2',
    code_detected: 'A2',
    category: 'Anillo',
    material: 'Oro laminado',
    quantity: 2,
    unitPrice: 35
  },
  {
    id: 'scan-e1',
    code_detected: 'E1',
    category: 'Arete',
    material: 'Acero inoxidable',
    quantity: 1,
    unitPrice: 30
  }
]

function CashierPOS({ user, onLogout }) {
  const [screen, setScreen] = useState('city')
  const [cityInput, setCityInput] = useState('')
  const [activeCity, setActiveCity] = useState('')
  const [folio, setFolio] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [cart, setCart] = useState([])

  const [captureCategory, setCaptureCategory] = useState('')
  const [captureStep, setCaptureStep] = useState('quantity')
  const [quantityInput, setQuantityInput] = useState('')
  const [priceInput, setPriceInput] = useState('')

  const [scannedItems, setScannedItems] = useState(getScannerExamples)

  const [discountMode, setDiscountMode] = useState('0')
  const [customDiscount, setCustomDiscount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Efectivo')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerType, setCustomerType] = useState('')
  const [lastSale, setLastSale] = useState(null)
  const [isSavingSale, setIsSavingSale] = useState(false)
  const [saveError, setSaveError] = useState('')

  const cashierName = user?.name || 'Cajera'
  const cashierId = user?.id || user?.user_id || null
  const canSeeAdminSoon = user?.role === 'admin' || user?.role === 'super_admin'
  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [cart]
  )
  const discountPercent = discountMode === 'custom' ? Number(customDiscount) || 0 : Number(discountMode)
  const safeDiscountPercent = Math.max(0, Math.min(100, discountPercent))
  const discountAmount = subtotal * (safeDiscountPercent / 100)
  const total = Math.max(0, subtotal - discountAmount)

  function startCity() {
    const nextCity = cityInput.trim()

    if (!nextCity) return

    setActiveCity(nextCity)
    setFolio(createFolio(nextCity))
    resetSale()
    setScreen('cashier')
  }

  function changeCity() {
    setCityInput(activeCity)
    setMenuOpen(false)
    setScreen('city')
  }

  function resetSale() {
    setCart([])
    setDiscountMode('0')
    setCustomDiscount('')
    setPaymentMethod('Efectivo')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerType('')
    setSaveError('')
    setScannedItems(getScannerExamples())
  }

  function startNewSale() {
    resetSale()
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

    setCart((current) => [
      ...current,
      {
        id: createId('manual'),
        capture_origin: 'manual',
        category: captureCategory,
        quantity,
        unitPrice,
        material: '',
        code_detected: null,
        subtotal: quantity * unitPrice
      }
    ])

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
    setScannedItems((current) =>
      current.map((item) => (item.id === id ? normalizeItemValue(item, field, value) : item))
    )
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
    setScannedItems(getScannerExamples())
    setScreen('cashier')
  }

  function updateCartItem(id, field, value) {
    setCart((current) =>
      current.map((item) => (item.id === id ? normalizeItemValue(item, field, value) : item))
    )
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
      customerType,
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

    const digits = String(lastSale.customerPhone || '').replace(/\D/g, '')
    const phone = digits.length === 10 ? `52${digits}` : digits
    const text = encodeURIComponent(buildTicket(lastSale))
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (screen === 'city') {
    return (
      <Page>
        <Panel>
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
              placeholder="Ej. Rioverde"
            />

            <PrimaryButton disabled={!cityInput.trim()} onClick={startCity}>
              Empezar venta
            </PrimaryButton>
          </Stack>
        </Panel>
      </Page>
    )
  }

  if (screen === 'capture') {
    const displayValue = captureStep === 'quantity' ? quantityInput : priceInput
    const captureSubtotal = Number(quantityInput || 0) * Number(priceInput || 0)

    return (
      <Page>
        <header style={captureHeader}>
          <div>
            <div style={captureHeaderTitle}>Cobrando: {cashierName}</div>
            <div style={captureHeaderMeta}>{activeCity}</div>
          </div>
          <button type="button" style={captureMenuButton} onClick={() => setMenuOpen((open) => !open)} aria-label="Abrir menu">
            <span style={menuLine} />
            <span style={menuLine} />
            <span style={menuLine} />
          </button>
          {menuOpen && (
            <div style={menuPanel}>
              <MenuItem onClick={() => goToMenuScreen('cashier', setScreen, setMenuOpen)}>Caja</MenuItem>
              <MenuItem onClick={() => goToMenuScreen('sale', setScreen, setMenuOpen)}>Venta</MenuItem>
              <MenuItem onClick={changeCity}>Cambiar ciudad</MenuItem>
              {canSeeAdminSoon && <MenuItem onClick={() => setMenuOpen(false)}>Admin proximamente</MenuItem>}
              <MenuItem danger onClick={onLogout}>Cerrar sesion</MenuItem>
            </div>
          )}
        </header>

        <section style={capturePanel}>
          <div style={captureStack}>
            <div>
              <Kicker>Captura de producto</Kicker>
              <h1 style={captureTitle}>{captureCategory}</h1>
            </div>

            <div style={captureSelectors}>
              <StepButton
                active={captureStep === 'quantity'}
                label="Cantidad"
                value={quantityInput || '0'}
                onClick={() => setCaptureStep('quantity')}
              />
              <StepButton
                active={captureStep === 'price'}
                label="Precio"
                value={priceInput ? money(priceInput) : '$0'}
                onClick={() => Number(quantityInput) > 0 && setCaptureStep('price')}
              />
            </div>

            <div style={subtotalCard}>
              <span>Subtotal</span>
              <strong>{money(captureSubtotal)}</strong>
            </div>

            <div style={numberDisplay}>{displayValue || '0'}</div>

            <div style={keypad}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => (
                <button key={key} type="button" style={keyButton} onClick={() => pressKey(key)}>
                  {key}
                </button>
              ))}
              <button type="button" style={keyButton} onClick={deleteKey}>
                â†
              </button>
              <button type="button" style={keyButton} onClick={() => pressKey('0')}>
                0
              </button>
              <button type="button" style={keyButton} onClick={() => pressKey('.')}>
                .
              </button>
            </div>

            <div style={captureActions}>
              <button type="button" style={captureCancelButton} onClick={() => setScreen('cashier')}>
                Cancelar
              </button>
              <button type="button" style={captureNextButton} onClick={nextCaptureStep}>
                {captureStep === 'quantity' ? 'Siguiente' : 'Agregar'}
              </button>
            </div>
          </div>
        </section>
      </Page>
    )
  }

  if (screen === 'scanner') {
    return (
      <Page>
        <TopBar title="Escanear articulos" subtitle="OCR pendiente, editable por ahora" onBack={() => setScreen('cashier')} />

        <Panel>
          <Stack>
            <div style={cameraBox}>
              <div style={cameraCircle}>Camara</div>
              <strong>Placeholder de escaner</strong>
              <Muted>Estos articulos son ejemplos detectados.</Muted>
            </div>

            {scannedItems.map((item) => (
              <EditableItem
                key={item.id}
                item={item}
                onChange={updateScannedItem}
                onRemove={removeScannedItem}
              />
            ))}

            <PrimaryButton disabled={!scannedItems.length} onClick={confirmScannedItems}>
              Confirmar y agregar
            </PrimaryButton>
          </Stack>
        </Panel>
      </Page>
    )
  }

  if (screen === 'sale') {
    return (
      <Page>
        <header style={header}>
          <div>
            <div style={headerTitle}>Venta actual</div>
            <div style={headerMeta}>{activeCity} / {folio}</div>
          </div>
          <button type="button" style={saleBackPill} onClick={() => setScreen('cashier')}>
            Caja
          </button>
        </header>

        <section style={salePanel}>
          <div style={saleStack}>
            <div style={saleSummaryCard}>
              <div>
                <span style={saleSummaryLabel}>Subtotal</span>
                <strong style={saleSummaryTotal}>{money(subtotal)}</strong>
              </div>
              <span style={saleSummaryCount}>{cart.length} articulo(s)</span>
            </div>

            {cart.length === 0 ? (
              <Empty>No hay articulos en esta venta.</Empty>
            ) : (
              cart.map((item) => (
                <EditableItem
                  key={item.id}
                  item={item}
                  onChange={updateCartItem}
                  onRemove={removeCartItem}
                />
              ))
            )}

            <button type="button" style={saleDangerButton} onClick={resetSale}>
              Borrar venta
            </button>
            <div style={saleActions}>
              <button type="button" style={saleSecondaryButton} onClick={() => setScreen('cashier')}>
                Regresar a caja
              </button>
              <button
                type="button"
                disabled={!cart.length}
                style={{ ...saleTotalButton, opacity: cart.length ? 1 : 0.45 }}
                onClick={() => setScreen('checkout')}
              >
                Totalizar
              </button>
            </div>
          </div>
        </section>
      </Page>
    )
  }

  if (screen === 'checkout') {
    return (
      <Page>
        <TopBar title="Totalizar" subtitle={folio} onBack={() => setScreen('sale')} />

        <Panel>
          <Stack>
            <div style={summaryBox}>
              <SummaryLine label="Subtotal" value={money(subtotal)} />
              <SummaryLine label={`Descuento ${safeDiscountPercent}%`} value={`-${money(discountAmount)}`} />
              <div style={summaryTotal}>
                <span>Total</span>
                <strong>{money(total)}</strong>
              </div>
            </div>

            {subtotal >= 5000 && (
              <div style={notice}>Compra mayor a $5,000: aplica 10%.</div>
            )}

            <SectionTitle>Descuento</SectionTitle>
            <div style={threeColumns}>
              <ChoiceButton active={discountMode === '0'} onClick={() => setDiscountMode('0')}>
                0%
              </ChoiceButton>
              <ChoiceButton active={discountMode === '10'} onClick={() => setDiscountMode('10')}>
                10%
              </ChoiceButton>
              <ChoiceButton active={discountMode === 'custom'} onClick={() => setDiscountMode('custom')}>
                Otro
              </ChoiceButton>
            </div>
            {discountMode === 'custom' && (
              <NumberInput
                value={customDiscount}
                onChange={(event) => setCustomDiscount(event.target.value)}
                placeholder="Porcentaje manual"
              />
            )}

            <SectionTitle>Metodo de pago</SectionTitle>
            <div style={twoColumns}>
              {PAYMENT_METHODS.map((method) => (
                <ChoiceButton
                  key={method}
                  active={paymentMethod === method}
                  onClick={() => setPaymentMethod(method)}
                >
                  {method}
                </ChoiceButton>
              ))}
            </div>

            <SectionTitle>Cliente opcional</SectionTitle>
            <TextInput value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nombre" />
            <TextInput value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="WhatsApp" inputMode="tel" />
            <div style={twoColumns}>
              {CUSTOMER_TYPES.map((type) => (
                <ChoiceButton key={type} active={customerType === type} onClick={() => setCustomerType(type)}>
                  {type}
                </ChoiceButton>
              ))}
            </div>

            <SecondaryButton onClick={() => setScreen('sale')}>Regresar a venta</SecondaryButton>
            <DangerButton onClick={resetSale}>Borrar venta</DangerButton>
            {saveError && <div style={errorBox}>{saveError}</div>}
            <PrimaryButton disabled={!cart.length || isSavingSale} onClick={finishSale}>
              {isSavingSale ? 'Guardando...' : 'Guardar venta'}
            </PrimaryButton>
          </Stack>
        </Panel>
      </Page>
    )
  }

  if (screen === 'saved' && lastSale) {
    return (
      <Page>
        <Panel>
          <Stack>
            <div>
              <Kicker>{lastSale.storageLabel || 'Venta guardada'}</Kicker>
              <Title>{lastSale.folio}</Title>
            </div>

            <div style={summaryBox}>
              <SummaryLine label="Total" value={money(lastSale.total)} />
              <SummaryLine label="Pago" value={lastSale.paymentMethod} />
              <SummaryLine label="Ciudad" value={lastSale.city} />
            </div>

            {lastSale.storage === 'local' && (
              <div style={warningBox}>
                Modo local: {lastSale.storageReason || 'No se pudo confirmar Supabase.'}
              </div>
            )}

            <pre style={ticketBox}>{buildTicket(lastSale)}</pre>

            <PrimaryButton onClick={sendWhatsApp}>Enviar WhatsApp</PrimaryButton>
            <SecondaryButton onClick={startNewSale}>Nueva venta</SecondaryButton>
            <SecondaryButton onClick={() => setScreen('cashier')}>Volver a caja</SecondaryButton>
          </Stack>
        </Panel>
      </Page>
    )
  }

  return (
    <Page>
      <header style={header}>
        <div>
          <div style={headerTitle}>Cobrando: {cashierName}</div>
          <div style={headerMeta}>{activeCity} / {folio}</div>
        </div>
        <div style={menuWrap}>
          <button type="button" style={menuButton} onClick={() => setMenuOpen((open) => !open)} aria-label="Abrir menu">
            <span style={menuLine} />
            <span style={menuLine} />
            <span style={menuLine} />
          </button>
          {menuOpen && (
            <div style={menuPanel}>
              <MenuItem onClick={() => goToMenuScreen('cashier', setScreen, setMenuOpen)}>Caja</MenuItem>
              <MenuItem onClick={() => goToMenuScreen('sale', setScreen, setMenuOpen)}>Venta</MenuItem>
              <MenuItem onClick={changeCity}>Cambiar ciudad</MenuItem>
              {canSeeAdminSoon && <MenuItem onClick={() => setMenuOpen(false)}>Admin proximamente</MenuItem>}
              <MenuItem danger onClick={onLogout}>Cerrar sesion</MenuItem>
            </div>
          )}
        </div>
      </header>

      <Panel>
        <div style={mainStack}>
          <div style={saleHero}>
            <div style={saleHeroTop}>
              <span>{activeCity}</span>
              <strong>{folio}</strong>
            </div>
            <div style={heroLabel}>Total</div>
            <div style={heroTotal}>{money(total)}</div>
            <div style={heroCount}>{cart.length} captura(s)</div>
          </div>

          <div style={productGrid}>
            {CATEGORIES.map((category) => (
              <button key={category} type="button" style={categoryButton} onClick={() => openCapture(category)}>
                {category}
              </button>
            ))}
          </div>

          <button type="button" style={scannerButton} onClick={openScanner}>
            Escanear articulos
          </button>

          <div style={bottomActions}>
            <button type="button" style={cashierBottomButton} onClick={resetSale}>
              Borrar
            </button>
            <button
              type="button"
              disabled={!cart.length}
              style={{ ...cashierBottomButton, opacity: cart.length ? 1 : 0.45 }}
              onClick={() => setScreen('sale')}
            >
              Ver venta
            </button>
            <button
              type="button"
              disabled={!cart.length}
              style={{ ...cashierTotalButton, opacity: cart.length ? 1 : 0.45 }}
              onClick={() => setScreen('checkout')}
            >
              Totalizar
            </button>
          </div>
        </div>
      </Panel>
    </Page>
  )
}

function getScannerExamples() {
  return SCANNER_EXAMPLES.map((item) => ({ ...item }))
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createFolio(city) {
  return `${cityPrefix(city)}-${Math.floor(10000 + Math.random() * 90000)}`
}

function cityPrefix(city) {
  const normalized = normalizeText(city)

  if (normalized === 'rioverde') return 'RIO'
  if (normalized === 'matehuala') return 'MAT'
  if (normalized === 'san luis potosi') return 'SLP'

  const words = normalized.split(' ').filter(Boolean)
  const letters = words.length > 1 ? words.map((word) => word[0]).join('') : normalized.slice(0, 3)

  return (letters || 'POS').slice(0, 3).toUpperCase()
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

function money(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2
  }).format(Number(value) || 0)
}

function buildTicket(sale) {
  const customerLines = [
    sale.customerName ? `Cliente: ${sale.customerName}` : '',
    sale.customerPhone ? `WhatsApp: ${sale.customerPhone}` : '',
    sale.customerType ? `Tipo cliente: ${sale.customerType}` : ''
  ].filter(Boolean)

  return `JOYERIA CHULADAS MAYOREO

Folio: ${sale.folio}
Ciudad: ${sale.city}
Fecha: ${sale.date} ${sale.time}
Cajero: ${sale.cashier}

ARTICULOS
${sale.items
  .map((item) => {
    const detail = [item.category, item.material, item.code_detected].filter(Boolean).join(' / ')
    return `${item.quantity} x ${detail} @ ${money(item.unitPrice)} = ${money(item.quantity * item.unitPrice)}`
  })
  .join('\n')}

Subtotal: ${money(sale.subtotal)}
Descuento: ${sale.discountPercent}% / -${money(sale.discountAmount)}
TOTAL: ${money(sale.total)}
Pago: ${sale.paymentMethod}
${customerLines.length ? `\n${customerLines.join('\n')}` : ''}

Gracias por tu compra.`
}

function goToMenuScreen(nextScreen, setScreen, setMenuOpen) {
  setScreen(nextScreen)
  setMenuOpen(false)
}

function Page({ children }) {
  return (
    <main style={page}>
      <div style={shell}>{children}</div>
    </main>
  )
}

function Panel({ children }) {
  return <section style={panel}>{children}</section>
}

function Stack({ children }) {
  return <div style={stack}>{children}</div>
}

function TopBar({ title, subtitle, onBack }) {
  return (
    <header style={topBar}>
      <button type="button" style={backButton} onClick={onBack}>
        Volver
      </button>
      <div>
        <div style={topTitle}>{title}</div>
        <div style={topSubtitle}>{subtitle}</div>
      </div>
    </header>
  )
}

function Kicker({ children }) {
  return <div style={kicker}>{children}</div>
}

function Title({ children }) {
  return <h1 style={title}>{children}</h1>
}

function Muted({ children }) {
  return <p style={muted}>{children}</p>
}

function SectionTitle({ children }) {
  return <div style={sectionTitle}>{children}</div>
}

function SummaryLine({ label, value }) {
  return (
    <div style={summaryLine}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function StepButton({ active, label, value, onClick }) {
  return (
    <button
      type="button"
      style={{
        ...stepButton,
        background: active ? '#111111' : '#f5f5f5',
        color: active ? '#ffffff' : '#111111'
      }}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  )
}

function ChoiceButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      style={{
        ...choiceButton,
        background: active ? '#111111' : '#f5f5f5',
        color: active ? '#ffffff' : '#111111',
        borderColor: active ? '#111111' : '#d7d7d7'
      }}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function EditableItem({ item, onChange, onRemove }) {
  return (
    <article style={editableItem}>
      <div style={itemTop}>
        <div>
          <strong style={itemTitle}>{item.category}</strong>
          <div style={itemMeta}>
            {[item.material, item.code_detected, item.capture_origin === 'scanner' ? 'Escaner' : 'Manual']
              .filter(Boolean)
              .join(' / ')}
          </div>
        </div>
        <strong style={itemTotal}>{money(item.quantity * item.unitPrice)}</strong>
      </div>

      <div style={editorRow}>
        <button type="button" style={smallButton} onClick={() => onChange(item.id, 'quantity', item.quantity - 1)}>
          -
        </button>
        <NumberInput
          compact
          value={item.quantity}
          onChange={(event) => onChange(item.id, 'quantity', event.target.value)}
          ariaLabel="Cantidad"
        />
        <button type="button" style={smallButton} onClick={() => onChange(item.id, 'quantity', item.quantity + 1)}>
          +
        </button>
        <NumberInput
          compact
          value={item.unitPrice}
          onChange={(event) => onChange(item.id, 'unitPrice', event.target.value)}
          ariaLabel="Precio"
        />
        <button type="button" style={deleteButton} onClick={() => onRemove(item.id)}>
          Eliminar
        </button>
      </div>
    </article>
  )
}

function TextInput(props) {
  return <input {...props} style={{ ...textInput, ...(props.style || {}) }} />
}

function NumberInput({ compact = false, ariaLabel, ...props }) {
  return (
    <input
      {...props}
      aria-label={ariaLabel}
      inputMode="decimal"
      type="number"
      min="0"
      style={compact ? compactInput : textInput}
    />
  )
}

function PrimaryButton({ children, disabled = false, tone = 'dark', onClick }) {
  const toneStyle = tone === 'success' ? successButton : primaryButton

  return (
    <button
      type="button"
      disabled={disabled}
      style={{ ...toneStyle, opacity: disabled ? 0.45 : 1 }}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function SecondaryButton({ children, disabled = false, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      style={{ ...secondaryButton, opacity: disabled ? 0.45 : 1 }}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function DangerButton({ children, onClick }) {
  return (
    <button type="button" style={dangerButton} onClick={onClick}>
      {children}
    </button>
  )
}

function MenuItem({ children, danger = false, onClick }) {
  return (
    <button type="button" style={{ ...menuItem, color: danger ? '#b91c1c' : '#111111' }} onClick={onClick}>
      {children}
    </button>
  )
}

function Empty({ children }) {
  return <div style={empty}>{children}</div>
}

const page = {
  minHeight: '100svh',
  background: '#f4f4f4',
  color: '#111111',
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  padding: '14px 12px 22px',
  boxSizing: 'border-box',
  textAlign: 'left'
}

const shell = {
  width: '100%',
  maxWidth: 430,
  margin: '0 auto'
}

const panel = {
  background: '#ffffff',
  border: '1px solid #111111',
  borderRadius: 26,
  padding: 16,
  boxShadow: '0 16px 32px rgba(17, 17, 17, 0.08)'
}

const stack = {
  display: 'grid',
  gap: 14
}

const header = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 16,
  position: 'relative',
  background: '#ffffff',
  border: '1px solid #111111',
  borderRadius: 999,
  padding: '10px 10px 10px 20px',
  boxShadow: '0 12px 26px rgba(17, 17, 17, 0.08)'
}

const headerTitle = {
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.15
}

const headerMeta = {
  color: '#555555',
  fontSize: 14,
  fontWeight: 500,
  marginTop: 2
}

const menuWrap = {
  position: 'relative'
}

const menuButton = {
  width: 50,
  height: 50,
  border: '1px solid #111111',
  borderRadius: 20,
  background: '#111111',
  display: 'grid',
  placeItems: 'center',
  padding: 12,
  gap: 4
}

const menuLine = {
  width: 22,
  height: 2,
  borderRadius: 2,
  background: '#ffffff',
  display: 'block'
}

const menuPanel = {
  position: 'absolute',
  top: 60,
  right: 0,
  zIndex: 10,
  width: 190,
  background: '#ffffff',
  border: '1px solid #111111',
  borderRadius: 18,
  boxShadow: '0 18px 38px rgba(17, 17, 17, 0.18)',
  overflow: 'hidden'
}

const menuItem = {
  width: '100%',
  minHeight: 52,
  border: 'none',
  borderBottom: '1px solid #ececec',
  background: '#ffffff',
  textAlign: 'left',
  padding: '0 16px',
  fontWeight: 720,
  fontSize: 16
}

const mainStack = {
  display: 'grid',
  gap: 16
}

const captureHeader = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 16,
  position: 'relative',
  background: '#ffffff',
  border: '1px solid #111111',
  borderRadius: 999,
  padding: '10px 10px 10px 20px',
  boxShadow: '0 14px 28px rgba(17, 17, 17, 0.08)'
}

const captureHeaderTitle = {
  color: '#111111',
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1.15
}

const captureHeaderMeta = {
  color: '#666666',
  fontSize: 14,
  fontWeight: 500,
  marginTop: 3
}

const captureMenuButton = {
  width: 52,
  height: 52,
  border: '1px solid #111111',
  borderRadius: 18,
  background: '#111111',
  display: 'grid',
  placeItems: 'center',
  padding: 13,
  gap: 4
}

const capturePanel = {
  background: '#ffffff',
  border: '2px solid #111111',
  borderRadius: 32,
  padding: 24,
  boxShadow: '0 18px 34px rgba(17, 17, 17, 0.09)'
}

const captureStack = {
  display: 'grid',
  gap: 14
}

const captureTitle = {
  margin: '6px 0 2px',
  color: '#111111',
  fontSize: 36,
  lineHeight: 1,
  fontWeight: 760,
  letterSpacing: 0
}

const captureSelectors = {
  display: 'grid',
  gap: 12
}

const captureActions = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12,
  marginTop: 2
}

const captureCancelButton = {
  width: '100%',
  minHeight: 72,
  border: '1px solid #111111',
  borderRadius: 24,
  background: '#ffffff',
  color: '#111111',
  fontSize: 18,
  fontWeight: 700,
  boxShadow: '0 8px 16px rgba(17, 17, 17, 0.05)'
}

const captureNextButton = {
  width: '100%',
  minHeight: 72,
  border: 'none',
  borderRadius: 24,
  background: '#22c55e',
  color: '#ffffff',
  fontSize: 18,
  fontWeight: 760,
  boxShadow: '0 12px 22px rgba(34, 197, 94, 0.22)'
}

const saleHero = {
  background: '#ffffff',
  color: '#111111',
  border: '1px solid #111111',
  borderRadius: 28,
  padding: '20px 20px 22px',
  boxShadow: '0 8px 20px rgba(17, 17, 17, 0.04)'
}

const saleHeroTop = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  fontSize: 14,
  fontWeight: 620,
  marginBottom: 18
}

const heroLabel = {
  color: '#717171',
  fontSize: 12,
  fontWeight: 650,
  textTransform: 'uppercase'
}

const heroTotal = {
  fontSize: 54,
  lineHeight: 1,
  fontWeight: 720,
  marginTop: 6,
  letterSpacing: 0
}

const heroCount = {
  color: '#666666',
  fontSize: 15,
  fontWeight: 500,
  marginTop: 10
}

const productGrid = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12
}

const categoryButton = {
  minHeight: 68,
  border: 'none',
  borderRadius: 22,
  background: '#111111',
  color: '#ffffff',
  fontSize: 18,
  fontWeight: 680,
  boxShadow: '0 10px 18px rgba(17, 17, 17, 0.12)'
}

const scannerButton = {
  width: '100%',
  minHeight: 78,
  border: '2px solid #111111',
  borderRadius: 26,
  background: '#f2fbf4',
  color: '#111111',
  fontSize: 20,
  fontWeight: 720,
  boxShadow: '0 10px 20px rgba(34, 197, 94, 0.10)'
}

const bottomActions = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr',
  gap: 10
}

const cashierBottomButton = {
  width: '100%',
  minHeight: 58,
  border: '1px solid #111111',
  borderRadius: 20,
  background: '#ffffff',
  color: '#111111',
  fontSize: 16,
  fontWeight: 680,
  boxShadow: '0 8px 16px rgba(17, 17, 17, 0.04)'
}

const cashierTotalButton = {
  ...cashierBottomButton,
  border: '1px solid #8ed9a0',
  background: '#c9f5d2',
  boxShadow: '0 10px 18px rgba(34, 197, 94, 0.14)'
}

const saleBackPill = {
  minWidth: 74,
  height: 48,
  border: 'none',
  borderRadius: 999,
  background: '#111111',
  color: '#ffffff',
  fontSize: 15,
  fontWeight: 700
}

const primaryButton = {
  width: '100%',
  minHeight: 56,
  border: 'none',
  borderRadius: 18,
  background: '#111111',
  color: '#ffffff',
  fontSize: 17,
  fontWeight: 760,
  boxShadow: '0 10px 18px rgba(17, 17, 17, 0.14)'
}

const successButton = {
  ...primaryButton,
  border: '1px solid #8ed9a0',
  background: '#c9f5d2',
  color: '#111111',
  boxShadow: '0 10px 18px rgba(34, 197, 94, 0.14)'
}

const secondaryButton = {
  width: '100%',
  minHeight: 56,
  border: '1px solid #111111',
  borderRadius: 18,
  background: '#ffffff',
  color: '#111111',
  fontSize: 16,
  fontWeight: 720
}

const dangerButton = {
  width: '100%',
  minHeight: 54,
  border: '1px solid #b91c1c',
  borderRadius: 18,
  background: '#fff5f5',
  color: '#b91c1c',
  fontSize: 16,
  fontWeight: 720
}

const topBar = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 12
}

const backButton = {
  minWidth: 86,
  height: 46,
  border: '1px solid #111111',
  borderRadius: 999,
  background: '#ffffff',
  color: '#111111',
  fontSize: 15,
  fontWeight: 720
}

const topTitle = {
  fontSize: 21,
  fontWeight: 760,
  lineHeight: 1.1
}

const topSubtitle = {
  color: '#555555',
  fontSize: 14,
  fontWeight: 560,
  marginTop: 2
}

const kicker = {
  color: '#555555',
  fontSize: 13,
  fontWeight: 720,
  textTransform: 'uppercase'
}

const title = {
  margin: '4px 0 2px',
  color: '#111111',
  fontSize: 34,
  lineHeight: 1,
  fontWeight: 780,
  letterSpacing: 0
}

const muted = {
  color: '#555555',
  margin: 0,
  fontSize: 16,
  fontWeight: 480
}

const textInput = {
  width: '100%',
  minHeight: 56,
  border: '1px solid #111111',
  borderRadius: 18,
  background: '#ffffff',
  color: '#111111',
  fontSize: 18,
  fontWeight: 560,
  padding: '0 12px',
  boxSizing: 'border-box'
}

const compactInput = {
  width: '100%',
  height: 46,
  border: '1px solid #111111',
  borderRadius: 16,
  background: '#ffffff',
  color: '#111111',
  textAlign: 'center',
  fontSize: 16,
  fontWeight: 650,
  boxSizing: 'border-box'
}

const twoColumns = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10
}

const threeColumns = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr',
  gap: 8
}

const stepButton = {
  minHeight: 84,
  border: 'none',
  borderRadius: 24,
  padding: '14px 18px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 14,
  textAlign: 'left',
  fontSize: 17,
  fontWeight: 620
}

const subtotalCard = {
  minHeight: 68,
  borderRadius: 24,
  background: '#22c55e',
  color: '#ffffff',
  padding: '0 18px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 20,
  fontWeight: 760,
  boxShadow: '0 12px 22px rgba(34, 197, 94, 0.18)'
}

const numberDisplay = {
  minHeight: 74,
  border: 'none',
  borderRadius: 24,
  background: '#f2f2f2',
  color: '#111111',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  padding: '0 20px',
  fontSize: 38,
  fontWeight: 760,
  overflow: 'hidden'
}

const keypad = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr',
  gap: 14
}

const keyButton = {
  minHeight: 86,
  border: '1px solid #111111',
  borderRadius: 24,
  background: '#ffffff',
  color: '#111111',
  fontSize: 30,
  fontWeight: 650,
  boxShadow: '0 8px 16px rgba(17, 17, 17, 0.05)'
}

const cameraBox = {
  minHeight: 230,
  border: '2px dashed #111111',
  borderRadius: 24,
  background: '#f5f5f5',
  display: 'grid',
  placeItems: 'center',
  alignContent: 'center',
  gap: 8,
  textAlign: 'center',
  padding: 16
}

const cameraCircle = {
  width: 82,
  height: 82,
  borderRadius: '50%',
  border: '2px solid #111111',
  display: 'grid',
  placeItems: 'center',
  fontWeight: 720
}

const editableItem = {
  border: '1px solid #111111',
  borderRadius: 24,
  background: '#ffffff',
  padding: 14,
  display: 'grid',
  gap: 12,
  boxShadow: '0 10px 22px rgba(17, 17, 17, 0.06)'
}

const itemTop = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 10
}

const itemTitle = {
  color: '#111111',
  fontSize: 18,
  fontWeight: 700
}

const itemMeta = {
  color: '#666666',
  fontSize: 13,
  fontWeight: 500,
  marginTop: 2
}

const itemTotal = {
  color: '#111111',
  fontSize: 18,
  fontWeight: 700,
  whiteSpace: 'nowrap'
}

const editorRow = {
  display: 'grid',
  gridTemplateColumns: '46px 62px 46px 70px 1fr',
  gap: 8,
  alignItems: 'center'
}

const smallButton = {
  width: 46,
  height: 46,
  border: '1px solid #111111',
  borderRadius: 16,
  background: '#111111',
  color: '#ffffff',
  fontSize: 22,
  fontWeight: 700
}

const deleteButton = {
  height: 46,
  border: '1px solid #b91c1c',
  borderRadius: 16,
  background: '#fff5f5',
  color: '#b91c1c',
  fontSize: 13,
  fontWeight: 700
}

const salePanel = {
  background: '#ffffff',
  border: '1px solid #111111',
  borderRadius: 30,
  padding: 16,
  boxShadow: '0 16px 32px rgba(17, 17, 17, 0.08)'
}

const saleStack = {
  display: 'grid',
  gap: 14
}

const saleSummaryCard = {
  border: '1px solid #111111',
  borderRadius: 26,
  background: '#ffffff',
  padding: '18px 18px 16px',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: 12,
  boxShadow: '0 8px 20px rgba(17, 17, 17, 0.04)'
}

const saleSummaryLabel = {
  display: 'block',
  color: '#666666',
  fontSize: 13,
  fontWeight: 650,
  textTransform: 'uppercase',
  marginBottom: 6
}

const saleSummaryTotal = {
  display: 'block',
  color: '#111111',
  fontSize: 38,
  lineHeight: 1,
  fontWeight: 720,
  letterSpacing: 0
}

const saleSummaryCount = {
  color: '#666666',
  fontSize: 14,
  fontWeight: 500,
  whiteSpace: 'nowrap',
  paddingBottom: 2
}

const saleDangerButton = {
  width: '100%',
  minHeight: 56,
  border: '1px solid #b91c1c',
  borderRadius: 20,
  background: '#fff5f5',
  color: '#b91c1c',
  fontSize: 16,
  fontWeight: 700
}

const saleActions = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10
}

const saleSecondaryButton = {
  width: '100%',
  minHeight: 62,
  border: '1px solid #111111',
  borderRadius: 22,
  background: '#ffffff',
  color: '#111111',
  fontSize: 16,
  fontWeight: 700
}

const saleTotalButton = {
  ...saleSecondaryButton,
  border: '1px solid #8ed9a0',
  background: '#c9f5d2'
}

const totalStrip = {
  minHeight: 62,
  borderRadius: 18,
  background: '#111111',
  color: '#ffffff',
  padding: '0 14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 20,
  fontWeight: 720
}

const summaryBox = {
  border: '1px solid #111111',
  borderRadius: 20,
  background: '#ffffff',
  padding: 12,
  display: 'grid',
  gap: 8
}

const summaryLine = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  color: '#333333',
  fontSize: 16,
  fontWeight: 560
}

const summaryTotal = {
  borderTop: '1px solid #d7d7d7',
  paddingTop: 10,
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  color: '#111111',
  fontSize: 28,
  fontWeight: 760
}

const notice = {
  border: '1px solid #111111',
  borderRadius: 18,
  background: '#f5f5f5',
  color: '#111111',
  padding: 12,
  fontSize: 15,
  fontWeight: 680
}

const warningBox = {
  background: '#fff7ed',
  border: '1px solid #fed7aa',
  borderRadius: 18,
  color: '#9a3412',
  fontWeight: 700,
  padding: 14,
  textAlign: 'center',
  fontSize: 14
}

const errorBox = {
  background: '#fee2e2',
  border: '1px solid #fecaca',
  borderRadius: 12,
  color: '#991b1b',
  fontWeight: 800,
  padding: 14,
  textAlign: 'center'
}

const sectionTitle = {
  marginTop: 4,
  color: '#111111',
  fontSize: 17,
  fontWeight: 720
}

const choiceButton = {
  minHeight: 52,
  border: '1px solid #d7d7d7',
  borderRadius: 18,
  fontSize: 16,
  fontWeight: 720
}

const ticketBox = {
  margin: 0,
  maxHeight: 360,
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  border: '1px solid #d7d7d7',
  borderRadius: 18,
  background: '#f5f5f5',
  color: '#111111',
  padding: 12,
  fontSize: 13,
  lineHeight: 1.45,
  fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace'
}

const empty = {
  border: '1px dashed #a3a3a3',
  borderRadius: 18,
  background: '#f5f5f5',
  color: '#555555',
  padding: 18,
  textAlign: 'center',
  fontSize: 16,
  fontWeight: 560
}

export default CashierPOS
