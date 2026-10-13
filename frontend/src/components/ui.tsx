import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { Check, Lock, Sparkles } from 'lucide-react'

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`group inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-7 w-7 transition group-hover:rotate-[-6deg]" aria-hidden>
        <defs>
          <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#c4b5fd" />
            <stop offset="1" stopColor="#5eead4" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" />
        <path d="M10 22V10l12 12V10" fill="none" stroke="url(#logo-g)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-[22px] leading-none tracking-tight">NextStep</span>
    </Link>
  )
}

export function Backdrop() {
  return (
    <>
      <div className="aurora" />
      <div className="grain" />
    </>
  )
}

export function ProBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-iris/30 bg-iris/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-iris ${className}`}>
      <Sparkles className="h-3 w-3" /> Pro
    </span>
  )
}

/** Shows real UI blurred behind a calm explanation of what Pro adds. */
export function ProGate({ title, children, points }: { title: string; children: ReactNode; points: string[] }) {
  return (
    <div className="relative overflow-hidden rounded-3xl">
      <div className="pointer-events-none select-none blur-[6px] opacity-60" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 grid place-items-center bg-ink/40 p-6">
        <div className="glass ring-glow max-w-sm rounded-2xl p-6 text-center">
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-iris/15 text-iris">
            <Lock className="h-4 w-4" />
          </div>
          <h3 className="font-display text-2xl">{title}</h3>
          <ul className="mt-4 space-y-2 text-left text-sm text-soft">
            {points.map((p) => (
              <li key={p} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-mint" /> {p}
              </li>
            ))}
          </ul>
          <Link to="/app/upgrade" className="btn-glow mt-5 w-full">
            See NextStep Pro
          </Link>
        </div>
      </div>
    </div>
  )
}

type Toast = { id: number; text: string; tone: 'ok' | 'error' }
const ToastContext = createContext<(text: string, tone?: Toast['tone']) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-8">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              className={`glass rounded-full px-4 py-2 text-sm shadow-xl ${t.tone === 'error' ? 'text-rose-200' : 'text-white'}`}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="glass rounded-2xl px-4 py-3.5">
      <div className="eyebrow">{label}</div>
      <div className="mt-1.5 font-display text-3xl leading-none">{value}</div>
      {hint && <div className="mt-1.5 text-xs text-mute">{hint}</div>}
    </div>
  )
}

export function PageHeader({ eyebrow, title, sub, right }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight md:text-5xl">{title}</h1>
        {sub && <p className="mt-2 max-w-xl text-soft">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-iris" />
}
