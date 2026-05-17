import { money } from '../../lib/ticket'
import HeaderBar from './HeaderBar'
import {
  ChoiceButton,
  DangerButton,
  NumberInput,
  Panel,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  Stack,
  SummaryLine,
  TextInput,
  styles as uiStyles
} from './ui'

export default function CheckoutPanel({
  folio,
  cartLength,
  subtotal,
  safeDiscountPercent,
  discountAmount,
  total,
  discountMode,
  customDiscount,
  paymentMethod,
  customerName,
  customerPhone,
  customerType,
  paymentMethods,
  customerTypes,
  saveError,
  isSavingSale,
  onBack,
  onDiscountMode,
  onCustomDiscount,
  onPaymentMethod,
  onCustomerName,
  onCustomerPhone,
  onCustomerType,
  onClear,
  onSave
}) {
  return (
    <>
      <HeaderBar title="Totalizar" subtitle={folio} actionLabel="Volver" onAction={onBack} />
      <Panel>
        <Stack>
          <div style={uiStyles.summaryBox}>
            <SummaryLine label="Subtotal" value={money(subtotal)} />
            <SummaryLine label={`Descuento ${safeDiscountPercent}%`} value={`-${money(discountAmount)}`} />
            <div style={uiStyles.summaryTotal}>
              <span>Total</span>
              <strong>{money(total)}</strong>
            </div>
          </div>

          {subtotal >= 5000 && <div style={styles.notice}>Compra mayor a $5,000: aplica 10%.</div>}

          <SectionTitle>Descuento</SectionTitle>
          <div style={uiStyles.threeColumns}>
            <ChoiceButton active={discountMode === '0'} onClick={() => onDiscountMode('0')}>
              0%
            </ChoiceButton>
            <ChoiceButton active={discountMode === '10'} onClick={() => onDiscountMode('10')}>
              10%
            </ChoiceButton>
            <ChoiceButton active={discountMode === 'custom'} onClick={() => onDiscountMode('custom')}>
              Otro
            </ChoiceButton>
          </div>
          {discountMode === 'custom' && (
            <NumberInput value={customDiscount} onChange={(event) => onCustomDiscount(event.target.value)} placeholder="Porcentaje manual" />
          )}

          <SectionTitle>Metodo de pago</SectionTitle>
          <div style={uiStyles.twoColumns}>
            {paymentMethods.map((method) => (
              <ChoiceButton key={method} active={paymentMethod === method} onClick={() => onPaymentMethod(method)}>
                {method}
              </ChoiceButton>
            ))}
          </div>

          <SectionTitle>Cliente opcional</SectionTitle>
          <TextInput value={customerName} onChange={(event) => onCustomerName(event.target.value)} placeholder="Nombre" />
          <TextInput value={customerPhone} onChange={(event) => onCustomerPhone(event.target.value)} placeholder="WhatsApp" inputMode="tel" />
          <div style={uiStyles.twoColumns}>
            {customerTypes.map((type) => (
              <ChoiceButton key={type} active={customerType === type} onClick={() => onCustomerType(type)}>
                {type}
              </ChoiceButton>
            ))}
          </div>

          <SecondaryButton onClick={onBack}>Regresar a venta</SecondaryButton>
          <DangerButton onClick={onClear}>Borrar venta</DangerButton>
          {saveError && <div style={uiStyles.errorBox}>{saveError}</div>}
          <PrimaryButton tone="success" disabled={!cartLength || isSavingSale} onClick={onSave}>
            {isSavingSale ? 'Guardando...' : 'Guardar venta'}
          </PrimaryButton>
        </Stack>
      </Panel>
    </>
  )
}

const styles = {
  notice: {
    border: '1px solid #111111',
    borderRadius: 18,
    background: '#f5f5f5',
    color: '#111111',
    padding: 12,
    fontSize: 15,
    fontWeight: 680
  }
}
