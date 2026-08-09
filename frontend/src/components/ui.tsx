import type { ReactNode } from 'react'
import { useLiquidGlass } from '@/hooks/useLiquidGlass'

/**
 * Glass surface.
 *
 * `refract` opts into real edge refraction (Chromium only, frosted fallback
 * elsewhere). It costs a canvas map plus a per-frame GPU filter, so reserve it
 * for a few structural panels — the coach card, hero stats, the tab bar — and
 * leave list items and form rows on the plain CSS dressing, which looks nearly
 * identical for a fraction of the cost.
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
  const base = 'glass rounded-3xl p-4 sm:p-5'

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
    <div className="mb-2.5 mt-7 flex items-baseline justify-between px-1 first:mt-0">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
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
      ? 'text-accent'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'bad'
          ? 'text-alert'
          : 'text-ink-50'
  return (
    <div className="glass-inset rounded-2xl px-3.5 py-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-400">
        {label}
      </div>
      <div
        className={`tabular mt-1 text-xl font-semibold leading-none tracking-tight sm:text-2xl ${toneClass}`}
      >
        {value === null ? <span className="text-ink-600">—</span> : value}
        {value !== null && unit ? (
          <span className="ml-1 text-xs font-normal text-ink-400">{unit}</span>
        ) : null}
      </div>
      {sub ? <div className="mt-1.5 text-[11px] leading-tight text-ink-400">{sub}</div> : null}
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
    neutral: 'bg-white/8 text-ink-200 ring-white/10',
    good: 'bg-accent/15 text-accent ring-accent/25',
    warn: 'bg-warn/15 text-warn ring-warn/25',
    bad: 'bg-alert/15 text-alert ring-alert/25',
    info: 'bg-info/15 text-info ring-info/25',
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
      'bg-accent text-ink-950 font-semibold shadow-[0_8px_24px_-8px] shadow-accent/50 active:bg-accent-dim',
    secondary:
      'bg-white/8 text-ink-50 ring-1 ring-inset ring-white/12 active:bg-white/12',
    ghost: 'bg-transparent text-ink-300 active:bg-white/5',
    danger: 'bg-alert/15 text-alert ring-1 ring-inset ring-alert/25 active:bg-alert/25',
  } as const
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded-xl px-4 text-sm transition-colors disabled:opacity-40 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="text-center">
      <div className="text-sm font-medium text-ink-200">{title}</div>
      <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-ink-400">{body}</p>
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
    accent: 'bg-accent shadow-[0_0_12px_-2px] shadow-accent/60',
    warn: 'bg-warn shadow-[0_0_12px_-2px] shadow-warn/60',
    alert: 'bg-alert shadow-[0_0_12px_-2px] shadow-alert/60',
    info: 'bg-info shadow-[0_0_12px_-2px] shadow-info/60',
  } as const
  if (value === null) {
    return (
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/6">
        <div className="h-full w-full bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.08)_4px,rgba(255,255,255,0.08)_8px)]" />
      </div>
    )
  }
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/6">
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
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-400">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      </div>
      {action}
    </header>
  )
}
