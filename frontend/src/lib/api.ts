export type Size = 'XS' | 'S' | 'M' | 'L' | 'XL'

export type Task = {
  id: number
  title: string
  notes: string
  status: 'open' | 'done'
  focus_date: string | null
  rank: number | null
  done_date: string | null
  importance: number | null // 1 (low) … 5 (critical)
  size: Size | null
  focus_seconds: number
  pomodoros: number
  is_template: boolean
  recurrence: 'none' | 'daily' | 'weekdays' | 'weekly'
  recurrence_day: number | null
  template_id: number | null
  created_at: string
}

export type User = {
  id: number
  email: string
  name: string
  plan: string
  plan_interval: string | null
  plan_renews_at: string | null
  is_pro: boolean
  auto_renews: boolean
}

export type Today = {
  date: string
  priorities: Task[]
  next: Task | null
  done_today: Task[]
  carryover: Task[]
  focus_seconds_today: number
  pomodoros_today: number
  has_review: boolean
  inbox_count: number
}

export type Suggestion = { task: Task; score: number; reason: string }
export type SuggestOut = { slots: number; suggestions: Suggestion[]; alternates: Suggestion[] }

export type Review = {
  date: string
  mood: number | null
  wins: string
  blockers: string
  tomorrow: string
}

export type DaySummary = {
  date: string
  completed: number
  focus_minutes: number
  pomodoros: number
  mood: number | null
  tasks: string[]
}

export type WeeklyReport = {
  start: string
  end: string
  days: DaySummary[]
  total_completed: number
  total_focus_minutes: number
  total_pomodoros: number
  avg_mood: number | null
  streak: number
  best_day: string | null
  previous_week_completed: number
}

export type Currency = 'INR' | 'USD'
export type Interval = 'monthly' | 'yearly'

export type BillingConfig = {
  provider: 'razorpay' | 'demo' | 'none'
  mode: 'subscription' | 'one_time' | 'demo' | 'none'
  prices: Record<Currency, Record<Interval, number>>
  available: string[]
}

export class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const TOKEN_KEY = 'nextstep.token'

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* storage unavailable */
    }
  },
}

let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get()
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized()
    const detail = data?.detail
    let message = 'Something went wrong'
    let code: string | undefined
    if (typeof detail === 'string') message = detail
    else if (Array.isArray(detail)) message = detail[0]?.msg?.replace(/^Value error, /, '') ?? message
    else if (detail?.message) {
      message = detail.message
      code = detail.code
    }
    throw new ApiError(res.status, message, code)
  }
  return data as T
}

/** The user's local calendar date — "today" is always the user's today, not the server's. */
export function localDate(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatMinutes(totalSeconds: number): string {
  const m = Math.round(totalSeconds / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function guessCurrency(): Currency {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta' ? 'INR' : 'USD'
  } catch {
    return 'INR'
  }
}

export function formatPrice(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: amount % 1 ? 2 : 0,
  }).format(amount)
}
