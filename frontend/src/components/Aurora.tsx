import { useEffect, useState } from 'react'

/**
 * Vital Field — the living backdrop the glass refracts.
 *
 * Design intent: fitness + wellbeing in one atmosphere.
 *   - Restorative void (sleep / recovery depth)
 *   - Canopy light shafts (nature, calm)
 *   - Dawn horizon (training day rising)
 *   - Vital / recovery / metabolic blooms (effort, oxygen, warmth)
 *   - Breath sheath (slow coherent inhale–exhale)
 *   - Biometric pulse wave (body signal, ambient not clinical)
 *   - Activity rings (training DNA)
 *   - Endorphin dust + soft grain
 *
 * Motion is CSS-only on GPU layers. JS only pauses when the tab is hidden.
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
      <div className="aurora-canopy" />
      <div className="aurora-horizon" />
      <div className="aurora-caustic" />

      <div className="aurora-bloom aurora-bloom--vital" />
      <div className="aurora-bloom aurora-bloom--oxygen" />
      <div className="aurora-bloom aurora-bloom--ember" />

      <div className="aurora-breath" />
      <div className="aurora-ribbon" />

      <svg className="aurora-wave" viewBox="0 0 1200 200" preserveAspectRatio="none">
        <defs>
          <linearGradient id="aurora-wave-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgb(74 222 128)" stopOpacity="0" />
            <stop offset="22%" stopColor="rgb(74 222 128)" stopOpacity="0.55" />
            <stop offset="50%" stopColor="rgb(56 189 248)" stopOpacity="0.7" />
            <stop offset="78%" stopColor="rgb(251 191 36)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="rgb(251 191 36)" stopOpacity="0" />
          </linearGradient>
          <filter id="aurora-wave-glow" x="-20%" y="-200%" width="140%" height="500%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Soft under-glow path */}
        <path
          className="aurora-wave-path aurora-wave-path--soft"
          d="M0 110 C 80 110, 100 40, 160 40 S 240 160, 300 160 S 380 50, 440 50 S 520 150, 580 150 S 660 35, 720 35 S 800 155, 860 155 S 940 60, 1000 60 S 1080 120, 1200 110"
          fill="none"
          stroke="url(#aurora-wave-stroke)"
          strokeWidth="3"
          filter="url(#aurora-wave-glow)"
          strokeLinecap="round"
        />
        {/* Crisp biometric line */}
        <path
          className="aurora-wave-path"
          d="M0 110 C 80 110, 100 40, 160 40 S 240 160, 300 160 S 380 50, 440 50 S 520 150, 580 150 S 660 35, 720 35 S 800 155, 860 155 S 940 60, 1000 60 S 1080 120, 1200 110"
          fill="none"
          stroke="url(#aurora-wave-stroke)"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>

      <div className="aurora-rings">
        <span />
        <span />
        <span />
      </div>

      <div className="aurora-dust" />
      <div className="aurora-vignette" />
      <div className="aurora-grain" />
    </div>
  )
}
