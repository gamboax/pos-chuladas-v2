import { money } from '../../lib/ticket'

export default function SaleSummaryCard({ city, folio, total, count }) {
  return (
    <>
      <div style={styles.topRow}>
        <span>{city}</span>
        <strong>{folio}</strong>
      </div>
      <div style={styles.label}>Total</div>
      <div style={styles.total}>{money(total)}</div>
      <div style={styles.count}>{count} captura(s)</div>
    </>
  )
}

const styles = {
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    fontSize: 14,
    fontWeight: 620,
    marginBottom: 2
  },
  label: {
    color: '#717171',
    fontSize: 12,
    fontWeight: 650,
    textTransform: 'uppercase'
  },
  total: {
    fontSize: 'clamp(44px, 11vw, 52px)',
    lineHeight: 1,
    fontWeight: 720,
    marginTop: 2,
    letterSpacing: 0
  },
  count: {
    color: '#666666',
    fontSize: 15,
    fontWeight: 500,
    marginTop: 2,
    marginBottom: 2
  }
}
