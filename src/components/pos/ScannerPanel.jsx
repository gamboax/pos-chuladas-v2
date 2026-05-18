import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createAiLabelImage } from '../../lib/ocr'
import { lookupSuggestedPrice, parseProductCode } from '../../lib/scannerCodes'
import EditableItem from './EditableItem'
import { Muted, Panel, PrimaryButton, SecondaryButton, Stack, TextInput, TopBar } from './ui'

export default function ScannerPanel({ city, folio, items, onBack, onCheckout, onChange, onAddSuggestion, onRemove, onConfirm }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const inputRef = useRef(null)
  const activeSubmitRef = useRef('')
  const autoStartRef = useRef(false)
  const startCameraRef = useRef(null)
  const captureRunRef = useRef(0)
  const aiAbortRef = useRef(null)
  const capturedImageUrlRef = useRef('')
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraMessage, setCameraMessage] = useState('Camara lista para activarse.')
  const [cameraError, setCameraError] = useState('')
  const [capturedImage, setCapturedImage] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [assistMessage, setAssistMessage] = useState('Toma foto para sugerir productos.')
  const [assistError, setAssistError] = useState('')
  const [isInterpreting, setIsInterpreting] = useState(false)
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false)
  const [showManualFallback, setShowManualFallback] = useState(false)
  const [detectedCodes, setDetectedCodes] = useState([])
  const [codeHistory, setCodeHistory] = useState([])
  const [confirmedCount, setConfirmedCount] = useState(0)
  const canConfirm = items.some((item) => Number(item.quantity) > 0 && Number(item.unitPrice) > 0)
  const livePreview = useMemo(() => (codeInput.trim() ? parseProductCode(codeInput) : null), [codeInput])
  const canInterpret = Boolean(capturedImage && codeInput.trim() && !isInterpreting)

  useEffect(() => {
    return () => {
      captureRunRef.current += 1
      cancelAiAnalysis()
      stopCamera(false)
      revokeCapturedImage()
    }
  }, [])

  useEffect(() => {
    startCameraRef.current = startCamera
  })

  useEffect(() => {
    if (autoStartRef.current) return
    autoStartRef.current = true
    startCameraRef.current?.()
  }, [])

  const addDetectedCode = useCallback(async (parsed, options = {}) => {
    const suggestedPrice = await lookupSuggestedPrice(parsed.code)
    const unitPrice = suggestedPrice || parsed.parsedPrice || 0

    onAddSuggestion({
      capture_origin: 'scanner',
      category: parsed.category,
      material: parsed.material,
      code_detected: parsed.code,
      quantity: 1,
      unitPrice,
      subtotal: unitPrice
    })

    setCodeHistory((current) => [
      { code: parsed.code, label: buildHistoryLabel(parsed, unitPrice), rawCode: parsed.rawCode || parsed.code },
      ...current.filter((item) => item.code !== parsed.code)
    ].slice(0, 6))

    if (!options.silent) {
      setAssistMessage(unitPrice ? `${parsed.code} agregado.` : `${parsed.code} agregado. Falta precio.`)
      vibrateLight()
      window.setTimeout(() => inputRef.current?.focus(), 60)
    }

    return unitPrice
  }, [onAddSuggestion])

  const submitCode = useCallback(async (rawCode) => {
    if (!capturedImage || isInterpreting) return false

    const parsed = parseProductCode(rawCode)
    const submitKey = parsed.ok ? `${parsed.code}-${parsed.parsedPrice || ''}` : ''

    setAssistError('')

    if (!parsed.ok) {
      setAssistError(parsed.message)
      return false
    }

    if (activeSubmitRef.current === submitKey) return false
    activeSubmitRef.current = submitKey
    setIsInterpreting(true)
    setAssistMessage('Buscando precio...')

    const unitPrice = await addDetectedCode(parsed, { silent: true })
    setCodeInput('')
    setAssistMessage(unitPrice ? `${parsed.code} agregado.` : `${parsed.code} agregado. Falta precio.`)
    setIsInterpreting(false)
    activeSubmitRef.current = ''
    vibrateLight()
    window.setTimeout(() => inputRef.current?.focus(), 60)
    return true
  }, [addDetectedCode, capturedImage, isInterpreting])

  useEffect(() => {
    if (!canInterpret || !livePreview?.ok) return undefined

    const timeout = window.setTimeout(() => {
      submitCode(codeInput)
    }, livePreview.parsedPrice ? 360 : 460)

    return () => window.clearTimeout(timeout)
  }, [canInterpret, codeInput, livePreview, submitCode])

  async function analyzeWithAi(runId = captureRunRef.current) {
    const canvas = canvasRef.current
    if (!canvas || isAiAnalyzing) return

    cancelAiAnalysis()
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 18000)
    aiAbortRef.current = controller
    setIsAiAnalyzing(true)
    setShowManualFallback(false)
    setAssistError('')
    setCameraMessage('Analizando productos...')
    setAssistMessage('Analizando productos...')

    try {
      const image = createAiLabelImage(canvas)
      if (runId !== captureRunRef.current) return
      const response = await fetch('/api/analyze-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, city, folio }),
        signal: controller.signal
      })
      const payload = await response.json().catch(() => ({}))
      if (runId !== captureRunRef.current) return

      if (!response.ok) {
        throw new Error('No pude leer la foto. Intenta otra o captura manual.')
      }

      const suggested = normalizeAiItems(payload.items || [])
      setDetectedCodes(suggested)

      if (!suggested.length) {
        setShowManualFallback(true)
        setAssistMessage('No pude leer la foto. Intenta otra o captura manual.')
        setCameraMessage('Sin sugerencias claras. Captura manual disponible.')
        return
      }

      const seen = new Set()
      for (const parsed of suggested) {
        if (seen.has(parsed.code)) continue
        seen.add(parsed.code)
        await addDetectedCode(parsed, { silent: true })
      }

      setAssistMessage(`${suggested.length} sugerencia(s) detectada(s). Revisa articulos antes de confirmar.`)
      setCameraMessage('Sugerencias detectadas. Revisa precios.')
      setShowManualFallback(false)
      vibrateLight()
    } catch (error) {
      if (error?.name === 'AbortError') {
        setAssistMessage('Analisis cancelado. Puedes reintentar o corregir manualmente.')
        setCameraMessage('Analisis cancelado.')
      } else {
        setShowManualFallback(true)
        setAssistMessage(error.message || 'No pude leer la foto. Intenta otra o captura manual.')
        setCameraMessage('No pude leer la foto. Captura manual disponible.')
      }
    } finally {
      window.clearTimeout(timeout)
      if (aiAbortRef.current === controller) aiAbortRef.current = null
      setIsAiAnalyzing(false)
      window.setTimeout(() => inputRef.current?.focus(), 60)
    }
  }

  async function startCamera() {
    if (streamRef.current) {
      captureRunRef.current += 1
      cancelAiAnalysis()
      setConfirmedCount(0)
      clearCapturedImage()
      setDetectedCodes([])
      setShowManualFallback(false)
      await attachVideoStream()
      setCameraActive(true)
      setCameraMessage('Camara activa. Acomoda los codigos y toma captura.')
      return
    }

    setCameraError('')
    setConfirmedCount(0)
    clearCapturedImage()
    setDetectedCodes([])
    setShowManualFallback(false)
    setCameraMessage('Solicitando permiso de camara...')

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage('Camara no disponible en este navegador.')
      setCameraError('Este navegador no permite usar camara aqui. En celular, abre la app desde HTTPS.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      })

      streamRef.current = stream
      await attachVideoStream()

      setCameraActive(true)
      setCameraMessage('Camara activa. Acomoda los codigos y toma captura.')
    } catch (error) {
      setCameraActive(false)
      setCameraMessage('No se pudo activar la camara.')
      setCameraError(cameraErrorMessage(error))
      stopCamera()
    }
  }

  async function attachVideoStream() {
    if (!videoRef.current || !streamRef.current) return
    videoRef.current.srcObject = streamRef.current
    await videoRef.current.play().catch(() => {})
  }

  async function repeatCapture() {
    captureRunRef.current += 1
    cancelAiAnalysis()
    setConfirmedCount(0)
    clearCapturedImage()
    setCameraError('')
    setDetectedCodes([])
    setShowManualFallback(false)
    setCameraMessage(streamRef.current ? 'Camara activa. Toma otra captura.' : 'Activa la camara para repetir captura.')

    if (streamRef.current) {
      await attachVideoStream()
      setCameraActive(true)
    }
  }

  function stopCamera(updateState = true) {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    if (updateState) setCameraActive(false)
  }

  function revokeCapturedImage() {
    if (capturedImageUrlRef.current) {
      URL.revokeObjectURL(capturedImageUrlRef.current)
      capturedImageUrlRef.current = ''
    }
  }

  function clearCapturedImage() {
    revokeCapturedImage()
    setCapturedImage('')
  }

  function captureFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || !streamRef.current) {
      setCameraError('Activa la camara antes de tomar foto.')
      return
    }

    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    context.drawImage(video, 0, 0, width, height)
    const runId = captureRunRef.current + 1
    captureRunRef.current = runId
    canvas.toBlob((blob) => {
      if (!blob || captureRunRef.current !== runId) return
      revokeCapturedImage()
      const previewUrl = URL.createObjectURL(blob)
      capturedImageUrlRef.current = previewUrl
      setCapturedImage(previewUrl)
      analyzeWithAi(runId)
    }, 'image/jpeg', 0.86)
    setCameraError('')
    setShowManualFallback(false)
    setConfirmedCount(0)
    setCameraMessage('Analizando productos...')
    setAssistMessage('Analizando productos...')
    window.setTimeout(() => inputRef.current?.focus(), 90)
  }

  function confirmArticles() {
    const count = items.filter((item) => Number(item.quantity) > 0 && Number(item.unitPrice) > 0).length
    if (!count) return

    const confirmed = onConfirm?.()
    if (confirmed === false) return

    setConfirmedCount(count)
    setCameraMessage(`${count} articulo(s) agregados al carrito.`)
    setAssistMessage('Articulos agregados. Elige el siguiente paso.')
    setDetectedCodes([])
    setShowManualFallback(false)
    setCodeInput('')
  }

  async function scanMore() {
    setConfirmedCount(0)
    setDetectedCodes([])
    setShowManualFallback(false)
    setAssistError('')
    await repeatCapture()
  }

  function goBack() {
    cancelAiAnalysis()
    stopCamera()
    onBack()
  }

  function cancelAiAnalysis() {
    if (aiAbortRef.current) {
      aiAbortRef.current.abort()
      aiAbortRef.current = null
    }
    setIsAiAnalyzing(false)
  }

  return (
    <>
      <TopBar title="Escanear articulos" subtitle="Leer etiquetas" onBack={goBack} />
      <Panel style={styles.panelOuter}>
        <div style={styles.panelInner}>
          <Stack style={styles.stack}>
            {confirmedCount > 0 ? (
              <>
                <section style={styles.doneBox}>
                  <strong>{confirmedCount} articulo(s) en carrito</strong>
                  <Muted>Listo. Puedes seguir escaneando o cerrar la venta.</Muted>
                </section>
                <div style={styles.postConfirmActions}>
                  <button type="button" style={styles.cameraButton} onClick={onBack}>
                    Volver a caja
                  </button>
                  <button type="button" style={styles.captureButton} onClick={onCheckout}>
                    Ir a totalizar
                  </button>
                  <button type="button" style={styles.retakeButton} onClick={scanMore}>
                    Escanear mas
                  </button>
                </div>
              </>
            ) : (
              <>
            <div style={styles.cameraBox}>
              {capturedImage ? (
                <img src={capturedImage} alt="Captura tomada" style={styles.previewImage} />
              ) : (
                <video ref={videoRef} style={styles.video} playsInline muted autoPlay />
              )}
              {!cameraActive && !capturedImage && (
                <div style={styles.cameraOverlay}>
                  <strong>Vista de camara</strong>
                  <Muted>Activa la camara para ver el preview.</Muted>
                </div>
              )}
            </div>

            <div style={styles.statusBox}>
              <strong>{cameraMessage}</strong>
              {cameraError && <span>{cameraError}</span>}
            </div>

            <div style={styles.cameraActions}>
              <SecondaryButton onClick={goBack}>Volver</SecondaryButton>
              <button type="button" style={styles.cameraButton} onClick={startCamera} disabled={cameraActive && !capturedImage}>
                {cameraActive && !capturedImage ? 'Camara activa' : 'Activar camara'}
              </button>
              <button type="button" style={styles.captureButton} onClick={captureFrame} disabled={!cameraActive || Boolean(capturedImage) || isAiAnalyzing}>
                {isAiAnalyzing ? 'Analizando...' : 'Tomar foto'}
              </button>
            </div>

            {capturedImage && (
              <div style={styles.primaryScanActions}>
                {isAiAnalyzing && (
                  <button type="button" style={styles.aiCancelButton} onClick={cancelAiAnalysis}>
                    Cancelar
                  </button>
                )}
                <button type="button" style={styles.retakeButton} onClick={repeatCapture}>
                  Repetir captura
                </button>
              </div>
            )}

            <canvas ref={canvasRef} style={styles.canvas} />

            <section style={styles.assistBox}>
              <div style={styles.detectedHeader}>
                <strong>Sugerencias</strong>
                <span>{isAiAnalyzing ? 'Analizando...' : capturedImage ? 'Revisar articulos' : 'Toma foto primero'}</span>
              </div>
              {isAiAnalyzing && <div style={styles.ocrStatus}>Analizando productos...</div>}
              {detectedCodes.length > 0 && (
                <div style={styles.ocrCodes}>
                  <span>Sugerencias detectadas</span>
                  <div style={styles.ocrChipGrid}>
                    {detectedCodes.map((code) => (
                      <button
                        type="button"
                        key={`${code.code}-${code.parsedPrice || ''}`}
                        style={styles.ocrChip}
                        onClick={() => submitCode(code.rawCode || code.code)}
                      >
                        {code.code}{code.parsedPrice ? ` $${code.parsedPrice}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {showManualFallback && (
                <>
                  <TextInput
                    ref={inputRef}
                    value={codeInput}
                    onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
                    onKeyDown={(event) => event.key === 'Enter' && submitCode(codeInput)}
                    placeholder="A2, A2-30, COD-A2..."
                    disabled={!capturedImage || isInterpreting}
                    style={styles.codeInput}
                  />
                  {livePreview?.ok && (
                    <div style={styles.previewPill}>
                      {livePreview.code} / {livePreview.category}{livePreview.material ? ` / ${livePreview.material}` : ''}{livePreview.parsedPrice ? ` / $${livePreview.parsedPrice}` : ''}
                    </div>
                  )}
                  <button
                    type="button"
                    style={{ ...styles.interpretButton, opacity: canInterpret ? 1 : 0.45 }}
                    disabled={!canInterpret}
                    onClick={() => submitCode(codeInput)}
                  >
                    {isInterpreting ? 'Agregando...' : 'Interpretar'}
                  </button>
                </>
              )}
              {assistError ? <div style={styles.assistError}>{assistError}</div> : <Muted>{assistMessage}</Muted>}
              {showManualFallback && (
                <div style={styles.manualActions}>
                  <button type="button" style={styles.cameraButton} onClick={repeatCapture}>
                    Tomar otra foto
                  </button>
                  <button type="button" style={styles.retakeButton} onClick={() => inputRef.current?.focus()}>
                    Capturar manual
                  </button>
                </div>
              )}
            </section>

            {codeHistory.length > 0 && (
              <section style={styles.historyBox}>
                <div style={styles.detectedHeader}>
                  <strong>Recientes</strong>
                  <span>Toca para repetir</span>
                </div>
                <div style={styles.historyGrid}>
                  {codeHistory.map((entry) => (
                    <button
                      type="button"
                      key={entry.code}
                      disabled={!capturedImage || isInterpreting}
                      style={styles.historyButton}
                      onClick={() => submitCode(entry.rawCode)}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div style={styles.detectedHeader}>
              <strong>Articulos sugeridos</strong>
              <span>{items.length} editable(s)</span>
            </div>

            {items.length === 0 ? (
              <div style={styles.emptyBox}>Aun no hay articulos sugeridos.</div>
            ) : (
              items.map((item) => (
                <EditableItem key={item.id} item={item} onChange={onChange} onRemove={onRemove} />
              ))
            )}

            {!canConfirm && items.length > 0 && (
              <div style={styles.assistError}>Agrega precio mayor a $0 antes de confirmar.</div>
            )}

            <PrimaryButton tone="success" disabled={!canConfirm || isAiAnalyzing} onClick={confirmArticles}>
              Confirmar articulos
            </PrimaryButton>
              </>
            )}
          </Stack>
        </div>
      </Panel>
    </>
  )
}

function cameraErrorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
    return 'Permiso de camara denegado. Revisa permisos del navegador y vuelve a intentar.'
  }

  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return 'No se encontro camara disponible en este dispositivo.'
  }

  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
    return 'La camara necesita HTTPS. En Vercel funcionara con dominio seguro.'
  }

  return 'No se pudo iniciar la camara. Puedes seguir agregando articulos manualmente.'
}

function buildHistoryLabel(parsed, unitPrice) {
  return `${parsed.code}${unitPrice ? ` $${unitPrice}` : ''}`
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
        rawCode: item.raw_text || raw,
        confidence: Number(item.confidence || 0)
      }
    })
    .filter(Boolean)
}

function vibrateLight() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(12)
  }
}

const styles = {
  panelOuter: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    padding: 0,
    borderRadius: 28,
    border: '1px solid rgba(17, 17, 17, 0.84)',
    boxSizing: 'border-box',
    overflow: 'visible'
  },
  panelInner: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    padding: 18,
    boxSizing: 'border-box'
  },
  stack: {
    width: '100%',
    gap: 12,
    minWidth: 0,
    maxWidth: '100%'
  },
  cameraBox: {
    minHeight: 220,
    border: '1px solid rgba(17, 17, 17, 0.84)',
    borderRadius: 23,
    background: '#111111',
    position: 'relative',
    overflow: 'hidden',
    touchAction: 'pan-y',
    boxShadow: '0 6px 12px rgba(17, 17, 17, 0.08)',
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0
  },
  video: {
    width: '100%',
    height: 220,
    display: 'block',
    objectFit: 'cover',
    background: '#111111',
    maxWidth: '100%',
    boxSizing: 'border-box'
  },
  previewImage: {
    width: '100%',
    height: 220,
    display: 'block',
    objectFit: 'cover',
    maxWidth: '100%',
    boxSizing: 'border-box'
  },
  cameraOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    alignContent: 'center',
    gap: 8,
    color: '#ffffff',
    textAlign: 'center',
    padding: 18,
    background: 'linear-gradient(180deg, rgba(17,17,17,0.24), rgba(17,17,17,0.7))',
    pointerEvents: 'none',
    touchAction: 'pan-y'
  },
  statusBox: {
    border: '1px solid #0EA371',
    borderRadius: 20,
    background: '#DFF8EC',
    color: '#111111',
    padding: '12px 13px',
    display: 'grid',
    gap: 4,
    fontSize: 14,
    lineHeight: 1.3,
    boxSizing: 'border-box',
    maxWidth: '100%',
    minWidth: 0
  },
  primaryScanActions: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: 9,
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box'
  },
  postConfirmActions: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: 10,
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box'
  },
  cameraActions: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: 9,
    minWidth: 0,
    maxWidth: '100%'
  },
  cameraButton: {
    width: '100%',
    minHeight: 54,
    border: '1px solid #111111',
    borderRadius: 19,
    background: '#ffffff',
    color: '#111111',
    boxSizing: 'border-box',
    maxWidth: '100%',
    fontSize: 16,
    fontWeight: 700,
    transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease'
  },
  captureButton: {
    width: '100%',
    minHeight: 54,
    border: '1px solid #0EA371',
    borderRadius: 19,
    background: '#10B981',
    color: '#ffffff',
    boxSizing: 'border-box',
    maxWidth: '100%',
    fontSize: 16,
    fontWeight: 740,
    boxShadow: '0 12px 22px rgba(16, 185, 129, 0.22)',
    transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease'
  },
  retakeButton: {
    width: '100%',
    minHeight: 50,
    border: '1px solid #d7d7d7',
    borderRadius: 18,
    background: '#f7f7f7',
    color: '#111111',
    fontSize: 15,
    fontWeight: 680,
    maxWidth: '100%',
    boxSizing: 'border-box'
  },
  canvas: {
    display: 'none'
  },
  assistBox: {
    border: '1px solid #e4e4e4',
    borderRadius: 22,
    background: '#fbfbfb',
    padding: 12,
    display: 'grid',
    gap: 10,
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box'
  },
  manualActions: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: 8,
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box'
  },
  aiCancelButton: {
    width: '100%',
    minHeight: 46,
    border: '1px solid #111111',
    borderRadius: 17,
    background: '#ffffff',
    color: '#111111',
    boxSizing: 'border-box',
    maxWidth: '100%',
    fontSize: 14,
    fontWeight: 720
  },
  ocrStatus: {
    border: '1px solid #0EA371',
    borderRadius: 18,
    background: '#DFF8EC',
    color: '#064E3B',
    padding: '10px 12px',
    fontSize: 14,
    fontWeight: 760,
    textAlign: 'center',
    boxSizing: 'border-box',
    maxWidth: '100%'
  },
  ocrCodes: {
    border: '1px solid #e4e4e4',
    borderRadius: 18,
    background: '#ffffff',
    padding: 11,
    display: 'grid',
    gap: 8,
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
    fontSize: 13,
    fontWeight: 760
  },
  ocrChipGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 7,
    minWidth: 0
  },
  ocrChip: {
    minHeight: 38,
    border: '1px solid #111111',
    borderRadius: 999,
    background: '#111111',
    color: '#ffffff',
    padding: '0 12px',
    fontSize: 13,
    fontWeight: 780,
    boxSizing: 'border-box'
  },
  historyBox: {
    border: '1px solid #e4e4e4',
    borderRadius: 22,
    background: '#ffffff',
    padding: 12,
    display: 'grid',
    gap: 10,
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box'
  },
  historyGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
    maxWidth: '100%'
  },
  historyButton: {
    minHeight: 42,
    border: '1px solid #111111',
    borderRadius: 999,
    background: '#ffffff',
    color: '#111111',
    padding: '0 13px',
    fontSize: 13,
    fontWeight: 720,
    boxSizing: 'border-box',
    maxWidth: '100%'
  },
  codeInput: {
    minHeight: 54,
    textTransform: 'uppercase'
  },
  previewPill: {
    border: '1px solid #0EA371',
    borderRadius: 18,
    background: '#DFF8EC',
    color: '#064E3B',
    padding: '10px 12px',
    fontSize: 14,
    fontWeight: 760,
    lineHeight: 1.25,
    boxSizing: 'border-box',
    maxWidth: '100%',
    overflowWrap: 'anywhere'
  },
  interpretButton: {
    width: '100%',
    minHeight: 54,
    border: '1px solid #111111',
    borderRadius: 19,
    background: '#111111',
    color: '#ffffff',
    boxSizing: 'border-box',
    maxWidth: '100%',
    fontSize: 16,
    fontWeight: 740
  },
  assistError: {
    border: '1px solid #fecaca',
    borderRadius: 16,
    background: '#fff5f5',
    color: '#991b1b',
    padding: 11,
    fontSize: 13,
    fontWeight: 700,
    textAlign: 'center',
    boxSizing: 'border-box',
    maxWidth: '100%'
  },
  emptyBox: {
    border: '1px dashed #a3a3a3',
    borderRadius: 18,
    background: '#f7f7f7',
    color: '#555555',
    padding: 14,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 560,
    boxSizing: 'border-box',
    maxWidth: '100%'
  },
  doneBox: {
    border: '1px solid #0EA371',
    borderRadius: 24,
    background: '#DFF8EC',
    color: '#064E3B',
    padding: 18,
    display: 'grid',
    gap: 8,
    textAlign: 'center',
    boxSizing: 'border-box',
    maxWidth: '100%'
  },
  detectedHeader: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, auto)',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    maxWidth: '100%',
    color: '#111111',
    fontSize: 15,
    overflow: 'hidden'
  }
}
