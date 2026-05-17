import { money } from '../../lib/ticket'

export default function SaleSummaryCard({ city, folio, total, count }) {
  return (
    <>
      <div style={styles.topRow}>
        <span style={styles.topText}>{city}</span>
        <strong style={styles.topFolio}>{folio}</strong>
      </div>
      <div style={styles.label}>Total</div>
      <div style={styles.total}>{money(total)}</div>
      <div style={styles.count}>{count} captura(s)</div>
    </>
  )
}

const styles = {
  topRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: 10,
    fontSize: 14,
    fontWeight: 620,
    marginBottom: 2,
    minWidth: 0,
    maxWidth: '100%'
  },
  topText: {
    minWidth: 0,
    overflowWrap: 'anywhere'
  },
  topFolio: {
    minWidth: 0,
    overflowWrap: 'anywhere',
    textAlign: 'right'
  },
  label: {
    color: '#717171',
    fontSize: 12,
    fontWeight: 650,
    textTransform: 'uppercase'
  },
  total: {
    fontSize: 'clamp(40px, 10vw, 52px)',
    lineHeight: 1,
    fontWeight: 720,
    marginTop: 2,
    letterSpacing: 0,
    maxWidth: '100%',
    overflowWrap: 'anywhere'
  },
  count: {
    color: '#666666',
    fontSize: 15,
    fontWeight: 500,
    marginTop: 2,
    marginBottom: 2
  }
}
