import { useMemo } from 'react'
import { addDays } from '@/domain/date'
import type { DailyLog, LocalDate, Workout } from '@/domain/types'

function intensity(date: LocalDate, logs: Map<LocalDate, DailyLog>, workouts: Workout[]): number {
  const log = logs.get(date)
  const workout = workouts.some((item) => item.date === date && item.finishedAt)
  const score = (workout ? 2 : 0) + ((log?.runKm ?? 0) > 0 ? 1 : 0) + (log?.foodComplete ? 1 : 0)
  return Math.min(4, score)
}

export function ActivityHeatmap({ today, logs, workouts }: { today: LocalDate; logs: Map<LocalDate, DailyLog>; workouts: Workout[] }) {
  const days = useMemo(() => Array.from({ length: 364 }, (_, index) => addDays(today, -(363 - index))), [today])
  return <div>
    <div className="mb-3 flex items-center justify-between"><div><div className="type-caption font-semibold text-[var(--app-ink)]">Training consistency</div><div className="mt-1 type-micro text-[var(--app-muted)]">Last 52 weeks · strength, runs, and completed food logs</div></div><div className="flex gap-1" aria-label="Activity intensity legend">{[0, 1, 2, 3, 4].map((level) => <span key={level} className={`h-3 w-3 rounded-sm ${level === 0 ? 'bg-[var(--app-inset)]' : `bg-accent/${level * 20 + 10}`}`} />)}</div></div>
    <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-2" aria-label="52 week activity heatmap">
      {days.map((date) => { const level = intensity(date, logs, workouts); return <div key={date} title={`${date}: ${level === 0 ? 'No activity logged' : `${level} activity signals`}`} className={`h-3.5 w-3.5 rounded-sm ring-1 ring-inset ring-[var(--app-line)] ${level === 0 ? 'bg-[var(--app-inset)]' : level === 1 ? 'bg-accent/25' : level === 2 ? 'bg-accent/45' : level === 3 ? 'bg-accent/70' : 'bg-accent'}`} /> })}
    </div>
  </div>
}
