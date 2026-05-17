import { money } from '../../lib/ticket'
import { NumberInput } from './ui'

export default function EditableItem({ item, onChange, onRemove }) {
  return (
    <article style={styles.item}>
      <div style={styles.itemTop}>
        <div style={styles.itemInfo}>
          <strong style={styles.itemTitle}>{item.category}</strong>
          <div style={styles.itemMeta}>
            {[item.material, item.code_detected, item.capture_origin === 'scanner' ? 'Escaner' : 'Manual']
              .filter(Boolean)
              .join(' / ')}
          </div>
        </div>
        <strong style={styles.itemTotal}>{money(item.quantity * item.unitPrice)}</strong>
      </div>

      <div style={styles.editorRow}>
        <button type="button" style={styles.smallButton} onClick={() => onChange(item.id, 'quantity', item.quantity - 1)}>
          -
        </button>
        <NumberInput
          compact
          value={item.quantity}
          onChange={(event) => onChange(item.id, 'quantity', event.target.value)}
          ariaLabel="Cantidad"
        />
        <button type="button" style={styles.smallButton} onClick={() => onChange(item.id, 'quantity', item.quantity + 1)}>
          +
        </button>
        <NumberInput
          compact
          value={item.unitPrice}
          onChange={(event) => onChange(item.id, 'unitPrice', event.target.value)}
          ariaLabel="Precio"
        />
        <button type="button" style={styles.deleteButton} onClick={() => onRemove(item.id)}>
          Eliminar
        </button>
      </div>
    </article>
  )
}

const styles = {
  item: {
    border: '1px solid #111111',
    borderRadius: 20,
    background: '#ffffff',
    padding: 14,
    display: 'grid',
    gap: 12,
    boxShadow: '0 10px 22px rgba(17, 17, 17, 0.06)',
    boxSizing: 'border-box',
    maxWidth: '100%',
    minWidth: 0,
    overflow: 'hidden'
  },
  itemTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    minWidth: 0
  },
  itemInfo: {
    minWidth: 0
  },
  itemTitle: {
    color: '#111111',
    fontSize: 18,
    fontWeight: 700,
    overflowWrap: 'anywhere'
  },
  itemMeta: {
    color: '#666666',
    fontSize: 13,
    fontWeight: 500,
    marginTop: 2,
    overflowWrap: 'anywhere'
  },
  itemTotal: {
    color: '#111111',
    fontSize: 18,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    flexShrink: 0
  },
  editorRow: {
    display: 'grid',
    gridTemplateColumns: '42px minmax(48px, 1fr) 42px minmax(58px, 1fr)',
    gap: 7,
    alignItems: 'center',
    minWidth: 0,
    maxWidth: '100%'
  },
  smallButton: {
    width: '100%',
    height: 44,
    border: '1px solid #111111',
    borderRadius: 16,
    background: '#111111',
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 700
  },
  deleteButton: {
    gridColumn: '1 / -1',
    width: '100%',
    height: 44,
    border: '1px solid #b91c1c',
    borderRadius: 16,
    background: '#fff5f5',
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: 700
  }
}
