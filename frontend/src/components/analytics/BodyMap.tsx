import { useState } from 'react'
import { BODY_REGIONS, type BodyCoverage, type BodyRegion } from '@/domain/bodyCoverage'
import { formatShort } from '@/domain/date'
import './bodyMap.css'
import { FEMALE_BACK, FEMALE_FRONT, FEMALE_SILHOUETTE } from './femaleAnatomy'

type Illustration = 'male' | 'female'
const ILLUSTRATION_KEY = 'formara-body-illustration'
function savedIllustration(): Illustration {
  try { return localStorage.getItem(ILLUSTRATION_KEY) === 'female' ? 'female' : 'male' }
  catch { return 'male' }
}

// Original artwork: left-side muscle paths mirrored around the centreline.
const FRONT: Partial<Record<BodyRegion, string>> = {
  shoulders: 'M88 87 C70 84 61 93 60 111 L64 130 Q72 115 83 115 L94 97Z',
  chest: 'M116 91 Q101 87 86 96 L78 114 Q84 133 113 128 L117 119Z',
  biceps: 'M61 126 Q71 117 77 124 Q77 145 64 163 L55 161 Q52 145 61 126Z',
  forearms: 'M55 167 Q63 164 65 173 Q64 191 49 223 L39 220 Q43 190 55 167Z',
  abs: 'M116 135 L101 135 Q96 144 100 156 L116 156Z M116 160 L100 160 L101 179 L116 179Z M116 183 L102 184 Q103 200 116 216Z',
  obliques: 'M81 132 L94 139 L95 182 L106 215 L91 206 Q83 186 81 164Z',
  quads: 'M91 221 Q103 226 115 235 L113 284 Q109 309 102 320 L92 324 Q84 297 83 271 Q83 244 91 221Z',
  calves: 'M92 341 Q102 335 110 343 Q111 375 101 406 L99 436 L91 436 L89 399 Q83 367 92 341Z',
}
const BACK: Partial<Record<BodyRegion, string>> = {
  shoulders: 'M88 87 C70 84 61 94 60 112 L65 126 Q76 117 87 115 L97 100Z',
  back: 'M115 74 L101 84 L88 96 Q87 107 94 119 L117 135Z M83 124 Q93 130 115 139 L115 207 Q100 197 91 181 Q83 159 83 124Z',
  triceps: 'M62 131 Q71 122 78 123 Q77 147 65 164 L56 162 Q53 147 62 131Z',
  forearms: FRONT.forearms!,
  glutes: 'M94 209 Q104 212 116 210 L117 244 Q113 258 97 259 Q82 255 85 241Z',
  hamstrings: 'M85 263 Q98 269 115 256 L112 303 L104 327 L94 329 Q85 304 85 263Z',
  calves: 'M94 340 Q102 337 109 343 Q115 364 104 392 L98 408 Q83 395 85 371 Q85 350 94 340Z',
}
const SILHOUETTE = 'M120 20 C101 20 99 34 101 50 Q102 62 110 67 L108 78 Q95 85 80 86 Q61 87 55 107 Q49 124 50 143 L42 171 Q35 191 32 218 L27 231 Q24 244 29 248 L35 237 L34 252 Q36 257 39 250 L43 237 L47 242 Q52 243 50 234 L49 224 Q65 201 71 176 L79 151 Q82 177 86 194 L83 220 Q73 246 77 277 L85 327 Q81 347 82 377 L89 421 L88 441 L80 459 Q78 467 91 467 L105 465 Q108 462 104 450 L105 431 L113 386 Q118 363 111 331 L119 278 L120 253 L121 278 L129 331 Q122 363 127 386 L135 431 L136 450 Q132 462 135 465 L149 467 Q162 467 160 459 L152 441 L151 421 L158 377 Q159 347 155 327 L163 277 Q167 246 157 220 L154 194 Q158 177 161 151 L169 176 Q175 201 191 224 L190 234 Q188 243 193 242 L197 237 L201 250 Q204 257 206 252 L205 237 L211 248 Q216 244 213 231 L208 218 Q205 191 198 171 L190 143 Q191 124 185 107 Q179 87 160 86 Q145 85 132 78 L130 67 Q138 62 139 50 C141 34 139 20 120 20Z'
const intensity = (sets: number) => sets === 0 ? 0 : sets < 6 ? 1 : sets < 13 ? 2 : 3

export function BodyMap({ coverage }: { coverage: { regions: BodyCoverage; unmappedSets: number } }) {
  const [view, setView] = useState<'front' | 'back'>('front')
  const [selected, setSelected] = useState<BodyRegion | null>(null)
  const [illustration, setIllustration] = useState<Illustration>(savedIllustration)
  const paths = illustration === 'female'
    ? view === 'front' ? FEMALE_FRONT : FEMALE_BACK
    : view === 'front' ? FRONT : BACK
  const chooseIllustration = (next: Illustration) => {
    setIllustration(next)
    try { localStorage.setItem(ILLUSTRATION_KEY, next) } catch { /* Still usable without storage. */ }
  }
  const detail = selected ? coverage.regions[selected] : null
  const hasData = Object.values(coverage.regions).some((entry) => entry.sets > 0)
  return <section className="body-coverage" aria-label="Muscle coverage">
    <header className="body-coverage-header">
      <div><h3>Muscle coverage</h3><p>Working sets · Last 30 days</p></div>
      <div className="body-view-switch" role="group" aria-label="Body view">
        {(['front', 'back'] as const).map((side) => <button key={side} type="button" aria-pressed={view === side} onClick={() => { setView(side); setSelected(null) }}>{side === 'front' ? 'Front' : 'Back'}</button>)}
      </div>
    </header>
    <div className="body-illustration-picker">
      <span>Illustration</span>
      <div className="body-view-switch" role="group" aria-label="Body illustration">
        {(['male', 'female'] as const).map((option) => <button key={option} type="button"
          aria-pressed={illustration === option} onClick={() => chooseIllustration(option)}>
          {option === 'male' ? 'Male' : 'Female'}
        </button>)}
      </div>
      <small>Saved on this device</small>
    </div>
    <div className="body-coverage-layout">
      <div className="body-illustration">
        <svg viewBox="0 0 240 485" role="group" aria-label={`${illustration} ${view} anatomy. Select a muscle to inspect its logged sets.`}>
          <ellipse cx="120" cy="473" rx="43" ry="5" className="body-ground" />
          <path d={illustration === 'female' ? FEMALE_SILHOUETTE : SILHOUETTE} className="body-silhouette" />
          <path d="M110 68 Q120 74 130 68 M109 78 Q120 86 131 78 M91 331 Q100 337 109 331 M131 331 Q140 337 149 331" className="body-contour" />
          {Object.entries(paths).map(([key, path]) => {
            const region = key as BodyRegion
            const count = coverage.regions[region].sets
            return <g key={region} role="button" tabIndex={0} aria-pressed={selected === region}
              aria-label={`${BODY_REGIONS[region]}, ${count} working sets`}
              className={`body-muscle body-level-${intensity(count)} ${selected === region ? 'is-selected' : ''}`}
              onClick={() => setSelected(region)} onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(region) }
              }}>
              <title>{BODY_REGIONS[region]} · {count} sets</title>
              <path d={path} /><path d={path} transform="translate(240 0) scale(-1 1)" />
            </g>
          })}
        </svg><span className="body-view-label">{view} view</span>
      </div>
      <div className="body-coverage-sidebar">
        <div className="body-region-list" role="group" aria-label="Select muscle">
          {Object.keys(paths).map((key) => {
            const region = key as BodyRegion
            return <button key={region} type="button" aria-pressed={selected === region} onClick={() => setSelected(region)}>
              <i className={`body-swatch body-level-${intensity(coverage.regions[region].sets)}`} aria-hidden="true" />
              <span>{BODY_REGIONS[region]}</span><strong>{coverage.regions[region].sets}<small> sets</small></strong>
            </button>
          })}
        </div>
        <div className="body-detail" aria-live="polite" aria-atomic="true">
          {selected && detail ? <>
            <h4>{BODY_REGIONS[selected]} <span>{detail.sets} working sets</span></h4>
            <p>{detail.lastTrained ? `Last trained ${formatShort(detail.lastTrained, true)}` : 'No logged sets in the last 30 days.'}</p>
            {detail.exercises.length > 0 && <ul>{[...detail.exercises].sort((a, b) => b.sets - a.sets).map((e) => <li key={e.id}><span>{e.name}</span><strong>{e.sets}</strong></li>)}</ul>}
          </> : <><h4>{hasData ? 'Explore your training' : 'Your training, at a glance'}</h4><p>{hasData ? 'Select a muscle to see contributing exercises and when you last trained it.' : 'Log your first workout to see which muscles you’ve trained.'}</p></>}
        </div>
      </div>
    </div>
    <footer className="body-coverage-footer">
      <div className="body-legend" aria-label="Working set color scale">
        {['0', '1–5', '6–12', '13+'].map((label, i) => <span key={label}><i className={`body-swatch body-level-${i}`} aria-hidden="true" />{label}</span>)}<span>sets / 30 days</span>
      </div>
      <p>Estimated from exercise names. Counts logged reps or timed sets; excludes warm-ups. Colors show volume, not recovery. A set may contribute to more than one region.</p>
      {coverage.unmappedSets > 0 && <p>{coverage.unmappedSets} logged sets could not be mapped to a muscle region.</p>}
    </footer>
  </section>
}
