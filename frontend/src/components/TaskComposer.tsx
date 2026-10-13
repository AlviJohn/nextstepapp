import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CornerDownLeft, Lock, Repeat } from 'lucide-react'
import type { Size, Task } from '../lib/api'
import { parseQuickAdd, splitLines, stripToken } from '../lib/quickadd'
import { MetaBadges, PriorityPicker, SizePicker } from './TaskMeta'

type Recurrence = Task['recurrence']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const REPEAT_LABEL: Record<Recurrence, string> = { none: 'Doesn’t repeat', daily: 'Every day', weekdays: 'Weekdays', weekly: 'Weekly' }

export type NewTask = {
  title: string
  importance: number | null
  size: Size | null
  recurrence: Recurrence
  recurrence_day: number | null
}

export type ComposerHandle = { focus: () => void }

type Props = {
  onAdd: (task: NewTask) => Promise<boolean> // false = keep the text so the user can retry
  onAddMany?: (tasks: NewTask[]) => Promise<void>
  placeholder?: string
  compact?: boolean
  repeat?: { allowed: boolean; onLocked: () => void }
  autoFocus?: boolean
}

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

/**
 * One box for adding tasks. Type a title and press Enter. Optional extras:
 *  - "p1–p5" and "#xs–#xl" in the text set priority and size
 *  - pickers appear while typing, for people who prefer clicking
 *  - pasting several lines adds one task per line
 *  - "N" anywhere on the page focuses the box
 */
const TaskComposer = forwardRef<ComposerHandle, Props>(function TaskComposer(
  { onAdd, onAddMany, placeholder = 'Add a task…', compact = false, repeat, autoFocus },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const [importance, setImportance] = useState<number | null>(null)
  const [size, setSize] = useState<Size | null>(null)
  const [recurrence, setRecurrence] = useState<Recurrence>('none')
  const [day, setDay] = useState(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1)
  const [busy, setBusy] = useState(false)

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }))

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [autoFocus])

  const parsed = parseQuickAdd(text)
  const effective = { importance: parsed.importance ?? importance, size: parsed.size ?? size }
  const open = focused || text.length > 0 || importance !== null || size !== null || recurrence !== 'none'

  const reset = () => {
    setText('')
    setImportance(null)
    setSize(null)
    setRecurrence('none')
  }

  const build = (title: string, p = parseQuickAdd(title)): NewTask => ({
    title: p.title,
    importance: p.importance ?? importance,
    size: p.size ?? size,
    recurrence,
    recurrence_day: recurrence === 'weekly' ? day : null,
  })

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!parsed.title || busy) return
    const task = build(text, parsed)
    const prev = text
    reset() // clear immediately so fast typists can keep going
    setBusy(true)
    const ok = await onAdd(task).finally(() => setBusy(false))
    if (!ok) setText(prev)
    inputRef.current?.focus()
  }

  const onPaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const lines = splitLines(e.clipboardData.getData('text'))
    if (lines.length < 2 || !onAddMany) return
    e.preventDefault()
    await onAddMany(lines.map((l) => build(l)).filter((t) => t.title))
    reset()
  }

  const pickPriority = (v: number | null) => {
    setImportance(v)
    setText((t) => stripToken(t, 'priority'))
  }
  const pickSize = (v: Size | null) => {
    setSize(v)
    setText((t) => stripToken(t, 'size'))
  }

  return (
    <form
      onSubmit={submit}
      className={`rounded-2xl border transition ${
        focused ? 'border-iris/40 bg-white/[0.05] ring-4 ring-iris/10' : 'border-line bg-white/[0.03]'
      } ${compact ? 'p-1.5' : 'p-2'}`}
    >
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              reset()
              inputRef.current?.blur()
            }
          }}
          placeholder={placeholder}
          maxLength={400}
          aria-label="New task"
          className={`min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:text-mute/70 ${compact ? 'py-2 text-sm' : 'py-3 text-[15px]'}`}
        />
        {!focused && !text && (
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-[10px] text-mute sm:block" title="Press N to add a task">
            N
          </kbd>
        )}
        <button
          type="submit"
          disabled={!parsed.title || busy}
          className={`btn-primary shrink-0 !gap-1.5 disabled:!opacity-30 ${compact ? '!px-3 !py-1.5 text-xs' : '!h-10 !px-4'}`}
        >
          Add <CornerDownLeft className="h-3.5 w-3.5" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
            // Keep focus in the input when clicking pickers, so the panel doesn't collapse mid-click.
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).tagName !== 'SELECT') e.preventDefault()
            }}
          >
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-2 pt-2.5">
              <PriorityPicker value={effective.importance} onChange={pickPriority} />
              <SizePicker value={effective.size} onChange={pickSize} />
              {repeat && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Repeat className="h-3.5 w-3.5 text-mute" />
                  {repeat.allowed ? (
                    <>
                      <select
                        value={recurrence}
                        onChange={(e) => setRecurrence(e.target.value as Recurrence)}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        className="rounded-full border border-line bg-ink px-2 py-1 text-soft outline-none"
                        aria-label="Repeat"
                      >
                        {(Object.keys(REPEAT_LABEL) as Recurrence[]).map((r) => (
                          <option key={r} value={r}>
                            {REPEAT_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      {recurrence === 'weekly' && (
                        <select
                          value={day}
                          onChange={(e) => setDay(Number(e.target.value))}
                          onFocus={() => setFocused(true)}
                          onBlur={() => setFocused(false)}
                          className="rounded-full border border-line bg-ink px-2 py-1 text-soft outline-none"
                          aria-label="Day of week"
                        >
                          {DAYS.map((d, i) => (
                            <option key={d} value={i}>
                              on {d}
                            </option>
                          ))}
                        </select>
                      )}
                    </>
                  ) : (
                    <button type="button" onClick={repeat.onLocked} className="inline-flex items-center gap-1 text-mute hover:text-white">
                      Repeat <Lock className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
              <div className="ml-auto flex items-center gap-2 text-[11px] text-mute">
                {(parsed.importance || parsed.size) && parsed.title ? (
                  <span className="inline-flex items-center gap-1.5">
                    Detected <MetaBadges task={{ importance: parsed.importance, size: parsed.size }} />
                  </span>
                ) : (
                  <span className="hidden md:inline">
                    Tip: type <code className="text-soft">p1–p5</code> and <code className="text-soft">#xs–#xl</code>, or paste a list
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  )
})

export default TaskComposer
