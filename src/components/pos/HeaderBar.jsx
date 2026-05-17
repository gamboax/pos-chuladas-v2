const baseHeader = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 13,
  position: 'relative',
  background: '#ffffff',
  border: '1px solid rgba(17, 17, 17, 0.9)',
  borderRadius: 999,
  padding: '8px 8px 8px 16px',
  boxShadow: '0 10px 24px rgba(17, 17, 17, 0.07)',
  boxSizing: 'border-box',
  maxWidth: '100%',
  minWidth: 0
}

export default function HeaderBar({
  title,
  subtitle,
  menuOpen = false,
  onToggleMenu,
  menuItems = [],
  actionLabel,
  onAction
}) {
  return (
    <header style={baseHeader}>
      <div style={styles.headerText}>
        <div style={styles.headerTitle}>{title}</div>
        <div style={styles.headerMeta}>{subtitle}</div>
      </div>

      {actionLabel ? (
        <button type="button" style={styles.actionPill} onClick={onAction}>
          {actionLabel}
        </button>
      ) : (
        <div style={styles.menuWrap}>
          <button type="button" style={styles.menuButton} onClick={onToggleMenu} aria-label="Abrir menu">
            <span style={styles.menuLine} />
            <span style={styles.menuLine} />
            <span style={styles.menuLine} />
          </button>
          {menuOpen && (
            <div style={styles.menuPanel}>
              {menuItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  style={{ ...styles.menuItem, color: item.danger ? '#b91c1c' : '#111111' }}
                  onClick={item.onClick}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </header>
  )
}

const styles = {
  headerText: {
    minWidth: 0,
    overflow: 'hidden',
    maxWidth: 'calc(100vw - 36px)'
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.15,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  headerMeta: {
    color: '#555555',
    fontSize: 14,
    fontWeight: 500,
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  menuWrap: {
    position: 'relative',
    flexShrink: 0
  },
  menuButton: {
    width: 43,
    height: 43,
    border: '1px solid #111111',
    borderRadius: 20,
    background: '#111111',
    display: 'grid',
    placeItems: 'center',
    padding: 12,
    gap: 4
  },
  menuLine: {
    width: 22,
    height: 2,
    borderRadius: 2,
    background: '#ffffff',
    display: 'block'
  },
  menuPanel: {
    position: 'absolute',
    top: 60,
    right: 0,
    zIndex: 10,
    width: 190,
    background: '#ffffff',
    border: '1px solid #111111',
    borderRadius: 18,
    boxShadow: '0 18px 38px rgba(17, 17, 17, 0.18)',
    overflow: 'hidden'
  },
  menuItem: {
    width: '100%',
    minHeight: 52,
    border: 'none',
    borderBottom: '1px solid #ececec',
    background: '#ffffff',
    textAlign: 'left',
    padding: '0 16px',
    fontWeight: 720,
    fontSize: 16
  },
  actionPill: {
    minWidth: 74,
    height: 46,
    border: 'none',
    borderRadius: 999,
    background: '#111111',
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 700,
    transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease'
  }
}
