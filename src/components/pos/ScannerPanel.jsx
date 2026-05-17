import EditableItem from './EditableItem'
import { Muted, Panel, PrimaryButton, Stack, TopBar } from './ui'

export default function ScannerPanel({ items, onBack, onChange, onRemove, onConfirm }) {
  return (
    <>
      <TopBar title="Escanear articulos" subtitle="OCR pendiente, editable por ahora" onBack={onBack} />
      <Panel>
        <Stack>
          <div style={styles.cameraBox}>
            <div style={styles.cameraCircle}>Camara</div>
            <strong>Placeholder de escaner</strong>
            <Muted>Estos articulos son ejemplos detectados.</Muted>
          </div>

          {items.map((item) => (
            <EditableItem key={item.id} item={item} onChange={onChange} onRemove={onRemove} />
          ))}

          <PrimaryButton disabled={!items.length} onClick={onConfirm}>
            Confirmar y agregar
          </PrimaryButton>
        </Stack>
      </Panel>
    </>
  )
}

const styles = {
  cameraBox: {
    minHeight: 230,
    border: '2px dashed #111111',
    borderRadius: 20,
    background: '#f5f5f5',
    display: 'grid',
    placeItems: 'center',
    alignContent: 'center',
    gap: 8,
    textAlign: 'center',
    padding: 16
  },
  cameraCircle: {
    width: 82,
    height: 82,
    borderRadius: '50%',
    border: '2px solid #111111',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 720
  }
}
