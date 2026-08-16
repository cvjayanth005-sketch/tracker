import { CoachChatButton } from '@/components/CoachChatButton'
import type { FoodContext } from '@/domain/foodContext'

const FOOD_STARTERS = [
  'What should I eat next to hit my targets?',
  'How can I improve my physique from my food?',
  'Is my protein intake good today?',
  'Suggest a high-protein snack under 250 kcal.',
] as const

/**
 * The insight the coach leads with before the user asks anything — computed
 * locally from the food context so it is instant and works offline. Falls back
 * to an encouraging on-track line when nothing needs attention.
 */
function leadInsight(food: FoodContext): { text: string; tone: 'good' | 'warn' } {
  if (food.observations.length > 0) return { text: food.observations[0]!, tone: 'warn' }
  if (!food.today.logged) {
    return { text: 'Log your first meal and I will start tuning your day toward your goal.', tone: 'good' }
  }
  const remaining = food.today.proteinRemaining
  if (remaining !== null && remaining > 0) {
    return { text: `On track — about ${remaining} g of protein and room to finish the day cleanly.`, tone: 'good' }
  }
  return { text: 'Nicely balanced so far today. Keep the same shape for the rest of your meals.', tone: 'good' }
}

export function NutritionCoachCard({ food }: { food: FoodContext }) {
  const insight = leadInsight(food)
  const goalWord =
    food.physiqueGoal?.direction === 'lose'
      ? 'fat loss'
      : food.physiqueGoal?.direction === 'gain'
        ? 'muscle gain'
        : 'your physique'

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden radius-inset border border-[var(--app-line)] bg-[linear-gradient(135deg,rgba(57,255,20,0.14),rgba(0,240,255,0.10)_45%,rgba(185,139,255,0.12))] p-4 sm:p-5">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center radius-control text-[11px] font-black ${
              insight.tone === 'warn' ? 'bg-warn text-ink-950' : 'bg-accent text-ink-950'
            }`}
          >
            AI
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--app-ink-soft)]">
              Nutrition coach · tuned for {goalWord}
            </div>
            <p className="mt-1 text-[15px] font-medium leading-snug text-[var(--app-ink)]">{insight.text}</p>
          </div>
        </div>
      </div>

      <CoachChatButton
        placement="card"
        title="Nutrition Coach"
        subtitle={
          <>
            Sees today&apos;s {food.today.mealCount} meal{food.today.mealCount === 1 ? '' : 's'} ·{' '}
            {food.weekAverages.days}-day macro history
          </>
        }
        starters={FOOD_STARTERS}
      />
    </div>
  )
}
