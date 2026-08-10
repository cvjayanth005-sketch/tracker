export type IconName = 'today' | 'calendar' | 'workout' | 'progress' | 'plan'

/** Stroke icons on a 24-grid. Kept as paths so weight can shift with state. */
const PATHS: Record<IconName, string[]> = {
  today: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'm8.5 12.4 2.4 2.4 4.6-5.1'],
  calendar: ['M7 3v3M17 3v3', 'M4.5 8.5h15', 'M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z', 'M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01'],
  // Two plates and a bar. The outer collars of a "real" dumbbell merge into a
  // smudge at 20px, so they are left off deliberately.
  workout: ['M7 7.5v9', 'M17 7.5v9', 'M7 12h10'],
  progress: ['M4 19V5', 'M4 19h16', 'm7 15 3.5-4.2 3 2.2L20 7'],
  plan: ['M4 8h5M13 8h7', 'M4 16h9M17 16h3', 'M11 8a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z', 'M17 16a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z'],
}

export function Icon({
  name,
  active = false,
  className = 'h-5 w-5',
}: {
  name: IconName
  active?: boolean
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.1 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
