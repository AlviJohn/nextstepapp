import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { api, formatPrice, guessCurrency, type BillingConfig, type Currency, type Interval } from '../lib/api'

export const FREE_FEATURES = [
  'Unlimited days of three priorities',
  'The one-task focus view',
  'Pomodoro timer with breaks',
  'End-of-day review',
  'Last 7 days of history',
]

export const PRO_FEATURES = [
  'Everything in Free',
  'Routines that add themselves (daily, weekdays, weekly)',
  'Weekly report: output, focus time, mood, streaks',
  '90 days of history',
  'Unlimited open tasks',
]

const FALLBACK_PRICES: BillingConfig['prices'] = {
  INR: { monthly: 299, yearly: 1788 },
  USD: { monthly: 5, yearly: 36 },
}

export function usePricing() {
  const [config, setConfig] = useState<BillingConfig | null>(null)
  const [currency, setCurrency] = useState<Currency>(guessCurrency)
  const [interval, setInterval] = useState<Interval>('yearly')
  useEffect(() => {
    api<BillingConfig>('/billing/config').then(setConfig).catch(() => {})
  }, [])
  const prices = config?.prices ?? FALLBACK_PRICES
  const monthlyEquivalent = interval === 'yearly' ? prices[currency].yearly / 12 : prices[currency].monthly
  const savings = Math.round((1 - prices[currency].yearly / 12 / prices[currency].monthly) * 100)
  return { config, currency, setCurrency, interval, setInterval, prices, monthlyEquivalent, savings }
}

export function PricingToggles({ p }: { p: ReturnType<typeof usePricing> }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <div className="flex rounded-full border border-line bg-white/[0.03] p-1 text-sm">
        {(['monthly', 'yearly'] as Interval[]).map((i) => (
          <button
            key={i}
            onClick={() => p.setInterval(i)}
            className={`rounded-full px-4 py-1.5 capitalize transition ${p.interval === i ? 'bg-white text-ink' : 'text-soft hover:text-white'}`}
          >
            {i}
            {i === 'yearly' && <span className={`ml-1.5 text-xs ${p.interval === i ? 'text-violet-600' : 'text-mint'}`}>−{p.savings}%</span>}
          </button>
        ))}
      </div>
      <div className="flex rounded-full border border-line bg-white/[0.03] p-1 text-xs">
        {(['INR', 'USD'] as Currency[]).map((c) => (
          <button
            key={c}
            onClick={() => p.setCurrency(c)}
            className={`rounded-full px-3 py-1.5 transition ${p.currency === c ? 'bg-white/10 text-white' : 'text-mute hover:text-white'}`}
          >
            {c === 'INR' ? '₹ INR' : '$ USD'}
          </button>
        ))}
      </div>
    </div>
  )
}

export function PlanCards({ p, cta }: { p: ReturnType<typeof usePricing>; cta: { free: React.ReactNode; pro: React.ReactNode } }) {
  return (
    <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
      <div className="rounded-3xl border border-line bg-white/[0.02] p-7">
        <div className="eyebrow">Free</div>
        <div className="mt-3 font-display text-5xl">{formatPrice(0, p.currency)}</div>
        <div className="mt-1 text-sm text-mute">Forever. No card needed.</div>
        <ul className="mt-6 space-y-3 text-sm text-soft">
          {FREE_FEATURES.map((f) => (
            <li key={f} className="flex gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-mute" /> {f}
            </li>
          ))}
        </ul>
        <div className="mt-8">{cta.free}</div>
      </div>
      <div className="glass ring-glow relative overflow-hidden rounded-3xl p-7">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-iris/25 blur-3xl" />
        <div className="relative">
          <div className="eyebrow !text-iris">Pro</div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-5xl">{formatPrice(p.monthlyEquivalent, p.currency)}</span>
            <span className="text-sm text-mute">/ month</span>
          </div>
          <div className="mt-1 text-sm text-mute">
            {p.interval === 'yearly'
              ? `${formatPrice(p.prices[p.currency].yearly, p.currency)} billed yearly`
              : 'Billed monthly. Cancel anytime.'}
          </div>
          <ul className="mt-6 space-y-3 text-sm">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-mint" /> {f}
              </li>
            ))}
          </ul>
          <div className="mt-8">{cta.pro}</div>
        </div>
      </div>
    </div>
  )
}
