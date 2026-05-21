import { money } from '../../lib/ticket'
import { Panel, PrimaryButton, SecondaryButton, Stack, SummaryLine, Title, Kicker, styles as uiStyles } from './ui'

export default function SavedTicketView({ sale, ticketText, error = '', onSendWhatsApp, onNewSale, onBack }) {
  const isPending = sale.storage === 'local' || sale.backupStatus === 'pending' || sale.syncStatus === 'pending'
  const statusLabel = isPending ? 'Pendiente local' : 'Sincronizada'

  return (
    <Panel>
      <Stack>
        <div>
          <Kicker>{statusLabel}</Kicker>
          <Title>{sale.folio}</Title>
        </div>

        <div style={uiStyles.summaryBox}>
          <SummaryLine label="Estado" value={statusLabel} />
          <SummaryLine label="Total" value={money(sale.total)} />
          <SummaryLine label="Pago" value={sale.paymentMethod} />
          <SummaryLine label="Ciudad" value={sale.city} />
        </div>

        {sale.storage === 'local' && (
          <div style={uiStyles.warningBox}>Venta pendiente de sincronizar, pero respaldada localmente. {sale.storageReason || ''}</div>
        )}
        {sale.storage !== 'local' && (
          <div style={uiStyles.noticeBox || uiStyles.summaryBox}>Venta respaldada localmente y sincronizada.</div>
        )}
        {error && <div style={uiStyles.warningBox}>{error}</div>}

        <pre style={uiStyles.ticketBox}>{ticketText}</pre>

        <PrimaryButton tone="success" onClick={onSendWhatsApp}>Enviar WhatsApp</PrimaryButton>
        <SecondaryButton onClick={onNewSale}>Nueva venta</SecondaryButton>
        <SecondaryButton onClick={onBack}>Volver a caja</SecondaryButton>
      </Stack>
    </Panel>
  )
}
