/**
 * Ambient undo channel.
 *
 * A single small event bus rather than a top-level provider or context —
 * destructive callers just fire and forget, the toast picks up the request,
 * and if the user does nothing it quietly disappears. Deliberately fire-and-
 * forget: nothing waits for the toast to render before actually performing
 * the delete, because a "we might undo" mode makes the underlying code much
 * harder to reason about.
 *
 * Trade-off: the caller has to do the undo work itself in `onUndo`. That is
 * the honest cost — a real undo is application-specific (re-insert the row,
 * roll the field back) and the toast cannot do it for you generically.
 */

const REQUEST = 'formara-undo-request'

export interface UndoRequest {
  message: string
  onUndo: () => void | Promise<void>
  /** Duration before the toast auto-dismisses. Default 5s. */
  durationMs?: number
}

export function requestUndo(request: UndoRequest): void {
  window.dispatchEvent(new CustomEvent<UndoRequest>(REQUEST, { detail: request }))
}

export function listenForUndoRequests(listener: (request: UndoRequest) => void): () => void {
  const handle = (event: Event) => listener((event as CustomEvent<UndoRequest>).detail)
  window.addEventListener(REQUEST, handle)
  return () => window.removeEventListener(REQUEST, handle)
}
