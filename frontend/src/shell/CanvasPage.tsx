import type { ReactNode } from 'react'
import './canvas.css'

export function CanvasPage({ children }: { children: ReactNode }) {
  return <div className="canvas-page">{children}</div>
}
