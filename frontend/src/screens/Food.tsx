import { useMemo } from 'react'
import { outcomeFor } from '@/domain/compliance'
import { useDashboard } from '@/hooks/useDashboard'
import { Card, EmptyState, Meter, PageHeader, Pill, SectionTitle, Stat } from '@/components/ui'
import { statInt } from '@/components/format'
import { lastSevenDates, SevenDayBars } from '@/components/SevenDayBars'

export default function Food() {
  const dash = useDashboard(30)
  const { today, phase, settings, index } = dash

  const dates = useMemo(() => lastSevenDates(today), [today])

  if (!phase || !settings) {
    return <EmptyState title="Setting up" body="Preparing your local database." />
  }

  const calories = dates.map((date) => ({
    date,
    value: index.get(date)?.calories ?? null,
    target: phase.calories,
  }))
  const protein = dates.map((date) => ({
    date,
    value: index.get(date)?.proteinG ?? null,
    target: phase.proteinG,
  }))
  const meals = dates.map((date) => ({
    date,
    value: index.get(date)?.mealsOnPlan ?? null,
    target: phase.mealsPerDay,
  }))
  const loggedDays = dates.filter((date) => {
    const log = index.get(date)
    return log?.calories != null || log?.proteinG != null || log?.mealsOnPlan != null
  }).length
  const calorieHits = dates.filter(
    (date) => outcomeFor('calories', index.get(date), phase, date) === 'hit',
  ).length
  const proteinHits = dates.filter(
    (date) => outcomeFor('protein', index.get(date), phase, date) === 'hit',
  ).length

  return (
    <div className="pb-4">
      <PageHeader
        title="Food"
        eyebrow="Nutrition · last 7 days"
        action={<Pill tone={loggedDays >= 5 ? 'good' : 'info'}>{loggedDays}/7 logged</Pill>}
      />

      <SectionTitle>Average Cards</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Avg calories"
          value={statInt(dash.weekAverages?.calories)}
          unit="kcal"
          sub={`target ${phase.calories.toLocaleString()}`}
        />
        <Stat
          label="Avg protein"
          value={statInt(dash.weekAverages?.protein)}
          unit="g"
          sub={`target ${phase.proteinG}g`}
        />
        <Stat label="Food coverage" value={`${Math.round((loggedDays / 7) * 100)}`} unit="%" sub={`${loggedDays} days visible`} />
        <Stat label="Meals target" value={phase.mealsPerDay} sub="daily plan" />
      </div>

      <SectionTitle action={<span className="text-xs text-ink-400">{calorieHits}/7 hit</span>}>
        Calories
      </SectionTitle>
      <Card>
        <SevenDayBars
          points={calories}
          tone="bg-[linear-gradient(180deg,#ff7a18,#ffd166)]"
          unit="kcal"
        />
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[11px] text-ink-400">
            <span>Target consistency</span>
            <span>{calorieHits}/7</span>
          </div>
          <Meter value={(calorieHits / 7) * 100} tone={calorieHits >= 5 ? 'accent' : 'warn'} />
        </div>
      </Card>

      <SectionTitle action={<span className="text-xs text-ink-400">{proteinHits}/7 hit</span>}>
        Protein
      </SectionTitle>
      <Card>
        <SevenDayBars points={protein} tone="bg-info" unit="g" />
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[11px] text-ink-400">
            <span>Protein consistency</span>
            <span>{proteinHits}/7</span>
          </div>
          <Meter value={(proteinHits / 7) * 100} tone={proteinHits >= 5 ? 'accent' : 'info'} />
        </div>
      </Card>

      <SectionTitle>Meals On Plan</SectionTitle>
      <Card>
        <SevenDayBars points={meals} tone="bg-accent" />
        <p className="mt-3 text-[12px] leading-relaxed text-ink-400">
          Empty dots mean the day has no food log. Bars show the actual logged amount against the
          target marker.
        </p>
      </Card>
    </div>
  )
}
