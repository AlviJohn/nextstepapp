import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Backdrop, Logo } from '../components/ui'
import GoogleButton from '../components/GoogleButton'

export default function Auth({ mode }: { mode: 'login' | 'signup' }) {
  const { user, login, signup, googleLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const from = (location.state as { from?: string } | null)?.from
  const dest = params.get('plan') === 'pro' ? '/app/upgrade' : from ?? '/app'
  if (user) return <Navigate to={dest} replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'signup') await signup(form.email, form.password, form.name)
      else await login(form.email, form.password)
      navigate(dest, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const withGoogle = async (credential: string) => {
    setError('')
    try {
      await googleLogin(credential)
      navigate(dest, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const isSignup = mode === 'signup'
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-12">
      <Backdrop />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <Logo />
        </div>
        <div className="glass ring-glow rounded-3xl p-7">
          <h1 className="font-display text-4xl">{isSignup ? 'Start with one step' : 'Welcome back'}</h1>
          <p className="mt-1.5 text-sm text-mute">{isSignup ? 'Free forever. Takes ten seconds.' : 'Pick up where you left off.'}</p>
          <div className="mt-6">
            <GoogleButton onCredential={withGoogle} text={isSignup ? 'signup_with' : 'signin_with'} />
          </div>
          <form onSubmit={submit} className="space-y-3">
            {isSignup && (
              <input
                className="input"
                placeholder="First name"
                autoComplete="given-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            )}
            <input
              className="input"
              type="email"
              required
              placeholder="Email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <input
              className="input"
              type="password"
              required
              minLength={isSignup ? 8 : undefined}
              placeholder={isSignup ? 'Password (8+ characters)' : 'Password'}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <button disabled={busy} className="btn-glow w-full !h-12">
              {busy ? 'One moment…' : isSignup ? 'Create account' : 'Sign in'} <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-sm text-mute">
          {isSignup ? 'Already have an account? ' : 'New here? '}
          <Link to={isSignup ? '/login' : '/signup'} className="text-white hover:underline">
            {isSignup ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
