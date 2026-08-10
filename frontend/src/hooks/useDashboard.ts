import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { allPhases, getSettings, logsForAnalysis, recentRuns, resolveActivePhase } from '@/db/repo'
import { complianceFor, type ComplianceReport } from '@/domain/compliance'
import { addDays, todayIn } from '@/domain/date'
import { recommend, reviewPhase, type PhaseReview, type Recommendation } from '@/domain/rules'
import {
  derivedTargetPaces,
  easyPaceTrend,
  longRunProgression,
  paceProgression,
  volumeRamp,
  weeklyRunVolume,
  type DerivedTargetPaces,
  type LongRunProgression,
  type PaceProgression,
  type PaceTrend,
  type VolumeRamp,
  type WeeklyVolume,
} from '@/domain/running'
import {
  indexLogs,
  trendSeries,
  weeklyChange,
  windowAverage,
  windowTotal,
  type LogIndex,
  type TrendPoint,
  type WeeklyChange,
} from '@/domain/trend'
import type { DailyLog, LocalDate, Phase, Run, Settings } from '@/domain/types'
import { API_BASE, scheduleSync } from '@/sync/client'

/**
 * Single read path for the whole app.
 *
 * Every screen derives from this: nothing computes its own averages, so the
 * number on Today and the number on Progress cannot drift apart.
 */

/** "Today" recomputed on focus and at the minute boundary, so a day rollover lands. */
export function useToday(timezone: string | undefined): LocalDate {
  const tz = timezone ?? 'UTC'
  const [today, setToday] = useState<LocalDate>(() => todayIn(tz))

  useEffect(() => {
    const refresh = () => setToday(todayIn(tz))
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [tz])

  return today
}

export interface WeekAverages {
  calories: number | null
  protein: number | null
  steps: number | null
  sleep: number | null
  runKmTotal: number
}

export interface Dashboard {
  ready: boolean
  today: LocalDate
  settings: Settings | undefined
  phases: Phase[]
  phase: Phase | undefined
  logs: DailyLog[]
  runs: Run[]
  index: LogIndex
  todayLog: DailyLog | undefined
  change: WeeklyChange | undefined
  compliance: ComplianceReport | undefined
  recommendation: Recommendation | undefined
  review: PhaseReview | undefined
  series: TrendPoint[]
  weekAverages: WeekAverages | undefined
  easyPace: PaceTrend
  paceProgression: PaceProgression
  weeklyRunVolume: WeeklyVolume
  volumeRamp: VolumeRamp
  longRunProgression: LongRunProgression
  derivedTargetPaces: DerivedTargetPaces | null
}

export function useDashboard(rangeDays = 90): Dashboard {
  const settings = useLiveQuery(() => getSettings(), [])
  const phases = useLiveQuery(() => allPhases(), [], [] as Phase[])
  const today = useToday(settings?.timezone)

  // `db.dailyLogs` in the dependency list is not meaningful to Dexie; the live
  // query re-runs on any write to the tables it touches.
  const logs = useLiveQuery(
    () => logsForAnalysis(today, Math.max(rangeDays, 120)),
    [today, rangeDays],
    [] as DailyLog[],
  )
  const runs = useLiveQuery(() => recentRuns(240), [], [] as Run[])

  const phase = useMemo(
    () => resolveActivePhase(phases ?? [], settings),
    [phases, settings],
  )

  return useMemo(() => {
    const index = indexLogs(logs ?? [])
    const ready = Boolean(settings && phase)

    if (!settings || !phase) {
      return {
        ready: false,
        today,
        settings,
        phases: phases ?? [],
        phase,
        logs: logs ?? [],
        runs: runs ?? [],
        index,
        todayLog: index.get(today),
        change: undefined,
        compliance: undefined,
        recommendation: undefined,
        review: undefined,
        series: [],
        weekAverages: undefined,
        easyPace: easyPaceTrend(runs ?? [], today),
        paceProgression: paceProgression(runs ?? [], today),
        weeklyRunVolume: weeklyRunVolume(runs ?? [], today),
        volumeRamp: volumeRamp(runs ?? [], today),
        longRunProgression: longRunProgression(runs ?? [], today),
        derivedTargetPaces: null,
      }
    }

    const compliance = complianceFor(index, today, phase)
    const recommendation = recommend(index, today, phase, compliance, settings)
    const review = reviewPhase(index, today, phase, settings)
    const change = weeklyChange(index, today, settings.minReadingsPerWindow)
    const series = trendSeries(
      index,
      addDays(today, -(rangeDays - 1)),
      today,
      settings.minReadingsPerWindow,
    )

    const weekAverages: WeekAverages = {
      calories: windowAverage(index, today, (l) => l.calories).average,
      protein: windowAverage(index, today, (l) => l.proteinG).average,
      steps: windowAverage(index, today, (l) => l.steps).average,
      sleep: windowAverage(index, today, (l) => l.sleepHours).average,
      runKmTotal: windowTotal(index, today, (l) => l.runKm).total,
    }
    const easyPace = easyPaceTrend(runs ?? [], today)

    return {
      ready,
      today,
      settings,
      phases: phases ?? [],
      phase,
      logs: logs ?? [],
      runs: runs ?? [],
      index,
      todayLog: index.get(today),
      change,
      compliance,
      recommendation,
      review,
      series,
      weekAverages,
      easyPace,
      paceProgression: paceProgression(runs ?? [], today),
      weeklyRunVolume: weeklyRunVolume(runs ?? [], today),
      volumeRamp: volumeRamp(runs ?? [], today),
      longRunProgression: longRunProgression(runs ?? [], today),
      derivedTargetPaces: derivedTargetPaces(easyPace),
    }
  }, [logs, runs, settings, phase, phases, today, rangeDays])
}

/** Live sync/backup state for the header banner. */
export function useSyncMeta() {
  return useLiveQuery(() => db.syncMeta.get('sync'), [])
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** Push local changes after a short quiet period and retry when connectivity returns. */
export function useAutoSync(): void {
  const meta = useSyncMeta()
  const localVersion = meta?.localVersion
  const syncedVersion = meta?.syncedVersion

  useEffect(() => {
    if (!API_BASE) return
    if (localVersion === undefined || syncedVersion === undefined) return
    if (localVersion === syncedVersion) return
    scheduleSync(1500)
  }, [localVersion, syncedVersion])

  useEffect(() => {
    if (!API_BASE) return
    const retry = () => scheduleSync(0)
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [])
}
