import { supabase } from '../supabase'

const SESSION_KEY = 'pos_chuladas_user_session_v1'
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000

export function readUserSession() {
  try {
    const session = JSON.parse(window.localStorage.getItem(SESSION_KEY) || 'null')
    if (!session?.user?.id || !session.savedAt) return null
    if (Date.now() - Number(session.savedAt) > SESSION_MAX_AGE_MS) {
      clearUserSession()
      return null
    }
    return normalizeUser(session.user)
  } catch {
    return null
  }
}

export function saveUserSession(user) {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({
      user: normalizeUser(user),
      savedAt: Date.now()
    }))
  } catch {
    // localStorage is best-effort; login should keep working without it.
  }
}

export function clearUserSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY)
  } catch {
    // Ignore storage cleanup failures.
  }
}

export async function refreshUserSession(user) {
  if (!supabase || !user?.id) return user

  const { data, error } = await supabase
    .from('users')
    .select('id, name, role, active')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !data || data.active === false) {
    if (data?.active === false) clearUserSession()
    return data?.active === false ? null : user
  }

  saveUserSession(data)
  return normalizeUser(data)
}

export function normalizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    role: user.role || 'cashier',
    active: user.active !== false
  }
}
