import { useState } from 'react'
import AdminDashboard from './components/admin/AdminDashboard'
import CashierPOS from './components/CashierPOS'
import Login from './components/Login'

const CASHIER_ROLES = new Set(['cashier', 'manager', 'admin_operativo', 'admin', 'super_admin'])
const ADMIN_ROLES = new Set(['manager', 'admin_operativo', 'admin', 'super_admin'])

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
    return <AdminDashboard user={user} onLogout={logout} />
  }

  if (ADMIN_ROLES.has(user.role) && view === 'admin') {
    return <AdminDashboard user={user} onBackToPOS={() => setView('pos')} onLogout={logout} />
  }

  if (CASHIER_ROLES.has(user.role)) {
    return <CashierPOS user={user} onLogout={logout} onOpenAdmin={ADMIN_ROLES.has(user.role) ? () => setView('admin') : undefined} />
  }

  return <Login onLogin={setUser} />
}

export default App
