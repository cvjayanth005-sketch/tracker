/**
 * Theme preference: light, dark, or follow the operating system.
 *
 * The resolved theme (always concrete light/dark) is written to
 * `document.documentElement`'s `data-theme` so CSS can key off it. The very
 * first application happens in an inline script in index.html — before React,
 * before first paint — so the page never flashes the wrong theme on load. This
 * module owns every application after that, plus the OS-change listener that
 * keeps "system" live.
 */

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'formara-theme'

const listeners = new Set<() => void>()
let systemMedia: MediaQueryList | null = null

function readSystem(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getThemePreference(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'system'
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? readSystem() : pref
}

function applyResolved(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', resolved)
  // Keep the browser UI (status bar, address bar) in step with the page.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#44444e' : '#fbfcfa')
}

export function setThemePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
    // Private-mode storage failures are non-fatal; the choice just will not
    // persist across reloads.
  }
  applyResolved(resolveTheme(pref))
  listeners.forEach((fn) => fn())
}

/**
 * Attach the OS-change listener. While the preference is "system", an OS theme
 * switch re-resolves and re-applies live; an explicit light/dark choice ignores
 * it. Call once at startup.
 */
export function initTheme(): void {
  if (typeof window === 'undefined' || !window.matchMedia) return
  applyResolved(resolveTheme(getThemePreference()))
  systemMedia ??= window.matchMedia('(prefers-color-scheme: dark)')
  const onSystemChange = () => {
    if (getThemePreference() === 'system') {
      applyResolved(readSystem())
      listeners.forEach((fn) => fn())
    }
  }
  systemMedia.addEventListener('change', onSystemChange)
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
