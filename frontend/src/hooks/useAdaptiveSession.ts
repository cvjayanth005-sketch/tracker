import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { startWorkout, upsertLog } from '@/db/repo'
import { buildAdaptiveSession } from '@/domain/adaptiveTraining'
import { dayOfWeek } from '@/domain/date'
import { useDashboard, type Dashboard } from '@/hooks/useDashboard'

/**
 * Today's adaptive session, plus the history it was built from.
 *
 * Pulled out of the coach chat panel so the readiness card can render on
 * Activity on its own — the day's suggested session and its "apply" action
 * are a thing to act on every training day, not something that should be
 * hidden behind opening a chat.
 */
export function useAdaptiveSession() {
  const dash = useDashboard(30)
  const navigate = useNavigate()

  const recentWorkouts = useLiveQuery(
    () => db.workouts.orderBy('date').reverse().limit(16).toArray(),
    [],
    [],
  )
  const recentSets = useLiveQuery(
    async () => {
      const workoutIds = (recentWorkouts ?? []).map((workout) => workout.id)
      if (workoutIds.length === 0) return []
      return db.workoutSets.where('workoutId').anyOf(workoutIds).toArray()
    },
    [recentWorkouts?.map((workout) => workout.id).join('|') ?? ''],
    [],
  )
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [])
  const todayWorkout = useLiveQuery(
    () => db.workouts.where('date').equals(dash.today).first(),
    [dash.today],
  )
  const todaySetCount = useLiveQuery(
    () =>
      todayWorkout
        ? db.workoutSets.where('workoutId').equals(todayWorkout.id).count()
        : Promise.resolve(0),
    [todayWorkout?.id],
    0,
  )

  const history = useMemo(
    () =>
      (recentWorkouts ?? []).map((workout) => ({
        workout,
        sets: (recentSets ?? []).filter((set) => set.workoutId === workout.id),
      })),
    [recentSets, recentWorkouts],
  )
  const todaySchedule = dash.phase?.schedule.find((day) => day.dow === dayOfWeek(dash.today))

  const adaptiveSession = useMemo(() => {
    if (
      !dash.phase ||
      !todaySchedule?.gym ||
      todaySchedule.sessionType === 'rest' ||
      todaySchedule.sessionType === 'run'
    ) {
      return null
    }
    return buildAdaptiveSession({
      sessionType: todaySchedule.sessionType,
      targetSleepHours: dash.phase.sleepHours,
      sleepScore: dash.todaySleepScore.score,
      log: dash.todayLog,
      exercises: exercises ?? [],
      history: history.filter((item) => item.workout.date !== dash.today),
    })
  }, [dash.phase, dash.today, dash.todayLog, dash.todaySleepScore.score, exercises, history, todaySchedule])

  const applyAdaptiveSession = async () => {
    if (!adaptiveSession) return
    if (!todayWorkout?.finishedAt && todaySetCount === 0) {
      await startWorkout(dash.today, adaptiveSession.sessionType, adaptiveSession)
      await upsertLog(dash.today, { gymDone: true })
    }
    navigate('/workout')
  }

  return {
    dash,
    recentWorkouts: recentWorkouts ?? [],
    exercises: exercises ?? [],
    history,
    todaySchedule,
    todayWorkout,
    todaySetCount,
    adaptiveSession,
    applyAdaptiveSession,
  }
}

export type AdaptiveSessionState = ReturnType<typeof useAdaptiveSession>
export type { Dashboard }
