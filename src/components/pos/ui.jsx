export function Page({ children }) {
  return (
    <main style={styles.page}>
      <div style={styles.shell}>{children}</div>
    </main>
  )
}

export function Panel({ children }) {
  return <section style={styles.panel}>{children}</section>
}

export function Stack({ children }) {
  return <div style={styles.stack}>{children}</div>
}

export function TopBar({ title, subtitle, onBack }) {
  return (
    <header style={styles.topBar}>
      <button type="button" style={styles.backButton} onClick={onBack}>
        Volver
      </button>
      <div>
        <div style={styles.topTitle}>{title}</div>
        <div style={styles.topSubtitle}>{subtitle}</div>
      </div>
    </header>
  )
}

export function Kicker({ children }) {
  return <div style={styles.kicker}>{children}</div>
}

export function Title({ children }) {
  return <h1 style={styles.title}>{children}</h1>
}

export function Muted({ children }) {
  return <p style={styles.muted}>{children}</p>
}

export function SectionTitle({ children }) {
  return <div style={styles.sectionTitle}>{children}</div>
}

export function Empty({ children }) {
  return <div style={styles.empty}>{children}</div>
}

export function SummaryLine({ label, value }) {
  return (
    <div style={styles.summaryLine}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function PrimaryButton({ children, disabled = false, tone = 'dark', onClick }) {
  const toneStyle = tone === 'success' ? styles.successButton : styles.primaryButton

  return (
    <button
      type="button"
      disabled={disabled}
      style={{ ...toneStyle, opacity: disabled ? 0.45 : 1 }}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ children, disabled = false, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      style={{ ...styles.secondaryButton, opacity: disabled ? 0.45 : 1 }}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function DangerButton({ children, onClick }) {
  return (
    <button type="button" style={styles.dangerButton} onClick={onClick}>
      {children}
    </button>
  )
}

export function TextInput(props) {
  return <input {...props} style={{ ...styles.textInput, ...(props.style || {}) }} />
}

export function NumberInput({ compact = false, ariaLabel, ...props }) {
  return (
    <input
      {...props}
      aria-label={ariaLabel}
      inputMode="decimal"
      type="number"
      min="0"
      style={compact ? styles.compactInput : styles.textInput}
    />
  )
}

export function ChoiceButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      style={{
        ...styles.choiceButton,
        background: active ? '#111111' : '#f5f5f5',
        color: active ? '#ffffff' : '#111111',
        borderColor: active ? '#111111' : '#d7d7d7'
      }}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export const styles = {
  page: {
    minHeight: '100svh',
    background: '#f4f4f4',
    color: '#111111',
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: '10px 10px 16px',
    boxSizing: 'border-box',
    textAlign: 'left'
  },
  shell: {
    width: '100%',
    maxWidth: 430,
    margin: '0 auto'
  },
  panel: {
    background: '#ffffff',
    border: '1px solid #111111',
    borderRadius: 24,
    padding: 14,
    boxShadow: '0 14px 28px rgba(17, 17, 17, 0.08)'
  },
  stack: {
    display: 'grid',
    gap: 14
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12
  },
  backButton: {
    minWidth: 86,
    height: 46,
    border: '1px solid #111111',
    borderRadius: 999,
    background: '#ffffff',
    color: '#111111',
    fontSize: 15,
    fontWeight: 720
  },
  topTitle: {
    fontSize: 21,
    fontWeight: 760,
    lineHeight: 1.1
  },
  topSubtitle: {
    color: '#555555',
    fontSize: 14,
    fontWeight: 560,
    marginTop: 2
  },
  kicker: {
    color: '#555555',
    fontSize: 13,
    fontWeight: 720,
    textTransform: 'uppercase'
  },
  title: {
    margin: '4px 0 2px',
    color: '#111111',
    fontSize: 34,
    lineHeight: 1,
    fontWeight: 780,
    letterSpacing: 0
  },
  muted: {
    color: '#555555',
    margin: 0,
    fontSize: 16,
    fontWeight: 480
  },
  primaryButton: {
    width: '100%',
    minHeight: 56,
    border: 'none',
    borderRadius: 18,
    background: '#111111',
    color: '#ffffff',
    fontSize: 17,
    fontWeight: 760,
    boxShadow: '0 10px 18px rgba(17, 17, 17, 0.14)',
    transition: 'transform 140ms ease, opacity 140ms ease'
  },
  successButton: {
    width: '100%',
    minHeight: 56,
    border: '1px solid #8FE3C1',
    borderRadius: 18,
    background: '#A7E8D0',
    color: '#111111',
    fontSize: 17,
    fontWeight: 760,
    boxShadow: '0 10px 18px rgba(143, 227, 193, 0.22)',
    transition: 'transform 140ms ease, opacity 140ms ease'
  },
  secondaryButton: {
    width: '100%',
    minHeight: 56,
    border: '1px solid #111111',
    borderRadius: 18,
    background: '#ffffff',
    color: '#111111',
    fontSize: 16,
    fontWeight: 720,
    transition: 'transform 140ms ease, opacity 140ms ease'
  },
  dangerButton: {
    width: '100%',
    minHeight: 54,
    border: '1px solid #b91c1c',
    borderRadius: 18,
    background: '#fff5f5',
    color: '#b91c1c',
    fontSize: 16,
    fontWeight: 720
  },
  textInput: {
    width: '100%',
    minHeight: 56,
    border: '1px solid #111111',
    borderRadius: 18,
    background: '#ffffff',
    color: '#111111',
    fontSize: 18,
    fontWeight: 560,
    padding: '0 12px',
    boxSizing: 'border-box'
  },
  compactInput: {
    width: '100%',
    height: 46,
    border: '1px solid #111111',
    borderRadius: 16,
    background: '#ffffff',
    color: '#111111',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 650,
    boxSizing: 'border-box'
  },
  choiceButton: {
    minHeight: 52,
    border: '1px solid #d7d7d7',
    borderRadius: 18,
    fontSize: 16,
    fontWeight: 720
  },
  summaryLine: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    color: '#333333',
    fontSize: 16,
    fontWeight: 560
  },
  sectionTitle: {
    marginTop: 4,
    color: '#111111',
    fontSize: 17,
    fontWeight: 720
  },
  empty: {
    border: '1px dashed #a3a3a3',
    borderRadius: 18,
    background: '#f5f5f5',
    color: '#555555',
    padding: 18,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 560
  },
  twoColumns: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10
  },
  threeColumns: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 8
  },
  summaryBox: {
    border: '1px solid #111111',
    borderRadius: 20,
    background: '#ffffff',
    padding: 12,
    display: 'grid',
    gap: 8
  },
  summaryTotal: {
    borderTop: '1px solid #d7d7d7',
    paddingTop: 10,
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    color: '#111111',
    fontSize: 28,
    fontWeight: 760
  },
  errorBox: {
    background: '#fee2e2',
    border: '1px solid #fecaca',
    borderRadius: 12,
    color: '#991b1b',
    fontWeight: 800,
    padding: 14,
    textAlign: 'center'
  },
  warningBox: {
    background: '#fff7ed',
    border: '1px solid #fed7aa',
    borderRadius: 18,
    color: '#9a3412',
    fontWeight: 700,
    padding: 14,
    textAlign: 'center',
    fontSize: 14
  },
  ticketBox: {
    margin: 0,
    maxHeight: 360,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    border: '1px solid #d7d7d7',
    borderRadius: 18,
    background: '#f5f5f5',
    color: '#111111',
    padding: 12,
    fontSize: 13,
    lineHeight: 1.45,
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace'
  }
}
