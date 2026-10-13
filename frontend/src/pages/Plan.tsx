import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, Reorder, motion } from 'motion/react'
import { ArrowRight, ChevronDown, GripVertical, Repeat, Star, Trash2, X } from 'lucide-react'
import { ApiError, api, localDate, type Size, type Task, type Today } from '../lib/api'
import { useAuth } from '../lib/auth'
import { PageHeader, ProBadge, Spinner, useToast } from '../components/ui'
import { MetaBadges, PriorityPicker, SIZES, SizePicker } from '../components/TaskMeta'
import TaskComposer, { type NewTask } from '../components/TaskComposer'
import SuggestPanel from '../components/SuggestPanel'

type Recurrence = Task['recurrence']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PRIORITY_COUNT = 3
const MAX_TODAY = 10
const REPEAT_LABEL: Record<Recurrence, string> = { none: 'Once', daily: 'Every day', weekdays: 'Weekdays', weekly: 'Weekly' }

type SortMode = 'priority' | 'newest'

// Highest priority first; within a priority, smaller tasks first; unset values sit in the middle.
function byPriority(a: Task, b: Task) {
  const ia = a.importance ?? 3
  const ib = b.importance ?? 3
  if (ia !== ib) return ib - ia
  const sa = SIZES.indexOf(a.size ?? 'M')
  const sb = SIZES.indexOf(b.size ?? 'M')
  if (sa !== sb) return sa - sb
  return b.created_at.localeCompare(a.created_at)
}

function describeRoutine(t: Task) {
  if (t.recurrence === 'weekly' && t.recurrence_day !== null) return `Every ${DAYS[t.recurrence_day]}`
  return REPEAT_LABEL[t.recurrence]
}

export default function Plan() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const date = localDate()
  const [inbox, setInbox] = useState<Task[] | null>(null)
  const [routines, setRoutines] = useState<Task[]>([])
  // Today's open tasks in order. The first `slots` are priorities, the rest are extras.
  const [priorities, setPriorities] = useState<Task[]>([])
  const [doneCount, setDoneCount] = useState(0)
  const [editing, setEditing] = useState<number | null>(null)
  const [fresh, setFresh] = useState<Set<number>>(new Set()) // briefly highlight just-added rows
  const [expanded, setExpanded] = useState<number | null>(null)
  const [sort, setSort] = useState<SortMode>(() => {
    try {
      return (localStorage.getItem('nextstep.sort') as SortMode) || 'priority'
    } catch {
      return 'priority'
    }
  })
  const prioritiesRef = useRef(priorities)
  prioritiesRef.current = priorities

  const load = useCallback(async () => {
    // /today first so today's routine instances exist before the inbox is read.
    const today = await api<Today>(`/today?date=${date}`)
    const [tasks, rts] = await Promise.all([api<Task[]>('/tasks'), api<Task[]>('/routines')])
    setPriorities(today.priorities.filter((t) => t.status === 'open'))
    // Finished tasks always sit at the front of today's list, so only the first three
    // finished ones used up priority spots; later ones were bonus tasks.
    setDoneCount(Math.min(PRIORITY_COUNT, today.priorities.filter((t) => t.status === 'done').length))
    setInbox(tasks)
    setRoutines(rts)
  }, [date])

  useEffect(() => {
    load().catch((e) => toast(e.message, 'error'))
    // Pick up changes made in another tab or device when the user comes back.
    const onFocus = () => load().catch(() => {})
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load, toast])

  const savePriorities = async (next: Task[]) => {
    setPriorities(next)
    try {
      await api('/today/priorities', { method: 'PUT', body: { date, task_ids: next.map((t) => t.id) } })
    } catch (e) {
      toast((e as Error).message, 'error')
      load()
    }
  }

  const flash = (ids: number[]) => {
    setFresh(new Set(ids))
    setTimeout(() => setFresh(new Set()), 1600)
  }

  const createTask = async (t: NewTask): Promise<Task | null> => {
    try {
      return await api<Task>('/tasks', { body: { ...t, date } })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'pro_required') toast(err.message)
      else toast((err as Error).message, 'error')
      return null
    }
  }

  const addOne = async (t: NewTask) => {
    const task = await createTask(t)
    if (!task) return false
    if (task.is_template) {
      toast(`Routine added · ${describeRoutine(task)}`)
      load()
    } else {
      setInbox((xs) => [task, ...(xs ?? [])])
      flash([task.id])
    }
    return true
  }

  const addMany = async (items: NewTask[]) => {
    const created: Task[] = []
    for (const t of items) {
      // Sequential keeps the list in the pasted order and stops at the first plan limit.
      const task = await createTask(t)
      if (!task) break
      created.push(task)
    }
    if (!created.length) return
    if (created.some((t) => t.is_template)) load()
    else setInbox((xs) => [...created.reverse(), ...(xs ?? [])])
    flash(created.map((t) => t.id))
    toast(`Added ${created.length} tasks`)
  }

  const slots = Math.max(0, PRIORITY_COUNT - doneCount)
  const prioritiesFull = priorities.length >= slots

  const togglePriority = (task: Task) => {
    if (priorities.some((p) => p.id === task.id)) {
      savePriorities(priorities.filter((p) => p.id !== task.id))
    } else if (priorities.length >= MAX_TODAY) {
      toast(`Today already has ${MAX_TODAY} tasks. Finish or remove one first.`)
    } else {
      if (prioritiesFull) toast('Added as a bonus task. Drag it into the top three to prioritise it.')
      savePriorities([...priorities, task])
    }
  }

  const rename = async (task: Task, value: string) => {
    setEditing(null)
    const v = value.trim()
    if (!v || v === task.title) return
    const updated = await api<Task>(`/tasks/${task.id}`, { method: 'PATCH', body: { title: v } })
    setInbox((xs) => xs?.map((t) => (t.id === task.id ? updated : t)) ?? null)
    setPriorities((xs) => xs.map((t) => (t.id === task.id ? updated : t)))
  }

  const updateMeta = async (task: Task, patch: { importance?: number | null; size?: Size | null }) => {
    const optimistic = { ...task, ...patch }
    const swap = (xs: Task[]) => xs.map((t) => (t.id === task.id ? optimistic : t))
    setInbox((xs) => (xs ? swap(xs) : xs))
    setPriorities(swap)
    try {
      await api<Task>(`/tasks/${task.id}`, { method: 'PATCH', body: patch })
    } catch (e) {
      toast((e as Error).message, 'error')
      load()
    }
  }

  const changeSort = (m: SortMode) => {
    setSort(m)
    try {
      localStorage.setItem('nextstep.sort', m)
    } catch {
      /* ignore */
    }
  }

  const remove = async (task: Task) => {
    await api(`/tasks/${task.id}`, { method: 'DELETE' })
    setInbox((xs) => xs?.filter((t) => t.id !== task.id) ?? null)
    setPriorities((xs) => xs.filter((t) => t.id !== task.id))
    setRoutines((xs) => xs.filter((t) => t.id !== task.id))
  }

  if (!inbox)
    return (
      <div className="grid h-[50vh] place-items-center">
        <Spinner />
      </div>
    )

  const priorityIds = new Set(priorities.map((p) => p.id))
  const rest = inbox.filter((t) => !priorityIds.has(t.id))
  if (sort === 'priority') rest.sort(byPriority)

  return (
    <>
      <PageHeader
        eyebrow="Plan"
        title={
          <>
            Get it out of your head.
            <br />
            <span className="text-gradient italic">Then choose three.</span>
          </>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <TaskComposer
            autoFocus
            placeholder="What needs doing? e.g. “Send proposal to Priya p4 #s”"
            onAdd={addOne}
            onAddMany={addMany}
            repeat={{
              allowed: !!user?.is_pro,
              onLocked: () => {
                toast('Repeating tasks are part of Pro.')
                navigate('/app/upgrade')
              },
            }}
          />

          <div className="mt-8 flex items-baseline justify-between">
            <div className="eyebrow">Everything else · {rest.length}</div>
            <div className="flex items-center gap-3 text-xs text-mute">
              <span className="hidden sm:inline">
                {prioritiesFull ? 'Star to add as a bonus' : 'Star to make it a priority'}
              </span>
              <div className="flex rounded-full border border-line p-0.5">
                {(['priority', 'newest'] as SortMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => changeSort(m)}
                    className={`rounded-full px-2.5 py-1 capitalize transition ${sort === m ? 'bg-white/10 text-white' : 'hover:text-white'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {rest.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-mute">
              {inbox.length === 0 ? 'Nothing here yet. Start with whatever is loudest in your head.' : 'Everything you have is on today’s list.'}
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white/[0.02]">
              <AnimatePresence initial={false}>
                {rest.map((t) => (
                  <motion.li
                    key={t.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`group transition-colors duration-700 ${fresh.has(t.id) ? 'bg-iris/10' : ''}`}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => togglePriority(t)}
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition ${
                        priorities.length >= MAX_TODAY
                          ? 'text-white/15'
                          : prioritiesFull
                            ? 'text-mute hover:bg-white/5 hover:text-white'
                            : 'text-mute hover:bg-amber/10 hover:text-amber'
                      }`}
                      aria-label={prioritiesFull ? 'Add to today as a bonus' : "Add to today's three"}
                    >
                      <Star className="h-4 w-4" />
                    </button>
                    {editing === t.id ? (
                      <input
                        autoFocus
                        defaultValue={t.title}
                        onBlur={(e) => rename(t, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                          if (e.key === 'Escape') setEditing(null)
                        }}
                        className="min-w-0 flex-1 rounded-lg bg-white/5 px-2 py-1 outline-none"
                      />
                    ) : (
                      <button onClick={() => setEditing(t.id)} className="min-w-0 flex-1 truncate text-left text-[15px]" title="Click to edit">
                        {t.title}
                      </button>
                    )}
                    {t.template_id && <span className="rounded-full bg-mint/10 px-2 py-0.5 text-[10px] text-mint">Routine</span>}
                    <button
                      onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                      className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-mute transition hover:bg-white/5 hover:text-white"
                      aria-label="Edit priority and size"
                      aria-expanded={expanded === t.id}
                    >
                      {t.importance || t.size ? <MetaBadges task={t} /> : <span className="opacity-0 group-hover:opacity-100">Size · Priority</span>}
                      <ChevronDown className={`h-3 w-3 transition ${expanded === t.id ? 'rotate-180' : ''}`} />
                    </button>
                    <button
                      onClick={() => remove(t)}
                      className="text-mute opacity-0 transition hover:text-rose-300 group-hover:opacity-100 focus:opacity-100"
                      aria-label="Delete task"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    </div>
                    <AnimatePresence initial={false}>
                      {expanded === t.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 pb-3 pl-[60px]">
                            <PriorityPicker value={t.importance} onChange={(v) => updateMeta(t, { importance: v })} />
                            <SizePicker value={t.size} onChange={(v) => updateMeta(t, { size: v })} />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>

        <aside className="min-w-0 space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="glass ring-glow rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <div className="eyebrow">Today's three</div>
              <span className="text-xs text-mute">
                {Math.min(priorities.length, slots) + doneCount}/{PRIORITY_COUNT}
                {doneCount > 0 && ` · ${doneCount} done`}
              </span>
            </div>
            <Reorder.Group axis="y" values={priorities} onReorder={setPriorities} className="mt-4 space-y-2">
              {priorities.map((t, i) => {
                const isPriority = i < slots
                return (
                  <Reorder.Item
                    key={t.id}
                    value={t}
                    onDragEnd={() => savePriorities(prioritiesRef.current)}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    {i === slots && (
                      <div className="mb-2 mt-5 flex items-center gap-3">
                        <span className="eyebrow">If there's time</span>
                        <span className="h-px flex-1 bg-line" />
                      </div>
                    )}
                    <div
                      className={`flex items-center gap-3 rounded-2xl border px-3 transition ${
                        isPriority ? 'border-line bg-ink-2/80 py-3' : 'border-transparent bg-white/[0.02] py-2.5 text-sm text-soft'
                      }`}
                    >
                      <GripVertical className="h-4 w-4 shrink-0 text-mute" />
                      {isPriority ? (
                        <span className="font-display text-2xl leading-none text-gradient">{doneCount + i + 1}</span>
                      ) : (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/25" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <MetaBadges task={t} />
                      <button onClick={() => togglePriority(t)} className="text-mute hover:text-white" aria-label="Remove from today">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </Reorder.Item>
                )
              })}
            </Reorder.Group>
            {Array.from({ length: Math.max(0, slots - priorities.length) }).map((_, i) => (
              <div key={i} className="mt-2 flex items-center gap-3 rounded-2xl border border-dashed border-line px-3 py-3 text-sm text-mute">
                <span className="w-4" />
                <span className="font-display text-2xl leading-none text-white/20">{doneCount + priorities.length + i + 1}</span>
                Star a task to fill this
              </div>
            ))}
            {!prioritiesFull && rest.length > 0 && (
              <div className="mt-4">
                <SuggestPanel
                  auto
                  refreshKey={rest.map((t) => `${t.id}${t.importance}${t.size}`).join()}
                  date={date}
                  openSlots={slots - priorities.length}
                  onAccept={(tasks) => savePriorities([...priorities, ...tasks])}
                  onStale={load}
                />
              </div>
            )}
            {prioritiesFull && priorities.length === slots && (
              <p className="mt-4 text-xs leading-relaxed text-mute">
                Three's set. You can still star more; they'll wait below as bonus tasks and only appear once your three are done.
              </p>
            )}
            <Link to="/app" className={`btn-glow mt-5 w-full ${priorities.length ? '' : 'pointer-events-none opacity-40'}`}>
              {slots > 0 ? `Start with #${doneCount + 1}` : 'Start the bonus round'} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="rounded-3xl border border-line p-5">
            <div className="flex items-center justify-between">
              <div className="eyebrow">Routines</div>
              {!user?.is_pro && <ProBadge />}
            </div>
            {routines.length ? (
              <ul className="mt-3 space-y-2">
                {routines.map((r) => (
                  <li key={r.id} className="group flex items-center gap-2 text-sm">
                    <Repeat className="h-3.5 w-3.5 text-mint" />
                    <span className="flex-1 truncate">{r.title}</span>
                    <span className="text-xs text-mute">{describeRoutine(r)}</span>
                    <button onClick={() => remove(r)} className="text-mute opacity-0 hover:text-rose-300 group-hover:opacity-100" aria-label="Delete routine">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-mute">
                Things you do on a rhythm, like a weekly report or a daily inbox sweep, can add themselves to your list.
                {!user?.is_pro && (
                  <>
                    {' '}
                    <Link to="/app/upgrade" className="text-iris hover:underline">
                      Available on Pro.
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>

          <div className="px-1 text-xs leading-relaxed text-mute">
            <span className="text-soft">Why only three?</span> A short list is one you can actually finish. Finishing builds momentum, and
            momentum makes the fourth task easier than the first.
          </div>
        </aside>
      </div>
    </>
  )
}
