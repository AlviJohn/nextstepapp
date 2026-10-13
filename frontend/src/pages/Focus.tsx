import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import confetti from 'canvas-confetti'
import { ArrowRight, Check, CornerDownRight, Moon, SkipForward } from 'lucide-react'
import { api, formatMinutes, localDate, type Task, type Today } from '../lib/api'
import { useAuth } from '../lib/auth'
import { FOCUS_LOGGED, useTimer } from '../lib/timer'
import PomodoroTimer from '../components/PomodoroTimer'
import { Spinner, Stat, useToast } from '../components/ui'
import { MetaBadges } from '../components/TaskMeta'
import SuggestPanel from '../components/SuggestPanel'
import TaskComposer, { type NewTask } from '../components/TaskComposer'

const PRIORITY_COUNT = 3

function greeting(name: string) {
  const h = new Date().getHours()
  const part = h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return name ? `${part}, ${name.split(' ')[0]}` : part
}

export default function Focus() {
  const { user } = useAuth()
  const timer = useTimer()
  const toast = useToast()
  const [today, setToday] = useState<Today | null>(null)
  const [busy, setBusy] = useState(false)
  const date = localDate()

  const load = useCallback(async () => {
    setToday(await api<Today>(`/today?date=${date}`))
  }, [date])

  useEffect(() => {
    load().catch((e) => toast(e.message, 'error'))
    const onLogged = () => load().catch(() => {})
    window.addEventListener(FOCUS_LOGGED, onLogged)
    return () => window.removeEventListener(FOCUS_LOGGED, onLogged)
  }, [load, toast])

  // Keep the timer attributed to whatever is on screen.
  const nextId = today?.next?.id ?? null
  useEffect(() => {
    if (today) timer.handoff(nextId)
  }, [nextId, today, timer.handoff])

  const complete = async () => {
    if (!today?.next) return
    setBusy(true)
    try {
      const remaining = today.priorities.slice(0, PRIORITY_COUNT).filter((t) => t.status === 'open').length - 1
      await api(`/tasks/${today.next.id}/complete`, { body: { date } })
      confetti({
        particleCount: remaining === 0 ? 140 : 60,
        spread: remaining === 0 ? 90 : 60,
        startVelocity: 32,
        origin: { y: 0.55 },
        colors: ['#c4b5fd', '#818cf8', '#5eead4', '#ffffff'],
        disableForReducedMotion: true,
      })
      await load()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const skip = async () => {
    if (!today?.next) return
    setBusy(true)
    try {
      await api(`/tasks/${today.next.id}/skip`, { body: { date } })
      await load()
    } finally {
      setBusy(false)
    }
  }

  /** Add straight to today's list: fills a priority slot if one is free, otherwise joins the extras. */
  const addToToday = async (items: NewTask[]) => {
    if (!today) return false
    try {
      const created: Task[] = []
      for (const t of items) created.push(await api<Task>('/tasks', { body: { ...t, recurrence: 'none', recurrence_day: null } }))
      const openIds = today.priorities.filter((t) => t.status === 'open').map((t) => t.id)
      const ids = [...openIds, ...created.map((t) => t.id)].slice(0, 10)
      setToday(await api<Today>('/today/priorities', { method: 'PUT', body: { date, task_ids: ids } }))
      const noun = created.length > 1 ? `${created.length} tasks` : 'Added'
      toast(today.priorities.length >= PRIORITY_COUNT ? `${noun} as a bonus, after your three.` : `${noun} to today.`)
      return true
    } catch (err) {
      toast((err as Error).message, 'error')
      return false
    }
  }

  const carryOver = async () => {
    if (!today) return
    const ids = today.carryover.slice(0, 3).map((t) => t.id)
    setToday(await api<Today>('/today/priorities', { method: 'PUT', body: { date, task_ids: ids } }))
    toast('Carried over. Pick up where you left off.')
  }

  if (!today)
    return (
      <div className="grid h-[50vh] place-items-center">
        <Spinner />
      </div>
    )

  // The first three on today's list are the priorities; anything after is a bonus.
  const top = today.priorities.slice(0, PRIORITY_COUNT)
  const extras = today.priorities.slice(PRIORITY_COUNT)
  const total = top.length
  const doneCount = top.filter((t) => t.status === 'done').length
  const extrasDone = extras.filter((t) => t.status === 'done').length
  const index = today.next ? today.priorities.findIndex((t) => t.id === today.next!.id) : -1
  const isBonus = index >= PRIORITY_COUNT
  const position = isBonus ? index - PRIORITY_COUNT + 1 : index + 1
  const group = isBonus ? extras : top
  const canSkip = group.filter((t) => t.status === 'open').length > 1
  const threeDone = total > 0 && doneCount === total
  const allDone = total > 0 && !today.next
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0">
        <div className="mb-8">
          <div className="eyebrow mb-2">{dateLabel}</div>
          <h1 className="font-display text-4xl tracking-tight md:text-5xl">{greeting(user?.name ?? '')}</h1>
        </div>

        {total > 0 && (
          <div className="mb-5 flex items-center gap-3">
            <div className="flex flex-1 gap-1.5">
              {top.map((t) => (
                <motion.div
                  key={t.id}
                  layout
                  className={`h-1.5 flex-1 rounded-full ${
                    t.status === 'done' ? 'bg-gradient-to-r from-iris to-mint' : t.id === today.next?.id ? 'bg-white/40' : 'bg-white/10'
                  }`}
                />
              ))}
            </div>
            <span className="text-xs tabular-nums text-mute">
              {doneCount}/{total} done
              {extras.length > 0 && (
                <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5">
                  +{extras.length - extrasDone} bonus
                </span>
              )}
            </span>
          </div>
        )}

        {threeDone && today.next && (
          <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex items-center gap-2 text-sm text-soft">
            <Check className="h-4 w-4 text-mint" /> Your three are done. Everything from here is a bonus.
          </motion.p>
        )}

        <AnimatePresence mode="wait">
          {today.next ? (
            <motion.article
              key={today.next.id}
              initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -24, filter: 'blur(6px)' }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="glass ring-glow relative overflow-hidden rounded-[28px] p-7 md:p-10"
            >
              <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-iris/20 blur-3xl" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <span className="eyebrow flex items-center gap-2">
                    {isBonus ? `Bonus · ${position} of ${extras.length}` : `Your next step · ${position} of ${total}`}
                    <MetaBadges task={today.next} />
                  </span>
                  {today.next.pomodoros > 0 && (
                    <span className="text-xs text-mute">
                      {today.next.pomodoros} pomodoro{today.next.pomodoros > 1 ? 's' : ''} · {formatMinutes(today.next.focus_seconds)}
                    </span>
                  )}
                </div>
                <h2 className="mt-5 font-display text-4xl leading-[1.1] tracking-tight text-balance md:text-6xl">{today.next.title}</h2>
                {today.next.notes && <p className="mt-4 max-w-xl whitespace-pre-line text-soft">{today.next.notes}</p>}
                <div className="mt-10 flex flex-wrap items-center gap-3">
                  <button disabled={busy} onClick={complete} className="btn-glow !h-12 !px-7 !text-[15px]">
                    <Check className="h-4 w-4" /> Done
                  </button>
                  {canSkip ? (
                    <button disabled={busy} onClick={skip} className="btn-ghost !h-12">
                      <SkipForward className="h-4 w-4" /> Later
                    </button>
                  ) : null}
                </div>
              </div>
            </motion.article>
          ) : allDone ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass ring-glow rounded-[28px] p-8 text-center md:p-12"
            >
              <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-iris to-mint text-ink">
                <Check className="h-6 w-6" />
              </div>
              <h2 className="font-display text-4xl md:text-5xl">
                {extrasDone ? `Your three, plus ${extrasDone} more.` : "That's the day's three."}
              </h2>
              <p className="mx-auto mt-3 max-w-md text-soft">
                The important part is done. Add a little more below if you have energy, or close the day while it's still fresh.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link to="/app/review" className="btn-primary">
                  <Moon className="h-4 w-4" /> {today.has_review ? 'Revisit review' : 'Close the day'}
                </Link>
                <Link to="/app/plan" className="btn-ghost">
                  Add more from your list <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-[28px] p-8 md:p-12">
              <div className="eyebrow mb-3">Start here</div>
              <h2 className="font-display text-4xl leading-tight md:text-5xl">
                What are the three things
                <br />
                <span className="text-gradient italic">that would make today count?</span>
              </h2>
              {today.inbox_count > 0 ? (
                <>
                  <p className="mt-4 max-w-lg text-soft">
                    Here&rsquo;s what looks most important from your {today.inbox_count} open task{today.inbox_count > 1 ? 's' : ''}. Swap
                    anything that doesn&rsquo;t feel right, or choose yourself.
                  </p>
                  <div className="mt-8 flex flex-wrap items-start gap-3">
                    <div className="w-full max-w-md">
                      <SuggestPanel
                        auto
                        date={date}
                        openSlots={PRIORITY_COUNT}
                        variant="glow"
                        onStale={load}
                        onAccept={async (tasks) => {
                          setToday(await api<Today>('/today/priorities', { method: 'PUT', body: { date, task_ids: tasks.map((t) => t.id) } }))
                        }}
                      />
                    </div>
                    <Link to="/app/plan" className="btn-ghost !h-12 !px-6">
                      I'll choose myself <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                  <div className="mt-8">
                    <div className="mb-2 text-xs text-mute">Or add something new straight to today</div>
                    <TaskComposer placeholder="Type a task and press Enter" onAdd={(t) => addToToday([t])} onAddMany={async (ts) => void (await addToToday(ts))} />
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-4 max-w-lg text-soft">
                    Type them below and press Enter after each. That&rsquo;s it. NextStep will then show you one at a time.
                  </p>
                  <div className="mt-8 max-w-xl">
                    <TaskComposer
                      autoFocus
                      placeholder="The first thing… then press Enter"
                      onAdd={(t) => addToToday([t])}
                      onAddMany={async (ts) => void (await addToToday(ts))}
                    />
                    <p className="mt-3 text-xs text-mute">
                      Got a longer list? Paste it in, one per line, or{' '}
                      <Link to="/app/plan" className="text-soft underline-offset-2 hover:underline">
                        plan the whole thing
                      </Link>
                      .
                    </p>
                  </div>
                </>
              )}
              {today.carryover.length > 0 && (
                <div className="mt-10 border-t border-line pt-6">
                  <div className="eyebrow mb-3">Unfinished from before</div>
                  <ul className="space-y-2">
                    {today.carryover.slice(0, 3).map((t) => (
                      <li key={t.id} className="flex items-center gap-2 text-soft">
                        <CornerDownRight className="h-4 w-4 text-mute" /> {t.title}
                      </li>
                    ))}
                  </ul>
                  <button onClick={carryOver} className="btn-ghost mt-4">
                    Make these today's priorities
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {total > 0 && (
          <div className="mt-4">
            <TaskComposer
              compact
              placeholder={total >= PRIORITY_COUNT ? 'Add a bonus task. It waits until your three are done' : 'Add to today'}
              onAdd={(t) => addToToday([t])}
              onAddMany={async (ts) => {
                await addToToday(ts)
              }}
            />
          </div>
        )}

        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat label="Done today" value={today.done_today.length} />
          <Stat label="Focused" value={formatMinutes(today.focus_seconds_today)} />
          <Stat label="Pomodoros" value={today.pomodoros_today} />
        </div>

        {today.done_today.length > 0 && (
          <div className="mt-8">
            <div className="eyebrow mb-3">Finished today</div>
            <ul className="space-y-1.5">
              {today.done_today.map((t) => (
                <li key={t.id} className="flex items-center gap-2.5 text-sm text-mute">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-mint/15 text-mint">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  <span className="line-through decoration-white/20">{t.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <PomodoroTimer timer={timer} />
        <p className="px-2 text-center text-xs leading-relaxed text-mute">
          {timer.mode === 'focus'
            ? today.next
              ? 'Time is credited to the task on screen. Finish early? Mark it done; the clock keeps going for the next one.'
              : 'Pick your priorities and the timer will track time against each one.'
            : 'Breaks are part of the method. A short walk beats a quick scroll.'}
        </p>
      </aside>
    </div>
  )
}
