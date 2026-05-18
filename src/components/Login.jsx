import { useState } from 'react'
import { supabase } from '../supabase'

function Login({ onLogin }) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (loading) return

    setError('')

    if (!name.trim() || !pin.trim()) {
      setError('Ingresa nombre y PIN.')
      return
    }

    if (!supabase) {
      setError('Supabase no esta configurado para iniciar sesion.')
      return
    }

    setLoading(true)

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('name', name.trim())
      .eq('pin', pin.trim())
      .single()

    setLoading(false)

    if (error || !data) {
      setError('Datos incorrectos')
      return
    }

    onLogin(data)
  }

  function submitOnEnter(event) {
    if (event.key === 'Enter') {
      handleLogin()
    }
  }

  return (
    <main style={page}>
      <section style={card}>
        <div style={headerBlock}>
          <p style={eyebrow}>POS Chuladas V2</p>
          <h1 style={title}>Inicio de caja</h1>
          <p style={subtitle}>Ingresa nombre y PIN.</p>
        </div>

        <input
          autoFocus
          placeholder="Nombre"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={submitOnEnter}
          style={input}
        />

        <input
          placeholder="PIN"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          onKeyDown={submitOnEnter}
          style={input}
        />

        {error && <div style={errorBox}>{error}</div>}

        <button type="button" disabled={loading} onClick={handleLogin} style={{ ...button, opacity: loading ? 0.55 : 1 }}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </section>
    </main>
  )
}

const page = {
  minHeight: '100dvh',
  background: '#f4f4f4',
  display: 'grid',
  placeItems: 'center',
  padding: 'calc(28px + env(safe-area-inset-top)) 20px calc(28px + env(safe-area-inset-bottom))',
  boxSizing: 'border-box',
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  touchAction: 'pan-y',
  WebkitOverflowScrolling: 'touch'
}

const card = {
  width: '100%',
  maxWidth: 430,
  background: '#ffffff',
  border: '1px solid rgba(17, 17, 17, 0.84)',
  borderRadius: 30,
  padding: '28px 24px 24px',
  display: 'grid',
  gap: 17,
  boxShadow: '0 18px 38px rgba(17, 17, 17, 0.07)',
  boxSizing: 'border-box',
  transition: 'border-color 140ms ease, box-shadow 140ms ease'
}

const headerBlock = {
  marginBottom: 8,
  textAlign: 'center'
}

const eyebrow = {
  margin: 0,
  color: '#666666',
  fontSize: 13,
  fontWeight: 700,
  textTransform: 'uppercase'
}

const title = {
  margin: '8px 0 4px',
  color: '#111111',
  fontSize: 34,
  lineHeight: 1,
  fontWeight: 720,
  letterSpacing: 0
}

const subtitle = {
  margin: 0,
  color: '#555555',
  fontSize: 17
}

const input = {
  width: '100%',
  minHeight: 60,
  border: '1px solid rgba(17, 17, 17, 0.86)',
  borderRadius: 19,
  background: '#ffffff',
  color: '#111111',
  fontSize: 18,
  fontWeight: 560,
  padding: '0 16px',
  boxSizing: 'border-box',
  transition: 'border-color 140ms ease, box-shadow 140ms ease'
}

const button = {
  width: '100%',
  minHeight: 60,
  border: 'none',
  borderRadius: 22,
  background: '#111111',
  color: '#ffffff',
  fontSize: 18,
  fontWeight: 720,
  boxShadow: '0 10px 18px rgba(17, 17, 17, 0.14)',
  transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease'
}

const errorBox = {
  border: '1px solid #fecaca',
  borderRadius: 18,
  background: '#fff5f5',
  color: '#991b1b',
  padding: 12,
  textAlign: 'center',
  fontSize: 15,
  fontWeight: 700
}

export default Login
