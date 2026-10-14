import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { api, formatPrice, parseDate, type User } from '../lib/api'
import { useAuth } from '../lib/auth'
import { PlanCards, PricingToggles, usePricing } from '../components/Pricing'
import { PageHeader, useToast } from '../components/ui'

type CheckoutResponse =
  | { provider: 'demo'; mode: 'demo'; user: User }
  | { provider: 'razorpay'; mode: 'subscription'; key_id: string; subscription_id: string; email: string; name: string }
  | {
      provider: 'razorpay'
      mode: 'one_time'
      key_id: string
      order_id: string
      amount: number
      currency: string
      email: string
      name: string
    }

type RazorpayResult = {
  razorpay_payment_id: string
  razorpay_signature: string
  razorpay_subscription_id?: string
  razorpay_order_id?: string
}

type RazorpayInstance = { open: () => void; on: (event: string, cb: (r: { error?: { description?: string } }) => void) => void }

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => RazorpayInstance
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

const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)

const longDate = (iso: string) =>
  parseDate(iso.slice(0, 10)).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

export default function Upgrade() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const p = usePricing()
  const [busy, setBusy] = useState(false)

  const key = `${p.currency}_${p.interval}`
  const available = !p.config || p.config.available.includes(key)
  const unavailable = p.config?.provider === 'none'
  const oneTime = p.config?.mode === 'one_time'
  const price = formatPrice(p.prices[p.currency][p.interval], p.currency)

  const checkout = async () => {
    setBusy(true)
    try {
      const res = await api<CheckoutResponse>('/billing/checkout', { body: { interval: p.interval, currency: p.currency } })
      if (res.mode === 'demo') {
        setUser(res.user)
        toast('Pro unlocked (demo mode, no charge).')
        return
      }
      await loadRazorpay()
      const wasPro = !!user?.is_pro
      const rzp = new window.Razorpay!({
        key: res.key_id,
        name: 'NextStep Pro',
        description:
          res.mode === 'one_time'
            ? p.interval === 'yearly'
              ? '12 months of Pro'
              : '1 month of Pro'
            : p.interval === 'yearly'
              ? 'Yearly plan'
              : 'Monthly plan',
        ...(res.mode === 'one_time'
          ? { order_id: res.order_id, amount: res.amount, currency: res.currency }
          : { subscription_id: res.subscription_id }),
        prefill: { email: res.email, name: res.name },
        notes: { app: 'nextstep' },
        theme: { color: '#818cf8' },
        handler: async (r: RazorpayResult) => {
          try {
            setUser(await api<User>('/billing/verify', { body: r }))
            toast(wasPro ? 'Pro extended. Thank you.' : 'Welcome to Pro.')
          } catch (e) {
            toast(`${(e as Error).message}. If you were charged, Pro will be applied shortly.`, 'error')
          }
        },
        modal: { ondismiss: () => toast('Payment cancelled. You haven\u2019t been charged.') },
      })
      rzp.on('payment.failed', (r) => toast(r.error?.description || 'Payment failed. Please try another method.', 'error'))
      rzp.open()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (!confirm('Cancel Pro? You keep access until the end of the current period.')) return
    try {
      setUser(await api<User>('/billing/cancel', { body: {} }))
      toast('Subscription cancelled.')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const devReset = async () => {
    try {
      setUser(await api<User>('/billing/dev-reset', { body: {} }))
      toast('Back on Free. You can test checkout again.')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
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
            {user.auto_renews
              ? `${user.plan_interval === 'yearly' ? 'Yearly' : 'Monthly'} plan${user.plan_renews_at ? ` · renews ${longDate(user.plan_renews_at)}` : ''}`
              : user.plan_renews_at
                ? `Pro through ${longDate(user.plan_renews_at)}`
                : 'Pro'}
          </p>
          {oneTime && !user.auto_renews && (
            <p className="mt-1 text-xs text-mute">This is a one-time pass, so it won&rsquo;t renew or charge you again.</p>
          )}
          <p className="mt-6 text-sm text-mute">Thank you. Paid plans are what keep NextStep focused, ad-free and independent.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/app/insights" className="btn-primary">
              Open weekly report
            </Link>
            {(user.auto_renews || p.config?.mode === 'demo') && (
              <button onClick={cancel} className="btn-ghost">
                Cancel plan
              </button>
            )}
          </div>
          {oneTime && !user.auto_renews && (
            <div className="mt-8 border-t border-line pt-6">
              <div className="eyebrow mb-4">Extend your pass</div>
              <PricingToggles p={p} />
              <button onClick={checkout} disabled={busy || !available} className="btn-glow mt-5 w-full !h-12">
                {busy ? 'Opening\u2026' : `Add ${p.interval === 'yearly' ? '12 months' : '1 month'} · ${price}`}
              </button>
              <p className="mt-2 text-[11px] text-mute">Added on top of your current end date.</p>
            </div>
          )}
          {isLocalhost && (
            <button
              onClick={devReset}
              className="mt-6 rounded-full border border-dashed border-amber/40 px-3 py-1 text-[11px] text-amber transition hover:bg-amber/10"
              title="Only shown on localhost; the server refuses this anywhere else"
            >
              Reset to Free (local testing only)
            </button>
          )}
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
              {unavailable
                ? 'Payments open soon'
                : !available
                  ? 'Not available in this currency yet'
                  : busy
                    ? 'Opening…'
                    : oneTime
                      ? `Get Pro · ${price}`
                      : 'Upgrade to Pro'}
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
