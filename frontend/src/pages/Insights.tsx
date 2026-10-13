import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Flame, TrendingDown, TrendingUp } from 'lucide-react'
import { ApiError, api, formatMinutes, localDate, parseDate, type DaySummary, type WeeklyReport } from '../lib/api'
import { useAuth } from '../lib/auth'
import { PageHeader, ProGate, Spinner, Stat } from '../components/ui'
import { MOODS } from './Review'

type History = { days: DaySummary[]; limited: boolean; streak: number }

const weekday = (d: string) => parseDate(d).toLocaleDateString(undefined, { weekday: 'short' })
const longDate = (d: string) => parseDate(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })

// Illustrative data shown blurred behind the Pro gate.
const SAMPLE: WeeklyReport = {
  start: '',
  end: '',
  days: [3, 4, 2, 5, 3, 1, 4].map((c, i) => ({
    date: localDate(new Date(Date.now() - (6 - i) * 864e5)),
    completed: c,
    focus_minutes: c * 30,
    pomodoros: c,
    mood: 3 + (i % 3),
    tasks: [],
  })),
  total_completed: 22,
  total_focus_minutes: 660,
  total_pomodoros: 22,
  avg_mood: 3.9,
  streak: 6,
  best_day: null,
  previous_week_completed: 17,
}

const CHART_H = 160

function Report({ r }: { r: WeeklyReport }) {
  const max = Math.max(1, ...r.days.map((d) => d.completed))
  const maxFocus = Math.max(1, ...r.days.map((d) => d.focus_minutes))
  const delta = r.total_completed - r.previous_week_completed
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Finished"
          value={r.total_completed}
          hint={
            <span className="inline-flex items-center gap-1">
              {delta >= 0 ? <TrendingUp className="h-3 w-3 text-mint" /> : <TrendingDown className="h-3 w-3 text-rose-300" />}
              {delta >= 0 ? '+' : ''}
              {delta} vs last week
            </span>
          }
        />
        <Stat label="Focus" value={formatMinutes(r.total_focus_minutes * 60)} hint={`${r.total_pomodoros} pomodoros`} />
        <Stat
          label="Streak"
          value={
            <span className="inline-flex items-center gap-1.5">
              {r.streak}
              <Flame className="h-5 w-5 text-amber" />
            </span>
          }
          hint="days with something finished"
        />
        <Stat label="Avg. mood" value={r.avg_mood ?? '—'} hint={r.avg_mood ? MOODS[Math.round(r.avg_mood) - 1]?.label : 'Review to track'} />
      </div>

      <div className="glass rounded-3xl p-6">
        <div className="flex items-center justify-between">
          <div className="eyebrow">Last 7 days</div>
          <div className="flex gap-4 text-xs text-mute">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-iris" /> Tasks
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-mint" /> Focus
            </span>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-7 items-end gap-3">
          {r.days.map((d, i) => (
            <div key={d.date} className="flex flex-col gap-2" title={`${d.completed} done · ${d.focus_minutes} min focus`}>
              <div className="flex items-end justify-center gap-1" style={{ height: CHART_H }}>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: Math.max(3, (d.completed / max) * CHART_H) }}
                  transition={{ delay: i * 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="w-3 rounded-full bg-gradient-to-t from-periwinkle to-iris md:w-4"
                />
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: Math.max(3, (d.focus_minutes / maxFocus) * CHART_H) }}
                  transition={{ delay: i * 0.05 + 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="w-3 rounded-full bg-gradient-to-t from-teal-600 to-mint md:w-4"
                />
              </div>
              <div className="text-center text-xs text-mute">{weekday(d.date)}</div>
            </div>
          ))}
        </div>
        {r.best_day && (
          <p className="mt-6 border-t border-line pt-4 text-sm text-soft">
            Your strongest day was <span className="text-white">{longDate(r.best_day)}</span>. Worth noticing what made it work.
          </p>
        )}
      </div>
    </div>
  )
}

export default function Insights() {
  const { user } = useAuth()
  const end = localDate()
  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [history, setHistory] = useState<History | null>(null)

  useEffect(() => {
    api<History>(`/insights/history?end=${end}&days=90`).then(setHistory)
    if (user?.is_pro)
      api<WeeklyReport>(`/insights/weekly?end=${end}`)
        .then(setReport)
        .catch((e) => {
          if (!(e instanceof ApiError && e.status === 402)) throw e
        })
  }, [end, user?.is_pro])

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title={
          <>
            Look back, <span className="text-gradient italic">briefly.</span>
          </>
        }
        sub="Not a productivity score. Just enough of a pattern to plan a better week."
      />

      <section className="mb-12">
        <h2 className="mb-4 font-display text-3xl">This week</h2>
        {user?.is_pro ? (
          report ? (
            <Report r={report} />
          ) : (
            <Spinner />
          )
        ) : (
          <ProGate
            title="Your weekly report"
            points={[
              'Tasks finished and focus time, day by day',
              'Streaks and how this week compares to last',
              'Mood from your reviews, so you can spot what drains you',
            ]}
          >
            <Report r={SAMPLE} />
          </ProGate>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-3xl">History</h2>
          {history && history.streak > 0 && (
            <span className="inline-flex items-center gap-1.5 text-sm text-soft">
              <Flame className="h-4 w-4 text-amber" /> {history.streak}-day streak
            </span>
          )}
        </div>
        {!history ? (
          <Spinner />
        ) : history.days.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-mute">
            Your finished days will collect here.
          </div>
        ) : (
          <ul className="space-y-3">
            {history.days.map((d) => (
              <li key={d.date} className="glass flex flex-col gap-3 rounded-2xl p-5 md:flex-row md:items-start">
                <div className="w-44 shrink-0">
                  <div className="font-medium">{longDate(d.date)}</div>
                  <div className="mt-1 text-xs text-mute">
                    {d.completed} done · {d.focus_minutes}m focus{d.mood ? ` · ${MOODS[d.mood - 1].label}` : ''}
                  </div>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {d.tasks.map((t, i) => (
                    <li key={i} className="rounded-full border border-line bg-white/[0.03] px-2.5 py-1 text-xs text-soft">
                      {t}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {history?.limited && (
          <p className="mt-4 text-center text-sm text-mute">
            Free shows the last 7 days.{' '}
            <Link to="/app/upgrade" className="text-iris hover:underline">
              Pro keeps 90.
            </Link>
          </p>
        )}
      </section>
    </>
  )
}
