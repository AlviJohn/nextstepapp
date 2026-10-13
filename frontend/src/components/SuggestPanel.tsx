import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, RefreshCw, Sparkles, X } from 'lucide-react'
import { api, type Suggestion, type SuggestOut, type Task } from '../lib/api'
import { MetaBadges } from './TaskMeta'
import { useToast } from './ui'

/**
 * Proposes the day's top tasks (ranked by priority, then size) and lets the user
 * override any pick: swap it for the next-best task, drop it, or dismiss the lot
 * and choose by hand. Nothing changes until "Use these" is pressed.
 *
 * With `auto`, the proposal loads on mount instead of behind a button.
 */
export default function SuggestPanel({
  date,
  openSlots,
  onAccept,
  variant = 'ghost',
  auto = false,
  refreshKey,
  onStale,
}: {
  date: string
  openSlots: number
  onAccept: (tasks: Task[]) => Promise<void> | void
  variant?: 'ghost' | 'glow'
  auto?: boolean
  /** Change to re-fetch an auto proposal (e.g. after tasks are added or edited). */
  refreshKey?: unknown
  /** Called when the server says the page's view of today is out of date. */
  onStale?: () => Promise<void> | void
}) {
  const toast = useToast()
  const [picks, setPicks] = useState<Suggestion[] | null>(null)
  const [alternates, setAlternates] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const fetchProposal = useCallback(
    async (quiet: boolean) => {
      setLoading(true)
      try {
        const res = await api<SuggestOut>(`/today/suggest?date=${date}`)
        if (res.slots === 0) {
          if (!quiet) toast('Today’s three are already set.')
          setPicks(null)
          await onStale?.()
        } else if (!res.suggestions.length) {
          if (!quiet) toast('Nothing left to suggest. Add a few tasks first.')
          setPicks(null)
        } else {
          setPicks(res.suggestions)
          setAlternates(res.alternates)
        }
      } catch (e) {
        if (!quiet) toast((e as Error).message, 'error')
      } finally {
        setLoading(false)
      }
    },
    [date, onStale, toast],
  )

  useEffect(() => {
    if (auto && openSlots > 0 && !dismissed) fetchProposal(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, openSlots, dismissed, refreshKey])

  if (openSlots <= 0) return null
  const label = openSlots === 3 ? 'Suggest my three' : `Suggest ${openSlots} more`

  const swap = (i: number) => {
    if (!picks || !alternates.length) return
    const [next, ...rest] = alternates
    const out = picks[i]
    setPicks(picks.map((p, j) => (j === i ? next : p)))
    setAlternates([...rest, out]) // cycle, so repeated swaps eventually come back around
  }

  const remove = (i: number) => {
    if (!picks) return
    const out = picks[i]
    const next = picks.filter((_, j) => j !== i)
    setAlternates([out, ...alternates])
    if (next.length) setPicks(next)
    else dismiss()
  }

  const dismiss = () => {
    setPicks(null)
    setDismissed(true)
  }

  const accept = async () => {
    if (!picks) return
    await onAccept(picks.map((s) => s.task))
    setPicks(null)
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {picks ? (
        <motion.div
          key="proposal"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="rounded-2xl border border-iris/30 bg-iris/[0.06] p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-iris">
              <Sparkles className="h-3.5 w-3.5" /> Suggested for today
            </div>
            <span className="text-[11px] text-mute">Swap or remove any pick</span>
          </div>
          <ol className="space-y-1">
            <AnimatePresence initial={false} mode="popLayout">
              {picks.map((s, i) => (
                <motion.li
                  key={s.task.id}
                  layout
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.04]"
                >
                  <span className="w-4 font-display text-xl leading-none text-gradient">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm text-white">{s.task.title}</span>
                      <MetaBadges task={s.task} />
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-mute">{s.reason}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={() => swap(i)}
                      disabled={!alternates.length}
                      className="grid h-8 w-8 place-items-center rounded-lg text-mute transition hover:bg-white/5 hover:text-white disabled:opacity-30"
                      title={alternates.length ? `Swap for “${alternates[0].task.title}”` : 'No other tasks to swap in'}
                      aria-label={`Swap ${s.task.title} for another task`}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => remove(i)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-mute transition hover:bg-white/5 hover:text-white"
                      aria-label={`Remove ${s.task.title} from suggestions`}
                      title="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
          <div className="mt-3 flex gap-2">
            <button onClick={accept} className="btn-primary flex-1 !py-2">
              <Check className="h-4 w-4" /> Use {picks.length === 1 ? 'this' : 'these'}
            </button>
            <button onClick={dismiss} className="btn-ghost !py-2 text-xs">
              Not now
            </button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-mute">
            Ranked by priority, then size, so quick high-value work comes first. At most one L/XL, so the day stays doable.
          </p>
        </motion.div>
      ) : (
        <motion.button
          key="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            setDismissed(false)
            fetchProposal(false)
          }}
          disabled={loading}
          className={variant === 'glow' ? 'btn-glow !h-12 !px-7' : 'btn-ghost w-full'}
        >
          <Sparkles className="h-4 w-4" /> {loading ? 'Thinking…' : label}
        </motion.button>
      )}
    </AnimatePresence>
  )
}
