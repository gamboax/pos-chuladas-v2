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
    gridTemplateColumns: '1fr 1fr',
    gap: 12
  },
  categoryButton: {
    minHeight: 64,
    border: 'none',
    borderRadius: 20,
    background: '#111111',
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 680,
    boxShadow: '0 10px 18px rgba(17, 17, 17, 0.12)',
    transition: 'transform 140ms ease, opacity 140ms ease'
  }
}
