import { Suspense, lazy, useEffect, useState } from 'react'
import Login from './components/Login'
import { clearUserSession, readUserSession, refreshUserSession } from './lib/session'

const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'))
const CashierPOS = lazy(() => import('./components/CashierPOS'))

const CASHIER_ROLES = new Set(['cashier', 'manager', 'admin_operativo', 'admin', 'super_admin'])
const ADMIN_ROLES = new Set(['manager', 'admin_operativo', 'admin', 'super_admin'])

function App() {
  const [user, setUser] = useState(() => readUserSession())
  const [view, setView] = useState('pos')
  const userId = user?.id

  function logout() {
    clearUserSession()
    setUser(null)
    setView('pos')
  }

  useEffect(() => {
    if (!userId) return undefined

    let alive = true
    refreshUserSession({ id: userId })
      .then((freshUser) => {
        if (!alive) return
        if (!freshUser) {
          clearUserSession()
          setUser(null)
          setView('pos')
          return
        }
        setUser(freshUser)
      })
      .catch(() => {})

    return () => {
      alive = false
    }
  }, [userId])

  if (!user) {
    return <Login onLogin={setUser} />
  }

  if (user.role === 'investor') {
    return (
      <Suspense fallback={<AppLoader label="Cargando vista..." />}>
        <AdminDashboard user={user} onLogout={logout} />
      </Suspense>
    )
  }

  if (ADMIN_ROLES.has(user.role) && view === 'admin') {
    return (
      <Suspense fallback={<AppLoader label="Cargando dashboard..." />}>
        <AdminDashboard user={user} onBackToPOS={() => setView('pos')} onLogout={logout} />
      </Suspense>
    )
  }

  if (CASHIER_ROLES.has(user.role)) {
    return (
      <Suspense fallback={<AppLoader label="Abriendo caja..." />}>
        <CashierPOS user={user} onLogout={logout} onOpenAdmin={ADMIN_ROLES.has(user.role) ? () => setView('admin') : undefined} />
      </Suspense>
    )
  }

  return <Login onLogin={setUser} />
}

function AppLoader({ label }) {
  return (
    <main style={loaderStyles.page}>
      <section style={loaderStyles.card}>
        <div style={loaderStyles.pulse} />
        <strong>{label}</strong>
      </section>
    </main>
  )
}

const loaderStyles = {
  page: {
    minHeight: '100dvh',
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
    minHeight: 120,
    border: '1px solid rgba(17, 17, 17, 0.84)',
    borderRadius: 28,
    background: '#ffffff',
    display: 'grid',
    placeItems: 'center',
    gap: 12,
    color: '#111111',
    boxShadow: '0 18px 38px rgba(17, 17, 17, 0.07)'
  },
  pulse: {
    width: 48,
    height: 8,
    borderRadius: 999,
    background: '#10B981'
  }
}

export default App
