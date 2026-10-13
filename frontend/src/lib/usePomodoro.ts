import { useCallback, useEffect, useRef, useState } from 'react'

export type Mode = 'focus' | 'short' | 'long'

export const LENGTHS: Record<number, Record<Mode, number>> = {
  25: { focus: 25 * 60, short: 5 * 60, long: 15 * 60 },
  50: { focus: 50 * 60, short: 10 * 60, long: 20 * 60 },
}
const LONG_BREAK_EVERY = 4
const STORE_KEY = 'nextstep.pomodoro'

type State = {
  preset: 25 | 50
  mode: Mode
  running: boolean
  endAt: number | null // ms timestamp while running
  remaining: number // seconds, authoritative while paused
  cycle: number // completed focus sessions in this run
  taskId: number | null
  // Focus time attributed to the current task in this segment, so switching
  // tasks mid-pomodoro credits each task with what it actually got.
  segAccum: number
  runningSince: number | null
}

const initial: State = {
  preset: 25,
  mode: 'focus',
  running: false,
  endAt: null,
  remaining: LENGTHS[25].focus,
  cycle: 0,
  taskId: null,
  segAccum: 0,
  runningSince: null,
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) return { ...initial, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return initial
}

function chime() {
  try {
    const ctx = new AudioContext()
    ;[0, 0.18, 0.36].forEach((t, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = [660, 880, 990][i]
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.6)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + t)
      o.stop(ctx.currentTime + t + 0.65)
    })
  } catch {
    /* audio unavailable */
  }
}

function notify(title: string, body: string) {
  try {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.svg' })
    }
  } catch {
    /* ignore */
  }
}

export type FocusLog = { taskId: number | null; seconds: number; completed: boolean }

export function usePomodoro(onLog: (log: FocusLog) => void) {
  const [s, setS] = useState<State>(load)
  const [now, setNow] = useState(() => Date.now())
  const onLogRef = useRef(onLog)
  onLogRef.current = onLog

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(s))
    } catch {
      /* ignore */
    }
  }, [s])

  const segElapsed = (st: State, at: number) =>
    st.segAccum + (st.running && st.runningSince ? (at - st.runningSince) / 1000 : 0)

  const remaining = s.running && s.endAt ? Math.max(0, (s.endAt - now) / 1000) : s.remaining
  const total = LENGTHS[s.preset][s.mode]

  // Tick while running; finish the phase when the clock hits zero.
  useEffect(() => {
    if (!s.running) return
    const id = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (s.endAt && t >= s.endAt) {
        chime()
        if (s.mode === 'focus') {
          onLogRef.current({ taskId: s.taskId, seconds: Math.round(segElapsed(s, t)), completed: true })
          const cycle = s.cycle + 1
          const next: Mode = cycle % LONG_BREAK_EVERY === 0 ? 'long' : 'short'
          notify('Pomodoro done', 'Nice work. Take a break.')
          setS({ ...s, mode: next, cycle, running: false, endAt: null, remaining: LENGTHS[s.preset][next], segAccum: 0, runningSince: null })
        } else {
          notify('Break over', 'Ready for the next step?')
          setS({ ...s, mode: 'focus', running: false, endAt: null, remaining: LENGTHS[s.preset].focus, segAccum: 0, runningSince: null })
        }
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [s])

  const start = useCallback(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    setS((p) => {
      const t = Date.now()
      setNow(t)
      return { ...p, running: true, endAt: t + p.remaining * 1000, runningSince: t }
    })
  }, [])

  const pause = useCallback(() => {
    setS((p) => {
      const t = Date.now()
      return {
        ...p,
        running: false,
        endAt: null,
        remaining: p.endAt ? Math.max(0, (p.endAt - t) / 1000) : p.remaining,
        segAccum: segElapsed(p, t),
        runningSince: null,
      }
    })
  }, [])

  /** Stop the current phase. Partial focus over a minute still counts toward the task. */
  const reset = useCallback(() => {
    setS((p) => {
      if (p.mode === 'focus') {
        const secs = Math.round(segElapsed(p, Date.now()))
        if (secs >= 60) onLogRef.current({ taskId: p.taskId, seconds: secs, completed: false })
      }
      return { ...p, running: false, endAt: null, remaining: LENGTHS[p.preset][p.mode], segAccum: 0, runningSince: null }
    })
  }, [])

  const switchMode = useCallback((mode: Mode) => {
    setS((p) => {
      if (p.mode === 'focus' && mode !== 'focus') {
        const secs = Math.round(segElapsed(p, Date.now()))
        if (secs >= 60) onLogRef.current({ taskId: p.taskId, seconds: secs, completed: false })
      }
      return { ...p, mode, running: false, endAt: null, remaining: LENGTHS[p.preset][mode], segAccum: 0, runningSince: null }
    })
  }, [])

  const setPreset = useCallback((preset: 25 | 50) => {
    setS((p) => (p.running ? p : { ...p, preset, remaining: LENGTHS[preset][p.mode], segAccum: 0 }))
  }, [])

  /** Point the timer at a new task without interrupting the countdown. */
  const handoff = useCallback((taskId: number | null) => {
    setS((p) => {
      if (p.taskId === taskId) return p
      const t = Date.now()
      if (p.mode === 'focus') {
        const secs = Math.round(segElapsed(p, t))
        if (secs >= 60) onLogRef.current({ taskId: p.taskId, seconds: secs, completed: false })
      }
      return { ...p, taskId, segAccum: 0, runningSince: p.running ? t : null }
    })
  }, [])

  return {
    ...s,
    remaining,
    total,
    progress: 1 - remaining / total,
    start,
    pause,
    reset,
    switchMode,
    setPreset,
    handoff,
  }
}
