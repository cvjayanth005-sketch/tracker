import { useState } from 'react'
import { MUSCLE_BUCKETS, MUSCLE_BUCKET_LABEL, type MuscleMetrics } from '@/domain/muscleVolume'

const PATHS = {
  chest: 'M72 48 C52 47 43 59 43 77 L57 91 L72 82 L87 91 L101 77 C101 59 92 47 72 48Z',
  shoulders: 'M42 58 C28 62 24 78 31 89 L47 82 L52 62Z M102 58 C116 62 120 78 113 89 L97 82 L92 62Z',
  arms: 'M31 88 L20 150 L36 154 L48 95Z M113 88 L124 150 L108 154 L96 95Z',
  core: 'M56 91 L51 145 L72 158 L93 145 L88 91Z',
  legs: 'M52 151 L43 230 L66 230 L72 165 L78 230 L101 230 L92 151Z',
  back: 'M55 50 C43 70 47 117 55 143 L72 155 L89 143 C97 117 101 70 89 50Z',
} as const

export function BodyMap({ metrics }: { metrics: MuscleMetrics }) {
  const [back, setBack] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const max = Math.max(1, ...MUSCLE_BUCKETS.map((bucket) => metrics.frequency[bucket]))
  const visible = back ? ['back', 'shoulders', 'arms', 'legs', 'core'] as const : MUSCLE_BUCKETS.filter((bucket) => bucket !== 'back')
  const untrained = MUSCLE_BUCKETS.filter((bucket) => metrics.frequency[bucket] === 0)
  const detail = selected && selected in metrics.frequency ? metrics.frequency[selected as keyof typeof metrics.frequency] : null
  return <div>
    <div className="flex items-start justify-between gap-3"><div><div className="type-caption font-semibold text-[var(--app-ink)]">Muscle coverage</div><div className="mt-1 type-micro text-[var(--app-muted)]">Tap a muscle group for working-set volume</div></div><button type="button" onClick={() => setBack((value) => !value)} className="radius-control bg-[var(--app-inset)] px-2.5 py-1.5 type-micro font-semibold text-[var(--app-ink)]">{back ? 'Front' : 'Back'} view</button></div>
    <svg viewBox="0 0 144 245" className="mx-auto mt-3 h-64 max-w-full" role="img" aria-label="Muscle coverage body map"><rect x="57" y="8" width="30" height="35" rx="14" fill="var(--app-inset)" stroke="var(--app-line)" />{visible.map((bucket) => { const level = metrics.frequency[bucket] / max; const active = selected === bucket; return <path key={bucket} d={PATHS[bucket]} onClick={() => setSelected(bucket)} tabIndex={0} role="button" aria-label={`${MUSCLE_BUCKET_LABEL[bucket]}: ${metrics.frequency[bucket]} working sets`} fill={level === 0 ? 'var(--app-inset)' : `rgb(57 255 20 / ${0.22 + level * 0.72})`} stroke={active ? 'var(--app-blue)' : 'var(--app-line-strong)'} strokeWidth={active ? 3 : 1} className="cursor-pointer transition-colors" />})}</svg>
    <div className="mt-2 rounded-xl bg-[var(--app-inset)] p-3 type-caption text-[var(--app-ink-soft)]">{selected ? <><strong className="text-[var(--app-ink)]">{MUSCLE_BUCKET_LABEL[selected as keyof typeof MUSCLE_BUCKET_LABEL]}</strong> · {detail} working sets in the last 30 days.</> : untrained.length ? <>No direct work yet: <strong className="text-[var(--app-ink)]">{untrained.map((bucket) => MUSCLE_BUCKET_LABEL[bucket]).join(', ')}</strong>.</> : 'Every major muscle group has recent direct work.'}</div>
  </div>
}
