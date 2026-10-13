import { Pause, Play, RotateCcw } from 'lucide-react'
import { motion } from 'motion/react'
import type { Mode, usePomodoro } from '../lib/usePomodoro'

const MODE_LABEL: Record<Mode, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' }

function fmt(sec: number) {
  const s = Math.ceil(sec)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function PomodoroTimer({ timer, compact = false }: { timer: ReturnType<typeof usePomodoro>; compact?: boolean }) {
  const size = compact ? 168 : 220
  const stroke = 6
  const r = (size - stroke) / 2 - 6
  const c = 2 * Math.PI * r
  const isBreak = timer.mode !== 'focus'

  return (
    <div className="glass rounded-3xl p-5 md:p-6">
      <div className="flex items-center justify-between">
        <div className="eyebrow">Pomodoro</div>
        <div className="flex gap-1 rounded-full border border-line p-0.5 text-[11px]">
          {([25, 50] as const).map((p) => (
            <button
              key={p}
              disabled={timer.running}
              onClick={() => timer.setPreset(p)}
              className={`rounded-full px-2.5 py-1 transition disabled:cursor-not-allowed ${timer.preset === p ? 'bg-white/10 text-white' : 'text-mute hover:text-white'}`}
            >
              {p}m
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex gap-1 text-xs">
        {(['focus', 'short', 'long'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => timer.switchMode(m)}
            className={`flex-1 rounded-full py-1.5 transition ${timer.mode === m ? 'bg-white text-ink' : 'text-mute hover:bg-white/5 hover:text-white'}`}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="relative mx-auto my-6 grid place-items-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id="ring-focus" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#c4b5fd" />
              <stop offset="1" stopColor="#818cf8" />
            </linearGradient>
            <linearGradient id="ring-break" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#99f6e4" />
              <stop offset="1" stopColor="#5eead4" />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#${isBreak ? 'ring-break' : 'ring-focus'})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            animate={{ strokeDashoffset: c * (1 - timer.progress) }}
            transition={{ duration: 0.3, ease: 'linear' }}
            style={{ filter: `drop-shadow(0 0 10px ${isBreak ? 'rgba(94,234,212,.45)' : 'rgba(167,139,250,.5)'})` }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className={`font-display tabular-nums leading-none ${compact ? 'text-5xl' : 'text-6xl'}`}>{fmt(timer.remaining)}</div>
            <div className="mt-2 text-xs text-mute">{isBreak ? 'Step away from the screen' : MODE_LABEL[timer.mode]}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <button onClick={timer.reset} className="grid h-11 w-11 place-items-center rounded-full border border-line text-mute transition hover:text-white" aria-label="Reset timer">
          <RotateCcw className="h-4 w-4" />
        </button>
        {timer.running ? (
          <button onClick={timer.pause} className="btn-primary !h-12 !px-7">
            <Pause className="h-4 w-4" /> Pause
          </button>
        ) : (
          <button onClick={timer.start} className={`${isBreak ? 'btn-primary' : 'btn-glow'} !h-12 !px-7`}>
            <Play className="h-4 w-4" /> {timer.remaining < timer.total ? 'Resume' : isBreak ? 'Start break' : 'Start focus'}
          </button>
        )}
      </div>

      <div className="mt-5 flex items-center justify-center gap-1.5" title="Every fourth session earns a long break">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1.5 w-6 rounded-full transition ${i < timer.cycle % 4 ? 'bg-iris' : 'bg-white/10'}`} />
        ))}
      </div>
    </div>
  )
}
