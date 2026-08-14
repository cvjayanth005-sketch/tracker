import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { mealsBetween, mealsForDate } from '@/db/repo'
import { outcomeFor } from '@/domain/compliance'
import { buildConsistencyStrip, buildFoodContext } from '@/domain/foodContext'
import { addDays, formatShort } from '@/domain/date'
import { useDashboard } from '@/hooks/useDashboard'
import { Card, EmptyState, Meter, PageHeader, Pill, SectionTitle } from '@/components/ui'
import { lastSevenDates } from '@/components/SevenDayBars'
import { IntakeExtras } from '@/components/food/IntakeExtras'
import { MacroSummary } from '@/components/food/MacroSummary'
import { MacroTrends } from '@/components/food/MacroTrends'
import { MealHistory } from '@/components/food/MealHistory'
import { MealLogger } from '@/components/food/MealLogger'
import { MealTimeline } from '@/components/food/MealTimeline'
import { QuickAddFoods } from '@/components/food/QuickAddFoods'
import { DayCompleteToggle } from '@/components/food/DayCompleteToggle'
import { NutritionCoachCard } from '@/components/food/NutritionCoachCard'

export default function Food() {
  const dash = useDashboard(30)
  const { today, phase, settings, index } = dash

  const profile = useLiveQuery(() => db.profile.get('me'), [], undefined)
  const todayMeals = useLiveQuery(() => mealsForDate(today), [today], [])
  const historyMeals = useLiveQuery(() => mealsBetween(addDays(today, -21), today), [today], [])

  const dates = useMemo(() => lastSevenDates(today), [today])

  const food = useMemo(
    () => (phase ? buildFoodContext(today, phase, profile, dash.logs, todayMeals ?? []) : null),
    [today, phase, profile, dash.logs, todayMeals],
  )
  const consistency = useMemo(
    () => (phase ? buildConsistencyStrip(today, dash.logs, phase, 14) : null),
    [today, phase, dash.logs],
  )

  if (!phase || !settings || !food) {
    return <EmptyState title="Setting up" body="Preparing your local database." />
  }

  const loggedDays = dates.filter((date) => {
    const log = index.get(date)
    return log?.calories != null || log?.proteinG != null || log?.mealsOnPlan != null
  }).length
  const calorieHits = dates.filter((date) => outcomeFor('calories', index.get(date), phase, date) === 'hit').length
  const proteinHits = dates.filter((date) => outcomeFor('protein', index.get(date), phase, date) === 'hit').length

  return (
    <div className="space-y-1 pb-6">
      <PageHeader
        title="Food"
        eyebrow={`Nutrition · ${formatShort(today)}`}
        action={<Pill tone={loggedDays >= 5 ? 'good' : 'info'}>{loggedDays}/7 logged</Pill>}
      />

      <div className="mt-4">
        <NutritionCoachCard food={food} />
      </div>

      <SectionTitle>Today</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2 lg:items-stretch">
        <MacroSummary food={food} {...(consistency ? { consistency } : {})} />
        <IntakeExtras
          date={today}
          waterMl={food.today.hydration.waterMl}
          waterTargetMl={food.today.hydration.targetMl}
          caffeineMg={food.today.hydration.caffeineMg}
          alcoholUnits={food.today.hydration.alcoholUnits}
          sodiumMg={food.today.hydration.sodiumMg}
          eatingWindow={food.today.eatingWindow}
        />
      </div>

      <SectionTitle>Log a meal</SectionTitle>
      <div className="space-y-3">
        <QuickAddFoods date={today} />
        <MealLogger date={today} />
      </div>

      <SectionTitle
        action={
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-400">{food.today.mealCount} today</span>
            <DayCompleteToggle date={today} complete={food.today.logComplete} />
          </div>
        }
      >
        Today&apos;s meals
      </SectionTitle>
      <MealTimeline meals={todayMeals ?? []} />

      <SectionTitle>Daily history</SectionTitle>
      <MealHistory today={today} logs={dash.logs} meals={historyMeals ?? []} targets={food.macroTargets} />

      <SectionTitle>7-day trends</SectionTitle>
      <MacroTrends today={today} logs={dash.logs} calorieTarget={phase.calories} proteinTarget={phase.proteinG} />

      <SectionTitle>Consistency</SectionTitle>
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex justify-between text-[12px] text-ink-300">
              <span>Calories on target</span>
              <span className="tabular font-semibold text-ink-100">{calorieHits}/7</span>
            </div>
            <Meter value={(calorieHits / 7) * 100} tone={calorieHits >= 5 ? 'accent' : 'warn'} />
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-[12px] text-ink-300">
              <span>Protein on target</span>
              <span className="tabular font-semibold text-ink-100">{proteinHits}/7</span>
            </div>
            <Meter value={(proteinHits / 7) * 100} tone={proteinHits >= 5 ? 'info' : 'warn'} />
          </div>
        </div>
      </Card>
    </div>
  )
}
