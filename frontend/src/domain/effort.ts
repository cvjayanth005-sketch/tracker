/**
 * Domain helpers for Effort rating scales (RIR vs RPE).
 *
 * RIR (Reps in Reserve): How many more reps could be performed before technical failure.
 * RPE (Rate of Perceived Exertion): 1-10 subjective exertion scale based on proximity to failure (RPE 10 = 0 RIR).
 */

export type EffortScale = 'rir' | 'rpe'

/**
 * Converts RIR (Reps in Reserve) to RPE (1-10).
 */
export function rirToRpe(rir: number | null | undefined): number | null {
  if (rir === null || rir === undefined || !Number.isFinite(rir)) return null
  const rpe = 10 - rir
  return Math.max(1, Math.min(10, Math.round(rpe * 2) / 2))
}

/**
 * Converts RPE (1-10) to RIR (0+).
 */
export function rpeToRir(rpe: number | null | undefined): number | null {
  if (rpe === null || rpe === undefined || !Number.isFinite(rpe)) return null
  const rir = 10 - rpe
  return Math.max(0, Math.round(rir * 2) / 2)
}

/**
 * Formats effort value for display according to user's scale preference.
 */
export function formatEffort(rir: number | null | undefined, scale: EffortScale = 'rir'): string {
  if (rir === null || rir === undefined || !Number.isFinite(rir)) return '—'
  if (scale === 'rpe') {
    const rpe = rirToRpe(rir)
    return rpe !== null ? `RPE ${rpe}` : '—'
  }
  return `RIR ${rir}`
}

/**
 * Formats a short effort label (e.g. for table headers: 'RIR' vs 'RPE').
 */
export function effortLabel(scale: EffortScale = 'rir'): string {
  return scale === 'rpe' ? 'RPE' : 'RIR'
}
