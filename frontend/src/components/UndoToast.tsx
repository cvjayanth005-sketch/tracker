import { useEffect, useRef, useState } from 'react'
import { listenForUndoRequests, type UndoRequest } from './undoBus'

/**
 * Rendered once at the shell level; listens for `requestUndo(...)` from
 * anywhere in the app and shows a 5-second toast with an Undo button.
 *
 * Deliberately single-slot: a new request replaces the previous toast rather
 * than stacking, because two undo prompts on screen at once is guaranteed
 * confusion — which one is undoing what? The old toast's timer just gets
 * cancelled.
 */
export function UndoToast() {
  const [active, setActive] = useState<UndoRequest | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    return listenForUndoRequests((request) => {
      window.clearTimeout(timerRef.current)
      setActive(request)
      const duration = request.durationMs ?? 5000
      timerRef.current = window.setTimeout(() => setActive(null), duration)
    })
  }, [])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  if (!active) return null

  const undo = () => {
    const request = active
    window.clearTimeout(timerRef.current)
    setActive(null)
    void request.onUndo()
  }

  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span className="undo-toast-message">{active.message}</span>
      <button type="button" className="undo-toast-action motion-press" onClick={undo}>
        Undo
      </button>
    </div>
  )
}
