import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, ListTodo, LogOut, Moon, Target } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { TimerProvider, useTimer } from '../lib/timer'
import { Backdrop, Logo, ProBadge, Spinner } from './ui'

const NAV = [
  { to: '/app', label: 'Focus', icon: Target, end: true },
  { to: '/app/plan', label: 'Plan', icon: ListTodo },
  { to: '/app/review', label: 'Review', icon: Moon },
  { to: '/app/insights', label: 'Insights', icon: BarChart3 },
]

export default function AppShell() {
  const { user, ready, logout } = useAuth()
  const location = useLocation()

  if (!ready)
    return (
      <div className="grid min-h-dvh place-items-center">
        <Backdrop />
        <Spinner />
      </div>
    )
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return (
    <TimerProvider>
    <div className="min-h-dvh pb-24 md:pb-10">
      <Backdrop />
      <header className="sticky top-0 z-30 border-b border-line bg-ink/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
          <Logo />
          <nav className="hidden items-center gap-1 rounded-full border border-line bg-white/[0.03] p-1 md:flex">
            {NAV.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `rounded-full px-4 py-1.5 text-sm transition ${isActive ? 'bg-white text-ink' : 'text-soft hover:text-white'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {user.email === 'dev@localhost' && (
              <span className="hidden rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber sm:inline" title="Signed in automatically on localhost. Sign out to test real login.">
                Dev
              </span>
            )}
            <MiniTimer />
            {user.is_pro ? (
              <NavLink to="/app/upgrade" aria-label="Your plan">
                <ProBadge />
              </NavLink>
            ) : (
              <NavLink to="/app/upgrade" className="btn-ghost !px-3.5 !py-1.5 text-xs">
                Go Pro
              </NavLink>
            )}
            <button onClick={logout} className="grid h-9 w-9 place-items-center rounded-full text-mute transition hover:bg-white/5 hover:text-white" title="Sign out" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-8 md:px-6 md:pt-12">
        <Outlet />
      </main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-4 rounded-2xl border border-line bg-ink/80 p-1.5 backdrop-blur-xl md:hidden">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] transition ${isActive ? 'bg-white/10 text-white' : 'text-mute'}`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
    </TimerProvider>
  )
}

function MiniTimer() {
  const timer = useTimer()
  const { pathname } = useLocation()
  if (!timer.running || pathname === '/app') return null
  const s = Math.ceil(timer.remaining)
  return (
    <NavLink to="/app" className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs tabular-nums">
      <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${timer.mode === 'focus' ? 'bg-iris' : 'bg-mint'}`} />
      {String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}
    </NavLink>
  )
}
