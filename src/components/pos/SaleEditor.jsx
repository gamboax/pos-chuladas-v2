import { money } from '../../lib/ticket'
import EditableItem from './EditableItem'
import HeaderBar from './HeaderBar'
import { Empty } from './ui'

export default function SaleEditor({ city, folio, cart, subtotal, onBack, onChange, onRemove, onClear, onCheckout }) {
  return (
    <>
      <HeaderBar title="Venta actual" subtitle={`${city} / ${folio}`} actionLabel="Caja" onAction={onBack} />

      <section style={styles.panel}>
        <div style={styles.stack}>
          <div style={styles.summaryCard}>
            <div style={styles.summaryInfo}>
              <span style={styles.summaryLabel}>Subtotal</span>
              <strong style={styles.summaryTotal}>{money(subtotal)}</strong>
            </div>
            <span style={styles.summaryCount}>{cart.length} articulo(s)</span>
          </div>

          {cart.length === 0 ? (
            <Empty>No hay articulos en esta venta.</Empty>
          ) : (
            cart.map((item) => <EditableItem key={item.id} item={item} onChange={onChange} onRemove={onRemove} />)
          )}

          <button type="button" style={styles.dangerButton} onClick={onClear}>
            Borrar venta
          </button>
          <div style={styles.actions}>
            <button type="button" style={styles.secondaryButton} onClick={onBack}>
              Regresar a caja
            </button>
            <button
              type="button"
              disabled={!cart.length}
              style={{ ...styles.totalButton, opacity: cart.length ? 1 : 0.45 }}
              onClick={onCheckout}
            >
              Totalizar
            </button>
          </div>
        </div>
      </section>
    </>
  )
}

const styles = {
  panel: {
    background: '#ffffff',
    border: '1px solid #111111',
    borderRadius: 30,
    padding: 16,
    boxShadow: '0 16px 32px rgba(17, 17, 17, 0.08)',
    boxSizing: 'border-box',
    maxWidth: '100%',
    minWidth: 0,
    overflow: 'hidden'
  },
  stack: {
    display: 'grid',
    gap: 14,
    minWidth: 0
  },
  summaryCard: {
    border: '1px solid #111111',
    borderRadius: 26,
    background: '#ffffff',
    padding: '18px 18px 16px',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: 8,
    boxShadow: '0 8px 20px rgba(17, 17, 17, 0.04)',
    boxSizing: 'border-box',
    maxWidth: '100%',
    minWidth: 0
  },
  summaryInfo: {
    minWidth: 0,
    maxWidth: '100%'
  },
  summaryLabel: {
    display: 'block',
    color: '#666666',
    fontSize: 13,
    fontWeight: 650,
    textTransform: 'uppercase',
    marginBottom: 6
  },
  summaryTotal: {
    display: 'block',
    color: '#111111',
    fontSize: 'clamp(25px, 7vw, 29px)',
    lineHeight: 1,
    fontWeight: 720,
    letterSpacing: 0,
    maxWidth: '100%',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere'
  },
  summaryCount: {
    color: '#666666',
    fontSize: 14,
    fontWeight: 500,
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    paddingBottom: 2
  },
  dangerButton: {
    width: '100%',
    maxWidth: '100%',
    minHeight: 56,
    border: '1px solid #b91c1c',
    borderRadius: 20,
    background: '#fff5f5',
    color: '#b91c1c',
    fontSize: 16,
    fontWeight: 700,
    boxSizing: 'border-box'
  },
  actions: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: 10,
    minWidth: 0
  },
  secondaryButton: {
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    minHeight: 62,
    border: '1px solid #111111',
    borderRadius: 20,
    background: '#ffffff',
    color: '#111111',
    fontSize: 16,
    fontWeight: 700
  },
  totalButton: {
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    minHeight: 62,
    border: '1px solid #0EA371',
    borderRadius: 20,
    background: '#10B981',
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 700,
    transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease'
  }
}
