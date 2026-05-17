import HeaderBar from './HeaderBar'
import { Kicker } from './ui'
import { money } from '../../lib/ticket'

export default function CaptureCalculator({
  cashierName,
  city,
  menuOpen,
  menuItems,
  onToggleMenu,
  category,
  step,
  quantityInput,
  priceInput,
  onSelectStep,
  onPressKey,
  onDeleteKey,
  onCancel,
  onNext
}) {
  const displayValue = step === 'quantity' ? quantityInput : priceInput
  const captureSubtotal = Number(quantityInput || 0) * Number(priceInput || 0)

  return (
    <>
      <HeaderBar
        title={`Cobrando: ${cashierName}`}
        subtitle={city}
        menuOpen={menuOpen}
        onToggleMenu={onToggleMenu}
        menuItems={menuItems}
      />

      <section style={styles.panel}>
        <div style={styles.stack}>
          <div>
            <Kicker>Captura de producto</Kicker>
            <h1 style={styles.title}>{category}</h1>
          </div>

          <div style={styles.selectors}>
            <StepButton active={step === 'quantity'} label="Cantidad" value={quantityInput || '0'} onClick={() => onSelectStep('quantity')} />
            <StepButton
              active={step === 'price'}
              label="Precio"
              value={priceInput ? money(priceInput) : '$0'}
              onClick={() => Number(quantityInput) > 0 && onSelectStep('price')}
            />
          </div>

          <div style={styles.subtotalCard}>
            <span>Subtotal</span>
            <strong>{money(captureSubtotal)}</strong>
          </div>

          <div style={styles.numberDisplay}>{displayValue || '0'}</div>

          <div style={styles.keypad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => (
              <button key={key} type="button" style={styles.keyButton} onClick={() => onPressKey(key)}>
                {key}
              </button>
            ))}
            <button type="button" style={styles.keyButton} onClick={onDeleteKey}>
              &larr;
            </button>
            <button type="button" style={styles.keyButton} onClick={() => onPressKey('0')}>
              0
            </button>
            <button type="button" style={styles.keyButton} onClick={() => onPressKey('.')}>
              .
            </button>
          </div>

          <div style={styles.actions}>
            <button type="button" style={styles.cancelButton} onClick={onCancel}>
              Cancelar
            </button>
            <button type="button" style={styles.nextButton} onClick={onNext}>
              {step === 'quantity' ? 'Siguiente' : 'Agregar'}
            </button>
          </div>
        </div>
      </section>
    </>
  )
}

function StepButton({ active, label, value, onClick }) {
  return (
    <button
      type="button"
      style={{
        ...styles.stepButton,
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

const styles = {
  panel: {
    background: '#ffffff',
    border: '2px solid #111111',
    borderRadius: 28,
    padding: 16,
    boxShadow: '0 18px 34px rgba(17, 17, 17, 0.09)'
  },
  stack: {
    display: 'grid',
    gap: 7
  },
  title: {
    margin: '2px 0 0',
    color: '#111111',
    fontSize: 28,
    lineHeight: 1,
    fontWeight: 760,
    letterSpacing: 0
  },
  selectors: {
    display: 'grid',
    gap: 7
  },
  stepButton: {
    minHeight: 56,
    border: 'none',
    borderRadius: 18,
    padding: '8px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    textAlign: 'left',
    fontSize: 17,
    fontWeight: 620
  },
  subtotalCard: {
    minHeight: 52,
    borderRadius: 20,
    background: '#10B981',
    color: '#ffffff',
    padding: '0 18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 18,
    fontWeight: 760,
    boxShadow: '0 10px 18px rgba(16, 185, 129, 0.24)'
  },
  numberDisplay: {
    minHeight: 52,
    border: 'none',
    borderRadius: 20,
    background: '#f2f2f2',
    color: '#111111',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '0 20px',
    fontSize: 29,
    fontWeight: 760,
    overflow: 'hidden'
  },
  keypad: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 8
  },
  keyButton: {
    minHeight: 54,
    border: '1px solid #111111',
    borderRadius: 20,
    background: '#ffffff',
    color: '#111111',
    fontSize: 23,
    fontWeight: 650,
    boxShadow: '0 8px 16px rgba(17, 17, 17, 0.05)',
    transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease'
  },
  actions: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    marginTop: 0
  },
  cancelButton: {
    width: '100%',
    minHeight: 56,
    border: '1px solid #111111',
    borderRadius: 18,
    background: '#ffffff',
    color: '#111111',
    fontSize: 18,
    fontWeight: 700,
    boxShadow: '0 8px 16px rgba(17, 17, 17, 0.05)',
    transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease'
  },
  nextButton: {
    width: '100%',
    minHeight: 56,
    border: 'none',
    borderRadius: 18,
    background: '#10B981',
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 760,
    boxShadow: '0 12px 22px rgba(16, 185, 129, 0.24)',
    transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease'
  }
}
