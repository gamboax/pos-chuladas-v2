import { useState } from 'react'
import AdminDashboard from './components/admin/AdminDashboard'
import CashierPOS from './components/CashierPOS'
import Login from './components/Login'

const CASHIER_ROLES = new Set(['cashier', 'admin', 'super_admin'])
const ADMIN_ROLES = new Set(['admin', 'super_admin'])

function App() {
  const [user, setUser] = useState(null)
  const [view, setView] = useState('pos')

  function logout() {
    setUser(null)
    setView('pos')
  }

  if (!user) {
    return <Login onLogin={setUser} />
  }

  if (user.role === 'investor') {
    return <InvestorPlaceholder user={user} onLogout={logout} />
  }

  if (ADMIN_ROLES.has(user.role) && view === 'admin') {
    return <AdminDashboard user={user} onBackToPOS={() => setView('pos')} onLogout={logout} />
  }

  if (CASHIER_ROLES.has(user.role)) {
    return <CashierPOS user={user} onLogout={logout} onOpenAdmin={ADMIN_ROLES.has(user.role) ? () => setView('admin') : undefined} />
  }

  return <Login onLogin={setUser} />
}

function InvestorPlaceholder({ user, onLogout }) {
  return (
    <main style={page}>
      <section style={card}>
        <p style={eyebrow}>POS Chuladas V2</p>
        <h1 style={title}>Vista inversionista proximamente.</h1>
        <p style={copy}>Hola, {user.name}. Esta vista queda reservada para una fase posterior.</p>
        <button type="button" style={button} onClick={onLogout}>
          Cerrar sesion
        </button>
      </section>
    </main>
  )
}

const page = {
  minHeight: '100svh',
  background: '#f4f4f4',
  display: 'grid',
  placeItems: 'center',
  padding: 16,
  boxSizing: 'border-box',
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
}

const card = {
  width: '100%',
  maxWidth: 430,
  background: '#ffffff',
  border: '1px solid #111111',
  borderRadius: 30,
  padding: 24,
  boxShadow: '0 16px 32px rgba(17, 17, 17, 0.08)',
  boxSizing: 'border-box'
}

const eyebrow = {
  margin: 0,
  color: '#666666',
  fontSize: 13,
  fontWeight: 700,
  textTransform: 'uppercase'
}

const title = {
  margin: '8px 0',
  color: '#111111',
  fontSize: 30,
  lineHeight: 1.05,
  fontWeight: 760
}

const copy = {
  margin: '0 0 18px',
  color: '#555555',
  fontSize: 16
}

const button = {
  width: '100%',
  minHeight: 58,
  border: 'none',
  borderRadius: 20,
  background: '#111111',
  color: '#ffffff',
  fontSize: 17,
  fontWeight: 760
}

export default App
