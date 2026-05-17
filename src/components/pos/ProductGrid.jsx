export default function ProductGrid({ categories, onSelect }) {
  return (
    <div style={styles.grid}>
      {categories.map((category) => (
        <button key={category} type="button" style={styles.categoryButton} onClick={() => onSelect(category)}>
          {category}
        </button>
      ))}
    </div>
  )
}

const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: 10,
    minWidth: 0
  },
  categoryButton: {
    minHeight: 62,
    minWidth: 0,
    border: 'none',
    borderRadius: 19,
    background: '#111111',
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 680,
    boxShadow: '0 9px 16px rgba(17, 17, 17, 0.11)',
    transition: 'transform 140ms ease, opacity 140ms ease'
  }
}
