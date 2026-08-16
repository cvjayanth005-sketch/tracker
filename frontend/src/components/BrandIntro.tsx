import { useEffect, useRef, useState } from 'react'
import { isBrandSoundEnabled, setBrandSoundEnabled } from './brandIntroState'

const LETTERS = [
  { letter: 'F', x: -54, y: -18 },
  { letter: 'O', x: -38, y: 30 },
  { letter: 'R', x: -22, y: -36 },
  { letter: 'M', x: 0, y: 38 },
  { letter: 'A', x: 22, y: -32 },
  { letter: 'R', x: 40, y: 24 },
  { letter: 'A', x: 56, y: -12 },
] as const

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext
  }

function playBrandTone(kind: 'arrival' | 'confirm'): boolean {
  const AudioContextClass = window.AudioContext ?? (window as AudioWindow).webkitAudioContext
  if (!AudioContextClass) return false

  try {
    const context = new AudioContextClass()
    const master = context.createGain()
    master.gain.setValueAtTime(0.0001, context.currentTime)
    master.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.025)
    master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.48)
    master.connect(context.destination)

    const notes = kind === 'arrival' ? [392, 523.25] : [523.25, 659.25]
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const start = context.currentTime + index * 0.085
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(index === 0 ? 0.7 : 0.48, start)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.34)
      oscillator.connect(gain)
      gain.connect(master)
      oscillator.start(start)
      oscillator.stop(start + 0.36)
    })

    window.setTimeout(() => void context.close(), 650)
    return context.state === 'running'
  } catch {
    return false
  }
}

export function BrandIntro({ onComplete }: { onComplete: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(() => isBrandSoundEnabled())
  const arrivalPlayed = useRef(false)
  const completeTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!soundEnabled) return
    const timer = window.setTimeout(() => {
      arrivalPlayed.current = playBrandTone('arrival')
    }, 940)
    return () => window.clearTimeout(timer)
  }, [soundEnabled])

  useEffect(
    () => () => {
      if (completeTimer.current !== null) window.clearTimeout(completeTimer.current)
    },
    [],
  )

  const continueToAbout = () => {
    if (leaving) return
    if (soundEnabled && !arrivalPlayed.current) playBrandTone('confirm')
    setLeaving(true)
    completeTimer.current = window.setTimeout(onComplete, 360)
  }

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    setBrandSoundEnabled(next)
    if (next) arrivalPlayed.current = playBrandTone('confirm')
  }

  return (
    <main
      className={`formara-intro min-h-dvh bg-surface text-surface-ink ${leaving ? 'is-leaving' : ''}`}
      aria-labelledby="formara-intro-title"
    >
      <button
        type="button"
        onClick={toggleSound}
        className="formara-intro-sound"
        aria-pressed={soundEnabled}
        aria-label={soundEnabled ? 'Mute intro sound' : 'Turn on intro sound'}
        title={soundEnabled ? 'Sound on' : 'Sound off'}
      >
        <span aria-hidden="true">{soundEnabled ? '♪' : '×'}</span>
      </button>

      <div className="formara-intro-wordmark" id="formara-intro-title" aria-label="Formara">
        {LETTERS.map(({ letter, x, y }, index) => (
          <span
            key={`${letter}-${index}`}
            className="formara-intro-letter"
            aria-hidden="true"
            style={
              {
                '--intro-x': `${x}px`,
                '--intro-y': `${y}px`,
                '--intro-delay': `${180 + index * 62}ms`,
              } as React.CSSProperties
            }
          >
            {letter}
          </span>
        ))}
      </div>

      <p className="formara-intro-tagline">Your body. Your data. Your next move.</p>

      <div className="formara-intro-action safe-bottom">
        <button type="button" onClick={continueToAbout} className="formara-intro-start">
          <span>Start</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </main>
  )
}
