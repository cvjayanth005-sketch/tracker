/** Number formatting shared by every screen. No React, no styling. */

export function fmt(value: number | null, digits = 1, fallback = '—'): string {
  if (value === null || Number.isNaN(value)) return fallback
  return value.toFixed(digits)
}

export function fmtInt(value: number | null, fallback = '—'): string {
  if (value === null || Number.isNaN(value)) return fallback
  return Math.round(value).toLocaleString()
}

/**
 * Formatted value for `Stat`, preserving null.
 *
 * `fmt` returns the string "—" for a missing value, which `Stat` would then
 * render as an ordinary bright value. These keep unknown as `null` all the way
 * into the component so it gets the muted treatment it is supposed to.
 */
export function statVal(value: number | null | undefined, digits = 1): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  return value.toFixed(digits)
}

export function statInt(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  return Math.round(value).toLocaleString()
}

/**
 * Weekly change as an arrow plus magnitude.
 *
 * A bare signed number is ambiguous here — "-0.42" next to a falling chart
 * reads as a gain to half the people who see it. The arrow removes the doubt
 * and fits a narrow stat tile, which a word like "down" does not.
 */
export function changeLabel(lossKgPerWeek: number | null | undefined): string | null {
  if (lossKgPerWeek === null || lossKgPerWeek === undefined) return null
  if (Math.abs(lossKgPerWeek) < 0.005) return '±0.00'
  return `${lossKgPerWeek > 0 ? '↓' : '↑'} ${Math.abs(lossKgPerWeek).toFixed(2)}`
}
