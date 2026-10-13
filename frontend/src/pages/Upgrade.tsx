import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { api, parseDate, type User } from '../lib/api'
import { useAuth } from '../lib/auth'
import { PlanCards, PricingToggles, usePricing } from '../components/Pricing'
import { PageHeader, useToast } from '../components/ui'

type CheckoutResponse =
  | { provider: 'demo'; user: User }
  | { provider: 'razorpay'; key_id: string; subscription_id: string; email: string; name: string }

type RazorpayResult = { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void }
  }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load the payment window'))
    document.body.appendChild(s)
  })
}

export default function Upgrade() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const p = usePricing()
  const [busy, setBusy] = useState(false)

  const key = `${p.currency}_${p.interval}`
  const available = !p.config || p.config.available.includes(key)
  const unavailable = p.config?.provider === 'none'

  const checkout = async () => {
    setBusy(true)
    try {
      const res = await api<CheckoutResponse>('/billing/checkout', { body: { interval: p.interval, currency: p.currency } })
      if (res.provider === 'demo') {
        setUser(res.user)
        toast('Pro unlocked (demo mode, no charge).')
        return
      }
      await loadRazorpay()
      const rzp = new window.Razorpay!({
        key: res.key_id,
        subscription_id: res.subscription_id,
        name: 'NextStep Pro',
        description: p.interval === 'yearly' ? 'Yearly plan' : 'Monthly plan',
        prefill: { email: res.email, name: res.name },
        theme: { color: '#818cf8' },
        handler: async (r: RazorpayResult) => {
          try {
            setUser(await api<User>('/billing/verify', { body: r }))
            toast('Welcome to Pro.')
          } catch (e) {
            toast((e as Error).message, 'error')
          }
        },
      })
      rzp.open()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (!confirm('Cancel Pro? You keep access until the end of the current period.')) return
    setUser(await api<User>('/billing/cancel', { body: {} }))
    toast('Subscription cancelled.')
  }

  if (user?.is_pro)
    return (
      <div className="mx-auto max-w-xl">
        <div className="glass ring-glow rounded-3xl p-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-iris to-mint text-ink">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="font-display text-4xl">You're on Pro</h1>
          <p className="mt-2 text-soft">
            {user.plan_interval === 'yearly' ? 'Yearly' : 'Monthly'} plan
            {user.plan_renews_at && ` · access through ${parseDate(user.plan_renews_at.slice(0, 10)).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`}
          </p>
          <p className="mt-6 text-sm text-mute">Thank you. Paid plans are what keep NextStep focused, ad-free and independent.</p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/app/insights" className="btn-primary">
              Open weekly report
            </Link>
            <button onClick={cancel} className="btn-ghost">
              Cancel plan
            </button>
          </div>
        </div>
      </div>
    )

  return (
    <>
      <PageHeader
        eyebrow="NextStep Pro"
        title={
          <>
            For people who've made it <span className="text-gradient italic">a habit.</span>
          </>
        }
        sub="Free covers the daily practice, and always will. Pro adds the parts that help over weeks: routines that plan themselves, and a clear look back."
      />
      <div className="mb-8">
        <PricingToggles p={p} />
      </div>
      <PlanCards
        p={p}
        cta={{
          free: <div className="btn-ghost w-full cursor-default">Your current plan</div>,
          pro: (
            <button onClick={checkout} disabled={busy || !available || unavailable} className="btn-glow w-full !h-12">
              {unavailable ? 'Payments open soon' : !available ? 'Not available in this currency yet' : busy ? 'Opening…' : 'Upgrade to Pro'}
            </button>
          ),
        }}
      />
      <p className="mt-6 text-center text-xs text-mute">
        {p.config?.provider === 'demo'
          ? 'Demo mode: upgrading is instant and free while payments are being set up.'
          : 'Secure checkout by Razorpay. Cards, UPI and netbanking in India; international cards in USD.'}
      </p>
    </>
  )
}
