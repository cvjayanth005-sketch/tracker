import type { ReactNode } from 'react'
import { useLiquidGlass } from '@/hooks/useLiquidGlass'

/**
 * Card surface.
 *
 * Default cards are plain `surface` panels: no backdrop blur, no refraction.
 * `refract` opts into the expensive liquid-glass path and should stay reserved
 * for at most one desktop hero/chart surface. Never use it for forms, lists,
 * repeated cards, or scroll-heavy panels.
 */
export function Card({
  children,
  className = '',
  onClick,
  refract = false,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  refract?: boolean
}) {
  const ref = useLiquidGlass<HTMLDivElement>({ scale: -90, chroma: 5, blur: 4 }, refract)
  const base = `${refract ? 'glass' : 'surface'} rounded-lg p-4 sm:p-5`

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} w-full text-left transition-transform active:scale-[0.995] ${className}`}
      >
        {children}
      </button>
    )
  }
  return (
    <div ref={refract ? ref : undefined} className={`${base} ${className}`}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-7 flex items-baseline justify-between first:mt-0">
      <h2 className="text-[11px] font-semibold uppercase tracking-normal text-ink-500">
        {children}
      </h2>
      {action}
    </div>
  )
}

/**
 * A metric readout. `value === null` renders an em dash rather than a zero —
 * the difference between "unknown" and "zero" has to survive all the way to
 * the screen or the user will read gaps as failures.
 */
export function Stat({
  label,
  value,
  unit,
  sub,
  tone = 'default',
}: {
  label: string
  value: number | string | null
  unit?: string
  sub?: string
  tone?: 'default' | 'good' | 'warn' | 'bad'
}) {
  const toneClass =
    tone === 'good'
      ? 'text-success-ink'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'bad'
          ? 'text-alert'
          : 'text-ink-50'
  return (
    <div className="glass-inset rounded-lg px-3.5 py-3">
      <div className="text-[10px] font-medium uppercase tracking-normal text-ink-500">
        {label}
      </div>
      <div
        className={`tabular mt-1 text-xl font-semibold leading-none tracking-tight sm:text-2xl ${toneClass}`}
      >
        {value === null ? <span className="text-ink-600">—</span> : value}
        {value !== null && unit ? (
          <span className="ml-1 text-xs font-normal text-ink-500">{unit}</span>
        ) : null}
      </div>
      {sub ? <div className="mt-1.5 text-[11px] leading-tight text-ink-500">{sub}</div> : null}
    </div>
  )
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info'
}) {
  const tones = {
    neutral: 'bg-warm/10 text-ink-300 ring-warm/20',
    good: 'bg-success/55 text-success-ink ring-success',
    warn: 'bg-energy/65 text-energy-ink ring-energy',
    bad: 'bg-strain/55 text-alert ring-alert/30',
    info: 'bg-recovery/60 text-recovery-ink ring-recovery',
  } as const
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  const variants = {
    primary:
      'app-button-primary',
    secondary:
      'app-button-secondary',
    ghost: 'app-button-quiet',
    danger: 'bg-alert/15 text-alert ring-1 ring-inset ring-alert/25 active:bg-alert/25',
  } as const
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`app-button disabled:opacity-40 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="text-center">
      <div className="text-sm font-medium text-ink-200">{title}</div>
      <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-ink-500">{body}</p>
    </Card>
  )
}

/** Horizontal progress bar with an explicit unknown state. */
export function Meter({
  value,
  max = 100,
  tone = 'accent',
}: {
  value: number | null
  max?: number
  tone?: 'accent' | 'warn' | 'alert' | 'info'
}) {
  const tones = {
    accent: 'bg-accent',
    warn: 'bg-energy',
    alert: 'bg-alert shadow-[0_0_12px_-2px] shadow-alert/60',
    info: 'bg-recovery',
  } as const
  if (value === null) {
    return (
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
        <div className="h-full w-full bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(17,22,18,0.08)_4px,rgba(17,22,18,0.08)_8px)]" />
      </div>
    )
  }
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${tones[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** Page heading shared by every screen, so titles line up across tabs. */
export function PageHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string
  title: string
  action?: ReactNode
}) {
  return (
    <header className="flex items-end justify-between gap-3 pt-4 sm:pt-6">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[11px] font-medium uppercase tracking-normal text-ink-500">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-normal text-ink-50 sm:text-3xl">{title}</h1>
      </div>
      {action}
    </header>
  )
}
