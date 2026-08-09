import { useEffect, useState } from 'react'

/**
 * The living backdrop the glass refracts.
 *
 * Concept: a metabolic night sky — deep ink void, a low training-horizon
 * glow, vitality / recovery / ember blooms, drifting dust, and a soft grain
 * film so the glass has real light to catch.
 *
 * All motion is CSS transforms on GPU-composited layers. JS only pauses the
 * animation when the tab is hidden so a phone left on Today does not burn
 * battery on light nobody can see.
 */
export function Aurora() {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const sync = () => setHidden(document.visibilityState === 'hidden')
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  return (
    <div className={`aurora ${hidden ? 'aurora-paused' : ''}`} aria-hidden="true">
      <div className="aurora-void" />
      <div className="aurora-horizon" />
      <div className="aurora-bloom aurora-bloom--vital" />
      <div className="aurora-bloom aurora-bloom--depth" />
      <div className="aurora-bloom aurora-bloom--ember" />
      <div className="aurora-ribbon" />
      <div className="aurora-orbit" />
      <div className="aurora-dust" />
      <div className="aurora-vignette" />
      <div className="aurora-grain" />
    </div>
  )
}
