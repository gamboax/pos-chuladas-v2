import { money } from '../../lib/ticket'
import { Panel, PrimaryButton, SecondaryButton, Stack, SummaryLine, Title, Kicker, styles as uiStyles } from './ui'

export default function SavedTicketView({ sale, ticketText, onSendWhatsApp, onNewSale, onBack }) {
  return (
    <Panel>
      <Stack>
        <div>
          <Kicker>{sale.storageLabel || 'Venta guardada'}</Kicker>
          <Title>{sale.folio}</Title>
        </div>

        <div style={uiStyles.summaryBox}>
          <SummaryLine label="Total" value={money(sale.total)} />
          <SummaryLine label="Pago" value={sale.paymentMethod} />
          <SummaryLine label="Ciudad" value={sale.city} />
        </div>

        {sale.storage === 'local' && (
          <div style={uiStyles.warningBox}>Modo local: {sale.storageReason || 'No se pudo confirmar Supabase.'}</div>
        )}

        <pre style={uiStyles.ticketBox}>{ticketText}</pre>

        <PrimaryButton onClick={onSendWhatsApp}>Enviar WhatsApp</PrimaryButton>
        <SecondaryButton onClick={onNewSale}>Nueva venta</SecondaryButton>
        <SecondaryButton onClick={onBack}>Volver a caja</SecondaryButton>
      </Stack>
    </Panel>
  )
}
