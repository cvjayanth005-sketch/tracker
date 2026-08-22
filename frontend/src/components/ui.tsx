import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '@/components/Icon'
import { useLiquidGlass } from '@/hooks/useLiquidGlass'

/**
 * Back arrow for navigating to the previous screen.
 *
 * Renders on both mobile and desktop, so the same header gives a way back on
 * either. When there is real in-app history it steps back through it;
 * `location.key === 'default'` means this is the first entry the app rendered
 * (a fresh load or deep link) with nothing to pop, so it routes to a sensible
 * fallback — home by default — instead of doing nothing or leaving the app.
 */
export function BackButton({ fallback = '/' }: { fallback?: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const hasHistory = location.key !== 'default'

  return (
    <button
      type="button"
      onClick={() => (hasHistory ? navigate(-1) : navigate(fallback))}
      aria-label="Go back"
      className="app-back-button motion-press"
    >
      <Icon name="back" className="h-5 w-5" />
    </button>
  )
}

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
  // No radius utility here: `.surface` and `.glass` already carry the panel
  // radius from the design system, and adding a control-sized one on top was
  // flattening every card to 12px.
  const base = `${refract ? 'glass' : 'surface'} p-4 sm:p-5`

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
      <h2 className="type-micro font-semibold text-[var(--app-muted)]">
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
          : 'text-[var(--app-ink)]'
  return (
    <div className="glass-inset radius-control px-3.5 py-3">
      <div className="type-micro font-medium text-[var(--app-muted)]">
        {label}
      </div>
      <div
        className={`tabular mt-1 type-title leading-none ${toneClass}`}
      >
        {value === null ? <span className="text-[var(--app-muted)]">—</span> : value}
        {value !== null && unit ? (
          <span className="ml-1 type-dense text-[var(--app-muted)]">{unit}</span>
        ) : null}
      </div>
      {sub ? <div className="mt-1.5 type-caption leading-tight text-[var(--app-muted)]">{sub}</div> : null}
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
    neutral: 'bg-warm/10 text-[var(--app-ink-soft)] ring-warm/20',
    good: 'bg-success/55 text-success-ink ring-success',
    warn: 'bg-energy/65 text-energy-ink ring-energy',
    bad: 'bg-strain/55 text-alert ring-alert/30',
    info: 'bg-recovery/60 text-recovery-ink ring-recovery',
  } as const
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 type-caption font-medium ring-1 ring-inset ${tones[tone]}`}
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

/**
 * Empty state.
 *
 * Day one is a new user's first impression, and on a tracker most screens are
 * empty until they have logged for a week — so this is one of the most-seen
 * views in the product, not an edge case. It therefore states what will appear
 * here and what to do to fill it, rather than apologising for having no data.
 *
 * `action` is optional because some emptiness is a waiting state the user
 * cannot act on (a trend needs days to accumulate), and offering a button that
 * cannot help is worse than offering none.
 */
export function EmptyState({
  title,
  body,
  hint,
  action,
}: {
  title: string
  body: string
  /** What will make this fill in, when the user cannot act immediately. */
  hint?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <Card className="text-center">
      <div className="mx-auto flex max-w-sm flex-col items-center px-2 py-6">
        {/*
          A quiet mark rather than an illustration: it gives the block a centre
          of gravity without implying the screen is broken or celebratory.
        */}
        <span
          aria-hidden="true"
          className="mb-4 flex h-11 w-11 items-center justify-center radius-control"
          style={{ background: 'var(--app-inset)', border: '1px solid var(--app-line)' }}
        >
          <span className="type-metric-sm text-[var(--app-muted)]">—</span>
        </span>

        <div className="type-title text-[var(--app-ink)]">{title}</div>
        <p className="type-caption mt-2 text-[var(--app-ink-soft)]">{body}</p>
        {hint ? <p className="type-micro mt-3 text-[var(--app-muted)]">{hint}</p> : null}

        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="app-button app-button-primary motion-press mt-5"
          >
            {action.label}
          </button>
        ) : null}
      </div>
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
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--app-line)]">
        <div className="h-full w-full bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(17,22,18,0.08)_4px,rgba(17,22,18,0.08)_8px)]" />
      </div>
    )
  }
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--app-line)]">
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
  back = true,
  backFallback = '/',
}: {
  eyebrow?: string
  title: string
  action?: ReactNode
  /** Show the back arrow. On by default; the home tab omits it by not using
   *  PageHeader at all, so every screen that has a header gets a way back. */
  back?: boolean
  backFallback?: string
}) {
  return (
    <header className="flex items-end justify-between gap-3 pt-4 sm:pt-6">
      <div className="flex min-w-0 items-end gap-2.5">
        {back ? (
          <div className="pb-1">
            <BackButton fallback={backFallback} />
          </div>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <div className="type-micro font-medium text-[var(--app-muted)]">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="mt-1 type-display text-[var(--app-ink)]">{title}</h1>
        </div>
      </div>
      {action}
    </header>
  )
}
