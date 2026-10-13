import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setUnauthorizedHandler, tokenStore, type User } from './api'

type AuthState = {
  user: User | null
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name: string) => Promise<void>
  googleLogin: (credential: string) => Promise<void>
  logout: () => void
  setUser: (u: User) => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

// Local dev: sign in automatically on localhost. The server only honours this when it's
// running on your machine (never on Vercel). Signing out pauses it for the tab, so the
// real login and signup screens can still be tested.
const DEV_OFF_KEY = 'nextstep.devlogin.off'
const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)

function devLoginPaused() {
  try {
    return sessionStorage.getItem(DEV_OFF_KEY) === '1'
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  const logout = useCallback(() => {
    try {
      sessionStorage.setItem(DEV_OFF_KEY, '1')
    } catch {
      /* ignore */
    }
    tokenStore.set(null)
    setUser(null)
  }, [])

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      if (!isLocalhost || devLoginPaused()) return
      try {
        const res = await api<{ token: string; user: User }>('/auth/dev-login', { body: {} })
        tokenStore.set(res.token)
        setUser(res.user)
      } catch {
        /* dev login disabled on this server */
      }
      return
    }
    setUser(await api<User>('/me'))
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    refresh()
      .catch(() => logout())
      .finally(() => setReady(true))
  }, [logout, refresh])

  const finish = (res: { token: string; user: User }) => {
    tokenStore.set(res.token)
    setUser(res.user)
  }

  const value: AuthState = {
    user,
    ready,
    logout,
    setUser,
    refresh,
    login: async (email, password) =>
      finish(await api('/auth/login', { body: { email, password } })),
    signup: async (email, password, name) =>
      finish(await api('/auth/signup', { body: { email, password, name } })),
    googleLogin: async (credential) => finish(await api('/auth/google', { body: { credential } })),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
