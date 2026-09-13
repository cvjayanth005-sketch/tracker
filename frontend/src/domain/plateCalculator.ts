/**
 * Barbell Plate Calculator domain logic.
 * Calculates standard Olympic barbell plate loading per side with IWF color coding.
 */

export interface PlateSpec {
  weight: number
  color: string
  textColor: string
  heightPct: number // Relative height for visual sleeve rendering (0.4 to 1.0)
}

export const METRIC_PLATES: PlateSpec[] = [
  { weight: 25, color: '#EF4444', textColor: '#FFFFFF', heightPct: 1.0 },
  { weight: 20, color: '#3B82F6', textColor: '#FFFFFF', heightPct: 1.0 },
  { weight: 15, color: '#EAB308', textColor: '#000000', heightPct: 0.9 },
  { weight: 10, color: '#22C55E', textColor: '#FFFFFF', heightPct: 0.8 },
  { weight: 5, color: '#F1F5F9', textColor: '#0F172A', heightPct: 0.65 },
  { weight: 2.5, color: '#475569', textColor: '#FFFFFF', heightPct: 0.55 },
  { weight: 1.25, color: '#94A3B8', textColor: '#0F172A', heightPct: 0.45 },
  { weight: 0.5, color: '#F97316', textColor: '#FFFFFF', heightPct: 0.38 },
]

export interface PlateLoadingResult {
  targetWeight: number
  barWeight: number
  weightPerSide: number
  totalCalculatedWeight: number
  remainder: number
  plates: Array<{
    spec: PlateSpec
    count: number
  }>
  plateSequence: PlateSpec[] // Ordered from inside sleeve to outside
}

/**
 * Calculates plates required on each side of the barbell.
 */
export function calculatePlates(
  targetWeight: number,
  barWeight: number = 20,
  availablePlates: PlateSpec[] = METRIC_PLATES,
): PlateLoadingResult {
  if (targetWeight <= barWeight || !Number.isFinite(targetWeight)) {
    return {
      targetWeight: Math.max(0, targetWeight || 0),
      barWeight,
      weightPerSide: 0,
      totalCalculatedWeight: barWeight,
      remainder: 0,
      plates: [],
      plateSequence: [],
    }
  }

  let remainingPerSide = Math.round(((targetWeight - barWeight) / 2) * 100) / 100
  const weightPerSide = remainingPerSide
  const platesSummary: Array<{ spec: PlateSpec; count: number }> = []
  const plateSequence: PlateSpec[] = []

  // Sort available plates descending
  const sorted = [...availablePlates].sort((a, b) => b.weight - a.weight)

  for (const plate of sorted) {
    if (remainingPerSide >= plate.weight - 0.001) {
      const count = Math.floor((remainingPerSide + 0.001) / plate.weight)
      if (count > 0) {
        platesSummary.push({ spec: plate, count })
        for (let i = 0; i < count; i++) {
          plateSequence.push(plate)
        }
        remainingPerSide = Math.round((remainingPerSide - count * plate.weight) * 100) / 100
      }
    }
  }

  const loadedPerSide = plateSequence.reduce((sum, p) => sum + p.weight, 0)
  const totalCalculated = barWeight + loadedPerSide * 2

  return {
    targetWeight,
    barWeight,
    weightPerSide,
    totalCalculatedWeight: totalCalculated,
    remainder: remainingPerSide,
    plates: platesSummary,
    plateSequence,
  }
}
