import { openCoachWithPrompt } from '@/components/coachEvents'
import type { FoodContext } from '@/domain/foodContext'

/**
 * The insight the coach leads with before the user asks anything — computed
 * locally from the food context so it is instant and works offline. Falls back
 * to an encouraging on-track line when nothing needs attention.
 *
 * The conversation itself now lives in the shell-level coach (one Formara
 * Coach for the whole app, not a separate box per tab) — this card is the
 * quiet, always-visible nudge that used to sit above it, and tapping it opens
 * that same coach already primed with a food-relevant question.
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
    <button
      type="button"
      onClick={() => openCoachWithPrompt('What should I eat next to hit my targets?')}
      className="motion-press relative block w-full overflow-hidden radius-inset border border-[var(--app-line)] bg-[linear-gradient(135deg,rgba(57,255,20,0.14),rgba(0,240,255,0.10)_45%,rgba(185,139,255,0.12))] p-4 text-left sm:p-5"
    >
      <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center radius-control type-caption font-black ${insight.tone === 'warn' ? 'bg-warn text-ink-950' : 'bg-accent text-ink-950'}`}
        >
          AI
        </span>
        <div className="min-w-0">
          <div className="type-micro font-semibold text-[var(--app-ink-soft)]">
            Nutrition coach · tuned for {goalWord}
          </div>
          <p className="mt-1 type-body font-medium leading-snug text-[var(--app-ink)]">{insight.text}</p>
          <p className="mt-1.5 type-caption text-[var(--app-muted)]">Tap to ask the coach about it</p>
        </div>
      </div>
    </button>
  )
}
