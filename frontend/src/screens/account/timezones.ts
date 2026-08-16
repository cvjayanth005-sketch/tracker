/** The device timezone plus a few likely alternatives, deduplicated. */
export function timezoneOptions(current: string): string[] {
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone
  const common = [
    'Asia/Kolkata',
    'Europe/London',
    'Europe/Berlin',
    'America/New_York',
    'America/Los_Angeles',
    'Australia/Sydney',
    'UTC',
  ]
  return Array.from(new Set([current, device, ...common].filter(Boolean)))
}
