import { Component } from 'react'

class ScannerErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) {
      console.error('[Scanner] render crash:', error)
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <section style={styles.page}>
        <div style={styles.card}>
          <strong>No se pudo abrir el scanner.</strong>
          <span>Vuelve a caja y captura manualmente mientras revisamos la camara.</span>
          <button type="button" style={styles.button} onClick={this.props.onBack}>Volver a caja</button>
        </div>
      </section>
    )
  }
}

const styles = {
  page: {
    position: 'fixed',
    inset: 0,
    zIndex: 60,
    background: '#f4f4f4',
    display: 'grid',
    placeItems: 'center',
    padding: 20,
    boxSizing: 'border-box',
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  },
  card: {
    width: '100%',
    maxWidth: 430,
    border: '1px solid #111111',
    borderRadius: 28,
    background: '#ffffff',
    color: '#111111',
    padding: 22,
    display: 'grid',
    gap: 12,
    textAlign: 'center',
    boxSizing: 'border-box',
    boxShadow: '0 18px 38px rgba(17,17,17,0.08)'
  },
  button: {
    width: '100%',
    minHeight: 56,
    border: 'none',
    borderRadius: 20,
    background: '#111111',
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 760
  }
}

export default ScannerErrorBoundary
