import { useSyncExternalStore } from 'react'
import {
  getThemePreference,
  resolveTheme,
  setThemePreference,
  subscribeTheme,
  type ResolvedTheme,
  type ThemePreference,
} from './theme'

/**
 * React binding for the theme store. Returns the stored preference, the
 * concrete resolved theme, and a setter — re-rendering on both explicit
 * changes and OS-theme changes while in "system".
 */
export function useTheme(): {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (pref: ThemePreference) => void
} {
  const preference = useSyncExternalStore(subscribeTheme, getThemePreference, () => 'system' as const)
  return {
    preference,
    resolved: resolveTheme(preference),
    setPreference: setThemePreference,
  }
}
