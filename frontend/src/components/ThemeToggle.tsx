import { useTheme } from '@/theme/useTheme'
import type { ThemePreference } from '@/theme/theme'

/**
 * Three-way theme control: Light, Dark, or System.
 *
 * A segmented control rather than a single on/off switch, because "follow the
 * OS" is a first-class choice here — new users default to it, and hiding it
 * behind a toggle would make that default unreachable once they touch the
 * control.
 */

const OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

export function ThemeToggle() {
  const { preference, setPreference } = useTheme()

  return (
    <div className="account-theme-toggle" role="radiogroup" aria-label="App theme">
      {OPTIONS.map((option) => {
        const active = preference === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(option.value)}
            className={`account-theme-option ${active ? 'is-active' : ''}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
