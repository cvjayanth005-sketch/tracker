/**
 * Canonical unit handling.
 *
 * The store only ever holds centimetres and kilograms. Imperial is a display
 * and entry concern, converted at the boundary, because storing whichever unit
 * the user happened to pick would push conversion into every consumer and
 * guarantee that one of them eventually forgets.
 *
 * Rounding is applied at a precision that survives a round trip through the
 * other unit without visible drift, and never at a precision that implies more
 * accuracy than a bathroom scale has.
 */

const CM_PER_INCH = 2.54
const INCHES_PER_FOOT = 12
const KG_PER_LB = 0.45359237

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** Rejects NaN and non-finite input, which `Number('')` and friends produce. */
function clean(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  return Number.isFinite(value) ? value : null
}

// --- Length -----------------------------------------------------------------

export function inchesToCm(inches: number | null): number | null {
  const value = clean(inches)
  return value === null ? null : round(value * CM_PER_INCH, 1)
}

export function cmToInches(cm: number | null): number | null {
  const value = clean(cm)
  return value === null ? null : round(value / CM_PER_INCH, 1)
}

/** Feet-and-inches entry, the way imperial height is actually spoken. */
export function feetInchesToCm(feet: number | null, inches: number | null): number | null {
  const f = clean(feet)
  const i = clean(inches)
  if (f === null && i === null) return null
  return round(((f ?? 0) * INCHES_PER_FOOT + (i ?? 0)) * CM_PER_INCH, 1)
}

export function cmToFeetInches(cm: number | null): { feet: number; inches: number } | null {
  const value = clean(cm)
  if (value === null) return null
  const totalInches = value / CM_PER_INCH
  let feet = Math.floor(totalInches / INCHES_PER_FOOT)
  let inches = Math.round(totalInches - feet * INCHES_PER_FOOT)
  // 11.6" rounds to 12", which is another foot rather than a nonsense reading.
  if (inches === INCHES_PER_FOOT) {
    feet += 1
    inches = 0
  }
  return { feet, inches }
}

// --- Mass -------------------------------------------------------------------

export function lbToKg(lb: number | null): number | null {
  const value = clean(lb)
  return value === null ? null : round(value * KG_PER_LB, 1)
}

export function kgToLb(kg: number | null): number | null {
  const value = clean(kg)
  return value === null ? null : round(value / KG_PER_LB, 1)
}

/** Normalizes a weight entered in either unit to canonical kilograms. */
export function toCanonicalKg(value: number | null, unit: 'kg' | 'lb'): number | null {
  return unit === 'kg' ? (clean(value) === null ? null : round(clean(value)!, 1)) : lbToKg(value)
}

/** Normalizes a height entered in either unit to canonical centimetres. */
export function toCanonicalCm(value: number | null, unit: 'cm' | 'in'): number | null {
  return unit === 'cm' ? (clean(value) === null ? null : round(clean(value)!, 1)) : inchesToCm(value)
}

// --- Plausibility -----------------------------------------------------------

/**
 * Ranges wide enough to admit any real adult and narrow enough to catch a unit
 * mix-up — someone typing 170 pounds into a kilograms field, or their height in
 * inches into a centimetre one. This is a sanity check for the UI to warn on,
 * never a gate that refuses to store what a user insists is true.
 */
export const PLAUSIBLE_HEIGHT_CM = { min: 120, max: 230 } as const
export const PLAUSIBLE_WEIGHT_KG = { min: 30, max: 300 } as const

export function isPlausibleHeightCm(cm: number | null): boolean {
  return cm !== null && cm >= PLAUSIBLE_HEIGHT_CM.min && cm <= PLAUSIBLE_HEIGHT_CM.max
}

export function isPlausibleWeightKg(kg: number | null): boolean {
  return kg !== null && kg >= PLAUSIBLE_WEIGHT_KG.min && kg <= PLAUSIBLE_WEIGHT_KG.max
}
