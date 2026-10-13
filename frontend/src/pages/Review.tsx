import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, CornerDownRight } from 'lucide-react'
import { api, formatMinutes, localDate, type Review as ReviewT, type Today } from '../lib/api'
import { useAuth } from '../lib/auth'
import { PageHeader, Spinner, Stat, useToast } from '../components/ui'

export const MOODS = [
  { v: 1, label: 'Drained', glyph: '◌' },
  { v: 2, label: 'Flat', glyph: '◔' },
  { v: 3, label: 'Steady', glyph: '◑' },
  { v: 4, label: 'Good', glyph: '◕' },
  { v: 5, label: 'Great', glyph: '●' },
]

export default function Review() {
  const { user } = useAuth()
  const toast = useToast()
  const date = localDate()
  const [today, setToday] = useState<Today | null>(null)
  const [review, setReview] = useState<ReviewT | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([api<Today>(`/today?date=${date}`), api<ReviewT>(`/reviews/${date}`)])
      .then(([t, r]) => {
        setToday(t)
        setReview(r)
      })
      .catch((e) => toast(e.message, 'error'))
  }, [date, toast])

  if (!today || !review)
    return (
      <div className="grid h-[50vh] place-items-center">
        <Spinner />
      </div>
    )

  const unfinished = today.priorities.filter((t) => t.status === 'open')
  const set = (patch: Partial<ReviewT>) => setReview({ ...review, ...patch })

  const save = async () => {
    setSaving(true)
    try {
      const { mood, wins, blockers, tomorrow } = review
      await api(`/reviews/${date}`, { method: 'PUT', body: { mood, wins, blockers, tomorrow } })
      toast('Day closed. See you tomorrow.')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const fields: { key: 'wins' | 'blockers' | 'tomorrow'; label: string; placeholder: string }[] = [
    { key: 'wins', label: 'What moved forward?', placeholder: 'Even small things count.' },
    { key: 'blockers', label: 'What got in the way?', placeholder: 'Meetings, unclear asks, low energy…' },
    { key: 'tomorrow', label: 'The first step tomorrow', placeholder: 'Something you can start within five minutes of sitting down.' },
  ]

  return (
    <>
      <PageHeader
        eyebrow="End of day"
        title={
          <>
            Close the loop, <span className="text-gradient italic">then log off.</span>
          </>
        }
        sub="Two minutes here means tomorrow starts with a decision already made."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 space-y-6">
          <div className="glass rounded-3xl p-6">
            <div className="eyebrow mb-4">How did today feel?</div>
            <div className="grid grid-cols-5 gap-2">
              {MOODS.map((m) => (
                <button
                  key={m.v}
                  onClick={() => set({ mood: m.v })}
                  className={`flex flex-col items-center gap-2 rounded-2xl border py-4 transition ${
                    review.mood === m.v ? 'border-iris/50 bg-iris/10 text-white' : 'border-line text-mute hover:border-white/20 hover:text-white'
                  }`}
                >
                  <span className="text-2xl leading-none">{m.glyph}</span>
                  <span className="text-xs">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {fields.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-2 block font-display text-2xl">{f.label}</span>
              <textarea
                value={review[f.key]}
                onChange={(e) => set({ [f.key]: e.target.value })}
                placeholder={f.placeholder}
                rows={3}
                maxLength={2000}
                className="input resize-none"
              />
            </label>
          ))}

          <button onClick={save} disabled={saving} className="btn-glow !h-12 !px-8">
            {saving ? 'Saving…' : today.has_review ? 'Update review' : 'Close the day'}
          </button>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Finished" value={today.done_today.length} />
            <Stat label="Focused" value={formatMinutes(today.focus_seconds_today)} hint={`${today.pomodoros_today} pomodoros`} />
          </div>
          <div className="glass rounded-3xl p-5">
            <div className="eyebrow mb-3">Finished</div>
            {today.done_today.length ? (
              <ul className="space-y-2">
                {today.done_today.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-mint" /> {t.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-mute">Nothing marked done yet. Some days are like that. Write down why below.</p>
            )}
            {unfinished.length > 0 && (
              <>
                <div className="eyebrow mb-3 mt-6">Rolls to tomorrow</div>
                <ul className="space-y-2">
                  {unfinished.map((t) => (
                    <li key={t.id} className="flex items-start gap-2 text-sm text-mute">
                      <CornerDownRight className="mt-0.5 h-4 w-4 shrink-0" /> {t.title}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          {!user?.is_pro && (
            <Link to="/app/insights" className="block rounded-3xl border border-line p-5 text-sm text-mute transition hover:border-white/20">
              <span className="text-soft">Reviews add up.</span> With Pro, each week turns into a short report: what you finished, where the
              time went, and how your days felt. →
            </Link>
          )}
        </aside>
      </div>
    </>
  )
}
