import type { ReactNode } from 'react'

/**
 * A pulsing placeholder rectangle in the shape of the real content.
 *
 * Deliberately shape-matched, not a spinner: a spinner says "wait", a
 * skeleton says "the panel that lives here is coming, and it looks about
 * like this". The difference is what makes the app feel like it is loading
 * a *thing* rather than blocking on nothing in particular.
 *
 * Uses Tailwind's built-in animate-pulse so it participates in the same
 * reduced-motion behaviour as the rest of the app — no separate keyframes.
 */
export function Skeleton({
  className = '',
  width,
  height,
  round = 'radius-control',
}: {
  className?: string
  width?: string | number
  height?: string | number
  round?: 'radius-control' | 'radius-inset' | 'radius-pill'
}) {
  const style: Record<string, string | number> = {}
  if (width !== undefined) style.width = width
  if (height !== undefined) style.height = height
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-[var(--app-inset)] ${round} ${className}`}
      style={style}
    />
  )
}

/**
 * A skeleton-lined panel used while a screen's real data is loading. The
 * screen's own layout wraps around it, so the skeleton takes the space its
 * real content will occupy — no layout shift when the data arrives.
 */
export function SkeletonPanel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="app-panel p-4 sm:p-5" role="status" aria-label={label}>
      {children}
      <span className="sr-only">{label}</span>
    </div>
  )
}
