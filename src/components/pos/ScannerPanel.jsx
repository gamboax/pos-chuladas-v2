import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createAiLabelImage } from '../../lib/ocr'
import { lookupSuggestedPrice, parseProductCode } from '../../lib/scannerCodes'
import { money } from '../../lib/ticket'

const SHEET_MIN = 28
const SHEET_MID = 48
const SHEET_MAX = 70
const SHEET_SNAPS = [SHEET_MIN, SHEET_MID, SHEET_MAX]

export default function ScannerPanel({
  city = '',
  folio = '',
  items = [],
  onBack = () => {},
  onCheckout = () => {},
  onChange = () => {},
  onAddSuggestion = () => {},
  onRemove = () => {},
  onConfirm = () => false
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const manualInputRef = useRef(null)
  const startCameraRef = useRef(null)
  const runRef = useRef(0)
  const aiAbortRef = useRef(null)
  const dragRef = useRef(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [status, setStatus] = useState('Abriendo camara...')
  const [error, setError] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [sheetPercent, setSheetPercent] = useState(SHEET_MID)
  const [isSheetDragging, setIsSheetDragging] = useState(false)

  const visibleItems = useMemo(() => (Array.isArray(items) ? items : []), [items])
  const subtotal = useMemo(() => visibleItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0), [visibleItems])
  const quantity = useMemo(() => visibleItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0), [visibleItems])
  const canCommit = visibleItems.some((item) => Number(item.quantity) > 0 && Number(item.unitPrice) > 0)

  const updateSheetDrag = useCallback((clientY) => {
    if (!dragRef.current) return
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 720
    const deltaPercent = ((dragRef.current.startY - clientY) / viewportHeight) * 100
    const nextPercent = clampSheet(dragRef.current.startPercent + deltaPercent)
    dragRef.current.currentPercent = nextPercent
    setSheetPercent(nextPercent)
  }, [])

  const finishSheetDrag = useCallback(() => {
    if (!dragRef.current) return
    const current = dragRef.current.currentPercent || SHEET_MID
    dragRef.current = null
    const nearest = SHEET_SNAPS.reduce((best, snap) => (Math.abs(snap - current) < Math.abs(best - current) ? snap : best), SHEET_MID)
    setIsSheetDragging(false)
    setSheetPercent(nearest)
  }, [])

  const addParsedProduct = useCallback(async (parsed, options = {}) => {
    const suggestedPrice = await lookupSuggestedPrice(parsed.code)
    const labelPrice = Number(options.price ?? parsed.parsedPrice ?? 0)
    const unitPrice = Number(labelPrice || suggestedPrice || 0)

    onAddSuggestion({
      capture_origin: 'scanner',
      category: parsed.category,
      material: parsed.material,
      code_detected: parsed.code,
      quantity: Number(options.quantity || 1),
      unitPrice,
      subtotal: unitPrice
    })

    return unitPrice
  }, [onAddSuggestion])

  useEffect(() => {
    return () => {
      runRef.current += 1
      cancelAnalysis()
      stopCamera(false)
    }
  }, [])

  useEffect(() => {
    startCameraRef.current = startCamera
  })

  useEffect(() => {
    const timeout = window.setTimeout(() => startCameraRef.current?.(), 80)
    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (!isSheetDragging) return undefined

    const handlePointerMove = (event) => {
      if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
      event.preventDefault()
      updateSheetDrag(event.clientY)
    }
    const handlePointerEnd = (event) => {
      if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
      event.preventDefault()
      finishSheetDrag()
    }
    const handleTouchMove = (event) => {
      if (!dragRef.current || dragRef.current.pointerId !== 'touch') return
      const touch = event.touches[0]
      if (!touch) return
      event.preventDefault()
      updateSheetDrag(touch.clientY)
    }
    const handleTouchEnd = () => {
      if (!dragRef.current || dragRef.current.pointerId !== 'touch') return
      finishSheetDrag()
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerEnd, { passive: false })
    window.addEventListener('pointercancel', handlePointerEnd, { passive: false })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd, { passive: false })
    window.addEventListener('touchcancel', handleTouchEnd, { passive: false })

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [finishSheetDrag, isSheetDragging, updateSheetDrag])

  async function startCamera() {
    if (streamRef.current) {
      await attachVideoStream()
      setCameraActive(true)
      setStatus('Listo para tomar foto')
      return
    }

    setError('')
    setStatus('Abriendo camara...')

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('Camara no disponible')
      setError('Puedes capturar el codigo manualmente.')
      setShowManual(true)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 960 }
        },
        audio: false
      })

      streamRef.current = stream
      await attachVideoStream()
      setCameraActive(true)
      setStatus('Listo para tomar foto')
    } catch (cameraError) {
      setCameraActive(false)
      setStatus('No se pudo abrir camara')
      setError(cameraErrorMessage(cameraError))
      setShowManual(true)
      stopCamera()
    }
  }

  async function attachVideoStream() {
    if (!videoRef.current || !streamRef.current) return
    videoRef.current.srcObject = streamRef.current
    await videoRef.current.play().catch(() => {})
  }

  function stopCamera(updateState = true) {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) videoRef.current.srcObject = null
    if (updateState) setCameraActive(false)
  }

  function cancelAnalysis() {
    if (aiAbortRef.current) {
      aiAbortRef.current.abort()
      aiAbortRef.current = null
    }
    setIsAnalyzing(false)
  }

  function captureFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || !streamRef.current || isAnalyzing) {
      if (!streamRef.current) setError('Abre la camara para tomar foto.')
      return
    }

    const width = video.videoWidth || 1280
    const height = video.videoHeight || 960
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      setError('No se pudo preparar la foto. Intenta de nuevo.')
      return
    }
    context.drawImage(video, 0, 0, width, height)
    const runId = runRef.current + 1
    runRef.current = runId
    analyzeImage(runId)
  }

  async function analyzeImage(runId) {
    const canvas = canvasRef.current
    if (!canvas) return

    cancelAnalysis()
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 18000)
    aiAbortRef.current = controller
    setIsAnalyzing(true)
    setError('')
    setShowManual(false)
    setStatus('Analizando productos...')
    vibrateLight()

    try {
      const image = createAiLabelImage(canvas)
      if (!image) throw new Error('No se pudo preparar la imagen.')
      if (runId !== runRef.current) return

      const response = await fetch('/api/analyze-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, city, folio }),
        signal: controller.signal
      })
      const payload = await response.json().catch(() => ({}))
      if (runId !== runRef.current) return

      if (!response.ok) throw new Error(payload.message || 'No pude leer la foto.')

      const parsedItems = normalizeAiItems(payload.items || [])
      if (!parsedItems.length) {
        setStatus('Sin lectura clara')
        setError('No pude leer la foto. Toma otra o captura manual.')
        setShowManual(true)
        return
      }

      const groupedItems = groupParsedItems(parsedItems)
      let added = 0
      for (const parsed of groupedItems) {
        await addParsedProduct(parsed, { quantity: parsed.quantity })
        added += Number(parsed.quantity || 1)
      }

      setStatus(`${added} articulo(s) agregados`)
      setShowManual(false)
      vibrateLight()
    } catch (analysisError) {
      if (analysisError?.name === 'AbortError') {
        setStatus('Analisis cancelado')
        setError('Toma otra foto o captura manual.')
      } else {
        setStatus('Sin lectura clara')
        setError('No pude leer la foto. Toma otra o captura manual.')
      }
      setShowManual(true)
    } finally {
      window.clearTimeout(timeout)
      if (aiAbortRef.current === controller) aiAbortRef.current = null
      setIsAnalyzing(false)
    }
  }

  async function addManualCode() {
    const parsed = parseProductCode(manualCode)
    if (!parsed.ok) {
      setError(parsed.message || 'Codigo no valido.')
      return
    }

    setError('')
    const unitPrice = await addParsedProduct(parsed)
    setManualCode('')
    setStatus(unitPrice ? `${parsed.code} agregado` : `${parsed.code} agregado, falta precio`)
    vibrateLight()
  }

  async function scanMore() {
    runRef.current += 1
    cancelAnalysis()
    setError('')
    setShowManual(false)
    setStatus(streamRef.current ? 'Listo para tomar foto' : 'Abriendo camara...')
    if (!streamRef.current) await startCamera()
  }

  function commitAndBack() {
    if (canCommit) onConfirm?.()
    stopCamera()
    onBack()
  }

  function commitAndCheckout() {
    if (!canCommit) return
    const confirmed = onConfirm?.()
    if (confirmed === false) return
    stopCamera()
    onCheckout()
  }

  function updateQuantity(item, nextQuantity) {
    onChange(item.id, 'quantity', Math.max(0, Number(nextQuantity || 0)))
  }

  function beginSheetDrag(clientY, pointerId) {
    dragRef.current = {
      pointerId,
      startY: clientY,
      startPercent: sheetPercent,
      currentPercent: sheetPercent
    }
    setIsSheetDragging(true)
  }

  function startSheetDrag(event) {
    if (dragRef.current) return
    if (event.button !== undefined && event.button !== 0) return
    event.preventDefault()
    beginSheetDrag(event.clientY, event.pointerId)
  }

  function startSheetTouch(event) {
    if (dragRef.current) return
    const touch = event.touches[0]
    if (!touch) return
    event.preventDefault()
    beginSheetDrag(touch.clientY, 'touch')
  }

  return (
    <section style={styles.root}>
      <div style={styles.cameraStage}>
        <video ref={videoRef} style={styles.video} playsInline muted autoPlay />
        <canvas ref={canvasRef} style={styles.canvas} />

        <div style={styles.topOverlay}>
          <button type="button" style={styles.backButton} onClick={commitAndBack}>Caja</button>
          <div style={styles.topMeta}>
            <strong>{status}</strong>
            <span>{city} / {folio}</span>
          </div>
        </div>

        {!cameraActive && (
          <div style={styles.centerOverlay}>
            <strong>Abriendo camara</strong>
            <span>Permite acceso para escanear rapido.</span>
            <button type="button" style={styles.lightButton} onClick={startCamera}>Activar camara</button>
          </div>
        )}

        {isAnalyzing && (
          <div style={styles.analysisOverlay}>
            <div className="scanner-spinner" style={styles.loader} />
            <strong>Analizando productos...</strong>
          </div>
        )}

        {error && (
          <div style={styles.errorPill}>{error}</div>
        )}

        <div style={styles.captureDock}>
          <button type="button" style={styles.shutter} onClick={captureFrame} disabled={!cameraActive || isAnalyzing}>
            {isAnalyzing ? '...' : ''}
          </button>
        </div>
      </div>

      <div style={{ ...styles.bottomSheet, height: `${sheetPercent}dvh`, transition: isSheetDragging ? 'none' : styles.bottomSheet.transition }}>
        <div
          style={styles.sheetHandleZone}
          onPointerDown={startSheetDrag}
          onTouchStart={startSheetTouch}
        >
          <div style={styles.sheetHandle} />
        </div>

        <div style={styles.summaryRow}>
          <div>
            <span style={styles.caption}>Subtotal scanner</span>
            <strong style={styles.total}>{money(subtotal)}</strong>
          </div>
          <div style={styles.qtyBadge}>{quantity} pza(s)</div>
        </div>

        <div style={styles.cartList}>
          {visibleItems.length === 0 ? (
            <div style={styles.emptyCart}>Toma una foto. Los productos detectados apareceran aqui.</div>
          ) : (
            visibleItems.map((item) => (
              <ScannerCartRow
                key={item.id}
                item={item}
                onQuantity={updateQuantity}
                onChange={onChange}
                onRemove={onRemove}
              />
            ))
          )}
        </div>

        {showManual && (
          <div style={styles.manualBar}>
            <input
              ref={manualInputRef}
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value.toUpperCase())}
              onKeyDown={(event) => event.key === 'Enter' && addManualCode()}
              placeholder="A2-35"
              style={styles.manualInput}
            />
            <button type="button" style={styles.manualButton} onClick={addManualCode}>Agregar</button>
          </div>
        )}

        <div style={styles.actions}>
          <button type="button" style={styles.secondaryAction} onClick={commitAndBack}>Volver a caja</button>
          <button type="button" style={styles.secondaryAction} onClick={scanMore}>Seguir escaneando</button>
          <button type="button" style={{ ...styles.primaryAction, opacity: canCommit ? 1 : 0.45 }} disabled={!canCommit} onClick={commitAndCheckout}>Totalizar</button>
        </div>
      </div>
    </section>
  )
}

function ScannerCartRow({ item, onQuantity, onChange, onRemove }) {
  const code = item.code_detected || item.category

  return (
    <article style={styles.cartRow}>
      <button type="button" style={styles.removeButton} onClick={() => onRemove(item.id)}>x</button>
      <div style={styles.itemInfo}>
        <strong>{code}</strong>
        <span>{[item.category, item.material].filter(Boolean).join(' / ')}</span>
      </div>
      <div style={styles.qtyControls}>
        <button type="button" style={styles.qtyButton} onClick={() => onQuantity(item, Number(item.quantity || 0) - 1)}>-</button>
        <span>{item.quantity}</span>
        <button type="button" style={styles.qtyButton} onClick={() => onQuantity(item, Number(item.quantity || 0) + 1)}>+</button>
      </div>
      <input
        aria-label="Precio"
        inputMode="decimal"
        type="number"
        min="0"
        value={item.unitPrice}
        onChange={(event) => onChange(item.id, 'unitPrice', event.target.value)}
        style={styles.priceInput}
      />
    </article>
  )
}

function normalizeAiItems(items) {
  return items
    .map((item) => {
      const raw = [item.code, item.price ? `$${item.price}` : ''].filter(Boolean).join(' ')
      const parsed = parseProductCode(raw)
      if (!parsed.ok) return null
      return {
        ...parsed,
        parsedPrice: Number(item.price || parsed.parsedPrice || 0) || null,
        quantity: Math.max(1, Math.round(Number(item.quantity || 1) || 1)),
        rawCode: item.raw_text || raw,
        confidence: Number(item.confidence || 0)
      }
    })
    .filter(Boolean)
}

function groupParsedItems(items) {
  const groups = new Map()

  items.forEach((item) => {
    const price = Number(item.parsedPrice || 0)
    const key = `${item.code}|${price || 'no-price'}`
    const current = groups.get(key)
    if (current) {
      current.quantity += Number(item.quantity || 1)
      current.rawCode = [current.rawCode, item.rawCode].filter(Boolean).join(' / ')
      return
    }

    groups.set(key, { ...item, quantity: Number(item.quantity || 1) })
  })

  return [...groups.values()]
}

function clampSheet(value) {
  return Math.max(SHEET_MIN, Math.min(SHEET_MAX, Number(value) || SHEET_MID))
}

function cameraErrorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') return 'Permiso de camara denegado.'
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') return 'No se encontro camara.'
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return 'La camara necesita HTTPS.'
  return 'Puedes capturar manualmente.'
}

function vibrateLight() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(12)
}

const styles = {
  root: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    background: '#050505',
    color: '#ffffff',
    display: 'grid',
    gridTemplateRows: 'minmax(0, 1fr) auto',
    minWidth: 0,
    overflow: 'hidden',
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  },
  cameraStage: {
    position: 'relative',
    minHeight: 0,
    background: '#050505',
    overflow: 'hidden',
    touchAction: 'manipulation'
  },
  video: {
    width: '100%',
    height: '100%',
    minHeight: 380,
    display: 'block',
    objectFit: 'cover',
    background: '#111111'
  },
  canvas: {
    display: 'none'
  },
  topOverlay: {
    position: 'absolute',
    top: 'calc(14px + env(safe-area-inset-top))',
    left: 14,
    right: 14,
    display: 'grid',
    gridTemplateColumns: '76px minmax(0, 1fr)',
    alignItems: 'center',
    gap: 10,
    minWidth: 0
  },
  backButton: {
    height: 46,
    border: 'none',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.94)',
    color: '#111111',
    fontSize: 15,
    fontWeight: 760
  },
  topMeta: {
    minWidth: 0,
    borderRadius: 999,
    background: 'rgba(17,17,17,0.62)',
    backdropFilter: 'blur(10px)',
    padding: '8px 13px',
    display: 'grid',
    gap: 1,
    overflow: 'hidden'
  },
  centerOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    alignContent: 'center',
    gap: 10,
    padding: 24,
    textAlign: 'center',
    background: 'linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.52))'
  },
  lightButton: {
    minHeight: 50,
    border: 'none',
    borderRadius: 999,
    background: '#ffffff',
    color: '#111111',
    padding: '0 18px',
    fontSize: 16,
    fontWeight: 760
  },
  analysisOverlay: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    borderRadius: 24,
    background: 'rgba(17,17,17,0.76)',
    backdropFilter: 'blur(10px)',
    padding: '18px 20px',
    display: 'grid',
    justifyItems: 'center',
    gap: 12,
    textAlign: 'center',
    minWidth: 210
  },
  loader: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    border: '4px solid rgba(255,255,255,0.26)',
    borderTopColor: '#10B981',
    animation: 'scannerSpin 780ms linear infinite'
  },
  errorPill: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 102,
    borderRadius: 18,
    background: 'rgba(255,245,245,0.96)',
    color: '#991b1b',
    padding: 12,
    fontSize: 14,
    fontWeight: 760,
    textAlign: 'center'
  },
  captureDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
    display: 'grid',
    placeItems: 'center',
    pointerEvents: 'none'
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: '50%',
    border: '5px solid rgba(255,255,255,0.92)',
    background: '#ffffff',
    boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
    pointerEvents: 'auto',
    opacity: 1
  },
  bottomSheet: {
    width: '100%',
    borderRadius: '28px 28px 0 0',
    background: '#f4f4f4',
    color: '#111111',
    padding: '8px 14px calc(14px + env(safe-area-inset-bottom))',
    display: 'grid',
    gridTemplateRows: '42px auto minmax(0, 1fr) auto auto',
    gap: 10,
    boxSizing: 'border-box',
    boxShadow: '0 -16px 34px rgba(0,0,0,0.22)',
    overflow: 'hidden',
    transition: 'height 220ms cubic-bezier(0.22, 1, 0.36, 1)',
    willChange: 'height'
  },
  sheetHandleZone: {
    width: '100%',
    height: 42,
    display: 'grid',
    placeItems: 'center',
    touchAction: 'none',
    cursor: 'grab',
    userSelect: 'none'
  },
  sheetHandle: {
    width: 64,
    height: 7,
    borderRadius: 999,
    background: '#c9c9c9'
  },
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: 10
  },
  caption: {
    display: 'block',
    color: '#666666',
    fontSize: 12,
    fontWeight: 760,
    textTransform: 'uppercase'
  },
  total: {
    display: 'block',
    fontSize: 34,
    lineHeight: 1,
    fontWeight: 760
  },
  qtyBadge: {
    border: '1px solid #0EA371',
    borderRadius: 999,
    background: '#DFF8EC',
    color: '#064E3B',
    padding: '9px 12px',
    fontSize: 13,
    fontWeight: 780,
    whiteSpace: 'nowrap'
  },
  cartList: {
    display: 'grid',
    gap: 8,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    overscrollBehavior: 'contain',
    minHeight: 46,
    paddingRight: 2
  },
  emptyCart: {
    border: '1px dashed #a3a3a3',
    borderRadius: 18,
    background: '#ffffff',
    color: '#666666',
    padding: 13,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 620
  },
  cartRow: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: '34px minmax(0, 1fr) 104px 74px',
    gap: 7,
    alignItems: 'center',
    border: '1px solid #d7d7d7',
    borderRadius: 18,
    background: '#ffffff',
    padding: 8,
    boxSizing: 'border-box',
    minWidth: 0
  },
  removeButton: {
    width: 34,
    height: 34,
    border: '1px solid #e4e4e4',
    borderRadius: 12,
    background: '#fff5f5',
    color: '#991b1b',
    fontSize: 16,
    fontWeight: 800
  },
  itemInfo: {
    minWidth: 0,
    display: 'grid',
    gap: 1,
    fontSize: 14,
    overflow: 'hidden',
    overflowWrap: 'anywhere'
  },
  qtyControls: {
    display: 'grid',
    gridTemplateColumns: '30px minmax(0, 1fr) 30px',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 780
  },
  qtyButton: {
    width: 30,
    height: 34,
    border: 'none',
    borderRadius: 12,
    background: '#111111',
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 800
  },
  priceInput: {
    width: '100%',
    height: 38,
    minWidth: 0,
    border: '1px solid #111111',
    borderRadius: 13,
    background: '#ffffff',
    color: '#111111',
    textAlign: 'center',
    fontSize: 15,
    fontWeight: 720,
    boxSizing: 'border-box'
  },
  manualBar: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 96px',
    gap: 8
  },
  manualInput: {
    width: '100%',
    minHeight: 48,
    border: '1px solid #111111',
    borderRadius: 17,
    background: '#ffffff',
    color: '#111111',
    padding: '0 13px',
    fontSize: 17,
    fontWeight: 680,
    boxSizing: 'border-box'
  },
  manualButton: {
    minHeight: 48,
    border: '1px solid #111111',
    borderRadius: 17,
    background: '#111111',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 760
  },
  actions: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
    gap: 8,
    minWidth: 0
  },
  secondaryAction: {
    minHeight: 52,
    border: '1px solid #111111',
    borderRadius: 18,
    background: '#ffffff',
    color: '#111111',
    fontSize: 13,
    fontWeight: 760,
    padding: '0 8px'
  },
  primaryAction: {
    minHeight: 52,
    border: '1px solid #0EA371',
    borderRadius: 18,
    background: '#10B981',
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 800,
    padding: '0 8px'
  }
}
