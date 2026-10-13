import { createContext, useContext, type ReactNode } from 'react'
import { api, localDate } from './api'
import { usePomodoro } from './usePomodoro'

type Timer = ReturnType<typeof usePomodoro>
const TimerContext = createContext<Timer | null>(null)

export const FOCUS_LOGGED = 'nextstep:focus-logged'

/** Lives in the app shell so the timer keeps running (and chiming) across pages. */
export function TimerProvider({ children }: { children: ReactNode }) {
  const timer = usePomodoro((log) => {
    api('/focus', {
      body: { task_id: log.taskId, date: localDate(), seconds: log.seconds, completed: log.completed },
    })
      .catch(() => {})
      .finally(() => window.dispatchEvent(new Event(FOCUS_LOGGED)))
  })
  return <TimerContext.Provider value={timer}>{children}</TimerContext.Provider>
}

export function useTimer() {
  const t = useContext(TimerContext)
  if (!t) throw new Error('useTimer outside TimerProvider')
  return t
}
