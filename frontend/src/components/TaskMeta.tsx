import type { Size, Task } from '../lib/api'

export const SIZES: Size[] = ['XS', 'S', 'M', 'L', 'XL']
export const SIZE_HINT: Record<Size, string> = {
  XS: 'Under 15 min',
  S: 'Under an hour',
  M: 'A couple of hours',
  L: 'Half a day',
  XL: 'A day or more',
}
export const PRIORITY_HINT = ['', 'Low', 'Minor', 'Normal', 'High', 'Critical']

// Cool → warm as priority rises.
const P_COLOR = ['', 'bg-slate-400/15 text-slate-300', 'bg-sky-400/15 text-sky-300', 'bg-periwinkle/15 text-periwinkle', 'bg-iris/20 text-iris', 'bg-amber/15 text-amber']
const P_PIP = ['', 'bg-slate-400', 'bg-sky-400', 'bg-periwinkle', 'bg-iris', 'bg-amber']

export function MetaBadges({ task, className = '' }: { task: Pick<Task, 'importance' | 'size'>; className?: string }) {
  if (!task.importance && !task.size) return null
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
      {task.importance && (
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${P_COLOR[task.importance]}`} title={`Priority ${task.importance}: ${PRIORITY_HINT[task.importance]}`}>
          P{task.importance}
        </span>
      )}
      {task.size && (
        <span className="rounded-md border border-line px-1.5 py-0.5 text-[10px] font-semibold text-soft" title={SIZE_HINT[task.size]}>
          {task.size}
        </span>
      )}
    </span>
  )
}

/** Click a selected value again to clear it. */
export function PriorityPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Priority">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value !== null && n <= value
        return (
          <button
            type="button"
            key={n}
            role="radio"
            aria-checked={value === n}
            aria-label={`Priority ${n}: ${PRIORITY_HINT[n]}`}
            title={`${n} · ${PRIORITY_HINT[n]}`}
            onClick={() => onChange(value === n ? null : n)}
            className="group grid h-7 w-6 place-items-center"
          >
            <span className={`h-2.5 w-2.5 rounded-full transition ${on ? P_PIP[value!] : 'bg-white/10 group-hover:bg-white/25'}`} />
          </button>
        )
      })}
      <span className="ml-1 w-14 text-[11px] text-mute">{value ? PRIORITY_HINT[value] : 'Priority'}</span>
    </div>
  )
}

export function SizePicker({ value, onChange }: { value: Size | null; onChange: (v: Size | null) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-line p-0.5" role="radiogroup" aria-label="Size">
      {SIZES.map((s) => (
        <button
          type="button"
          key={s}
          role="radio"
          aria-checked={value === s}
          aria-label={`${s}: ${SIZE_HINT[s]}`}
          title={SIZE_HINT[s]}
          onClick={() => onChange(value === s ? null : s)}
          className={`min-w-8 rounded-full px-2 py-1 text-[11px] font-semibold transition ${value === s ? 'bg-white text-ink' : 'text-mute hover:text-white'}`}
        >
          {s}
        </button>
      ))}
    </div>
  )
}
