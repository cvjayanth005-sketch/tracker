const OPEN_COACH_EVENT = 'tracker-open-coach'

export function openCoachWithPrompt(prompt: string) {
  window.dispatchEvent(new CustomEvent<string>(OPEN_COACH_EVENT, { detail: prompt }))
}

export function listenForCoachPrompt(listener: (prompt: string) => void) {
  const handlePrompt = (event: Event) => listener((event as CustomEvent<string>).detail)
  window.addEventListener(OPEN_COACH_EVENT, handlePrompt)
  return () => window.removeEventListener(OPEN_COACH_EVENT, handlePrompt)
}
