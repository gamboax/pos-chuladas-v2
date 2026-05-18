import { useEffect, useRef, useState } from 'react'
import EditableItem from './EditableItem'
import { Muted, Panel, PrimaryButton, SecondaryButton, Stack, TopBar } from './ui'

export default function ScannerPanel({ items, onBack, onChange, onRemove, onConfirm }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraMessage, setCameraMessage] = useState('Camara lista para activarse.')
  const [cameraError, setCameraError] = useState('')
  const [capturedImage, setCapturedImage] = useState('')

  useEffect(() => {
    return () => stopCamera(false)
  }, [])

  async function startCamera() {
    if (streamRef.current) {
      attachVideoStream()
      return
    }

    setCameraError('')
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

  function showLivePreview() {
    setCapturedImage('')
    window.requestAnimationFrame(() => {
      attachVideoStream()
    })
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

  function captureFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || !streamRef.current) {
      setCameraError('Activa la camara antes de tomar captura.')
      return
    }

    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    context.drawImage(video, 0, 0, width, height)
    setCapturedImage(canvas.toDataURL('image/jpeg', 0.86))
    setCameraError('')
    setCameraMessage('Captura tomada. OCR real se conectara en la siguiente fase.')
  }

  function goBack() {
    stopCamera()
    onBack()
  }

  return (
    <>
      <TopBar title="Escanear articulos" subtitle="Camara real / OCR pendiente" onBack={goBack} />
      <Panel style={styles.panelOuter}>
        <div style={styles.panelInner}>
          <Stack style={styles.stack}>
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
            <button type="button" style={styles.cameraButton} onClick={startCamera} disabled={cameraActive}>
              {cameraActive ? 'Camara activa' : 'Activar camara'}
            </button>
            <button type="button" style={styles.captureButton} onClick={captureFrame} disabled={!cameraActive}>
              Tomar captura
            </button>
          </div>

          {capturedImage && (
            <button type="button" style={styles.retakeButton} onClick={showLivePreview}>
              Ver camara otra vez
            </button>
          )}

          <canvas ref={canvasRef} style={styles.canvas} />

          <div style={styles.detectedHeader}>
            <strong>Articulos detectados</strong>
            <span>Demo editable</span>
          </div>

          {items.map((item) => (
            <EditableItem key={item.id} item={item} onChange={onChange} onRemove={onRemove} />
          ))}

          <PrimaryButton tone="success" disabled={!items.length} onClick={onConfirm}>
            Confirmar y agregar
          </PrimaryButton>
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

  return 'No se pudo iniciar la camara. Puedes seguir agregando los articulos demo manualmente.'
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
    padding: 20,
    boxSizing: 'border-box'
  },
  stack: {
    width: '100%',
    gap: 13,
    minWidth: 0,
    maxWidth: '100%'
  },
  cameraBox: {
    minHeight: 242,
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
    height: 242,
    display: 'block',
    objectFit: 'cover',
    background: '#111111',
    maxWidth: '100%',
    boxSizing: 'border-box'
  },
  previewImage: {
    width: '100%',
    height: 242,
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
  cameraActions: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: 10,
    minWidth: 0,
    maxWidth: '100%'
  },
  cameraButton: {
    width: '100%',
    minHeight: 56,
    border: '1px solid #111111',
    borderRadius: 20,
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
    minHeight: 56,
    border: '1px solid #0EA371',
    borderRadius: 20,
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
    minHeight: 52,
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
