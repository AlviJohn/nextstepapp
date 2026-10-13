import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, Check, ListChecks, Moon, Star, Timer } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Backdrop, Logo } from '../components/ui'
import { PlanCards, PricingToggles, usePricing } from '../components/Pricing'

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
}

function HeroCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, rotateX: 12 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      style={{ perspective: 1000 }}
      className="relative mx-auto mt-16 max-w-3xl"
    >
      <div className="absolute -inset-x-10 -inset-y-6 rounded-[40px] bg-gradient-to-r from-periwinkle/20 via-iris/20 to-mint/20 blur-3xl" />
      <div className="glass ring-glow relative grid gap-6 rounded-[28px] p-6 text-left md:grid-cols-[1fr_200px] md:p-8">
        <div>
          <div className="flex gap-1.5">
            <div className="h-1.5 flex-1 rounded-full bg-gradient-to-r from-iris to-mint" />
            <div className="h-1.5 flex-1 rounded-full bg-white/40" />
            <div className="h-1.5 flex-1 rounded-full bg-white/10" />
          </div>
          <div className="eyebrow mt-6">Your next step · 2 of 3</div>
          <div className="mt-3 font-display text-3xl leading-tight md:text-5xl">Send the proposal draft to Priya</div>
          <div className="mt-8 flex gap-2">
            <span className="btn-glow pointer-events-none !h-10">
              <Check className="h-4 w-4" /> Done
            </span>
            <span className="btn-ghost pointer-events-none !h-10">Later</span>
          </div>
        </div>
        <div className="hidden flex-col items-center justify-center md:flex">
          <svg width="150" height="150" className="-rotate-90">
            <defs>
              <linearGradient id="hero-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#c4b5fd" />
                <stop offset="1" stopColor="#818cf8" />
              </linearGradient>
            </defs>
            <circle cx="75" cy="75" r="64" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="6" />
            <motion.circle
              cx="75"
              cy="75"
              r="64"
              fill="none"
              stroke="url(#hero-ring)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={402}
              initial={{ strokeDashoffset: 402 }}
              animate={{ strokeDashoffset: 402 * 0.38 }}
              transition={{ duration: 2.4, delay: 0.8, ease: 'easeOut' }}
              style={{ filter: 'drop-shadow(0 0 10px rgba(167,139,250,.5))' }}
            />
          </svg>
          <div className="-mt-[100px] mb-[52px] font-display text-4xl tabular-nums">15:32</div>
          <div className="text-xs text-mute">Focus</div>
        </div>
      </div>
    </motion.div>
  )
}

const BENEFITS = [
  {
    icon: ListChecks,
    title: 'Less deciding, more doing',
    body: 'You choose once, in the morning, while your head is clear. After that there’s no list to scan and no second-guessing. Just the next thing.',
  },
  {
    icon: Timer,
    title: 'Focus in honest blocks',
    body: 'A built-in Pomodoro timer keeps work in 25-minute stretches with real breaks, and quietly records where your time actually went.',
  },
  {
    icon: Moon,
    title: 'End the day on purpose',
    body: 'A two-minute review closes open loops and names tomorrow’s first step, so the morning starts with momentum instead of a blank page.',
  },
]

const STEPS = [
  { n: '01', title: 'Empty your head', body: 'Put every task in one place. Big, small, vague. It doesn’t need to be organised.' },
  { n: '02', title: 'Star three', body: 'Pick the three that would make today a good day. Drag them into order.' },
  { n: '03', title: 'Do the one on screen', body: 'NextStep shows only the current task. Finish it and the next one appears.' },
]

const FAQ = [
  {
    q: 'Why not just use my existing to-do app?',
    a: 'Keep it, if it works. NextStep is for the moment after the list is written, when the hard part is starting. Many people use it alongside a bigger system.',
  },
  { q: 'What if I finish my three early?', a: 'Pick three more. The limit is about focus, not about doing less.' },
  { q: 'Is the free plan actually useful?', a: 'Yes. The whole daily practice is free: priorities, focus view, timer and review. Pro adds routines and long-term insight.' },
  { q: 'Can I pay in rupees or dollars?', a: 'Both. Prices are shown in INR or USD, and checkout supports UPI, cards and netbanking in India, and international cards.' },
]

export default function Landing() {
  const { user } = useAuth()
  const p = usePricing()
  const primary = user ? { to: '/app', label: 'Open NextStep' } : { to: '/signup', label: 'Start free' }

  return (
    <div className="overflow-x-clip">
      <Backdrop />
      <header className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 md:px-6">
        <Logo />
        <nav className="flex items-center gap-1 text-sm">
          <a href="#how" className="hidden rounded-full px-3 py-2 text-soft hover:text-white sm:block">
            How it works
          </a>
          <a href="#pricing" className="hidden rounded-full px-3 py-2 text-soft hover:text-white sm:block">
            Pricing
          </a>
          {!user && (
            <Link to="/login" className="rounded-full px-3 py-2 text-soft hover:text-white">
              Sign in
            </Link>
          )}
          <Link to={primary.to} className="btn-primary ml-1 !py-2">
            {primary.label}
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-24 pt-14 text-center md:px-6 md:pt-24">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" /> A calmer way through a busy day
          </span>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-6 max-w-4xl font-display text-6xl leading-[0.95] tracking-tight md:text-8xl"
        >
          One task.
          <br />
          <span className="text-gradient italic">Then the next.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-soft"
        >
          When you have thirty things to do, the hardest part is choosing where to start. NextStep makes that choice once, then
          shows you only what&rsquo;s in front of you.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mt-9 flex flex-wrap justify-center gap-3"
        >
          <Link to={primary.to} className="btn-glow !h-12 !px-7 !text-[15px]">
            {primary.label} <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="#how" className="btn-ghost !h-12 !px-6">
            See how it works
          </a>
        </motion.div>
        <p className="mt-4 text-xs text-mute">Free to use. No card required.</p>
        <HeroCard />
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <div className="eyebrow">Why one at a time</div>
          <h2 className="mt-3 font-display text-4xl leading-tight md:text-6xl">A long list asks you to decide, over and over.</h2>
          <p className="mt-4 text-soft">
            Every glance at it is a small negotiation with yourself. NextStep takes the negotiation out, so your attention goes to the
            work instead.
          </p>
        </motion.div>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {BENEFITS.map((b, i) => (
            <motion.div key={b.title} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.08 }} className="glass rounded-3xl p-7">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-iris">
                <b.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-2xl">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-soft">{b.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-10 px-4 py-20 md:px-6">
        <motion.div {...fadeUp} className="text-center">
          <div className="eyebrow">How it works</div>
          <h2 className="mt-3 font-display text-4xl md:text-6xl">Three steps, every day.</h2>
        </motion.div>
        <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div key={s.n} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.08 }} className="bg-ink p-8">
              <div className="font-display text-5xl text-gradient">{s.n}</div>
              <h3 className="mt-6 text-lg font-medium">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mute">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-20 md:px-6">
        <motion.blockquote {...fadeUp} className="text-center">
          <Star className="mx-auto h-5 w-5 text-amber" />
          <p className="mt-6 font-display text-3xl leading-snug md:text-5xl">
            &ldquo;It isn&rsquo;t another to-do list. <span className="text-gradient italic">It&rsquo;s the part that comes after.</span>&rdquo;
          </p>
          <p className="mx-auto mt-6 max-w-lg text-sm leading-relaxed text-mute">
            No labels, projects or sync settings to maintain. If you need Gantt charts, this isn&rsquo;t for you. If you need to start,
            it might be.
          </p>
        </motion.blockquote>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-10 px-4 py-20 md:px-6">
        <motion.div {...fadeUp} className="mb-10 text-center">
          <div className="eyebrow">Pricing</div>
          <h2 className="mt-3 font-display text-4xl md:text-6xl">Free for the daily habit.</h2>
          <p className="mx-auto mt-3 max-w-lg text-soft">Pro is for when you want routines on autopilot and a clear look back at your weeks.</p>
        </motion.div>
        <div className="mb-8">
          <PricingToggles p={p} />
        </div>
        <PlanCards
          p={p}
          cta={{
            free: (
              <Link to={user ? '/app' : '/signup'} className="btn-ghost w-full">
                {user ? 'Open NextStep' : 'Start free'}
              </Link>
            ),
            pro: (
              <Link to={user ? '/app/upgrade' : '/signup?plan=pro'} className="btn-glow w-full !h-12">
                Try Pro
              </Link>
            ),
          }}
        />
      </section>

      <section className="mx-auto max-w-3xl px-4 py-20 md:px-6">
        <h2 className="mb-8 text-center font-display text-4xl">Questions</h2>
        <div className="divide-y divide-line rounded-3xl border border-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group p-6 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {f.q}
                <span className="text-mute transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 pt-10 text-center md:px-6">
        <h2 className="font-display text-5xl md:text-7xl">
          What&rsquo;s your <span className="text-gradient italic">next step?</span>
        </h2>
        <Link to={primary.to} className="btn-glow mt-8 !h-12 !px-8">
          {primary.label} <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-mute md:px-6">
          <Logo />
          <span>© {new Date().getFullYear()} NextStep</span>
        </div>
      </footer>
    </div>
  )
}
