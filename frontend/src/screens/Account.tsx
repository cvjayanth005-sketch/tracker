import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getAuthState, signOut } from '@/auth/session'
import { getProfile, getSettings, importDailyLogs, updateProfile, updateSettings } from '@/db/repo'
import { NumberField } from '@/components/fields'
import { fmtInt } from '@/components/format'
import { previewExcel } from '@/import/excel'
import { useOnline, useSyncMeta } from '@/hooks/useDashboard'
import {
  API_BASE,
  downloadBackup,
  importState,
  requestPersistentStorage,
  sync,
  type StateDocument,
} from '@/sync/client'
import { lastSyncCopy, syncHonesty } from '@/screens/account/syncState'
import { timezoneOptions } from '@/screens/account/timezones'
import { CanvasPage } from '@/shell/CanvasPage'
import './account/account.css'

export default function Account() {
  const auth = getAuthState()
  const settings = useLiveQuery(() => getSettings(), [])
  const profile = useLiveQuery(() => getProfile(), [])
  const meta = useSyncMeta()
  const online = useOnline()
  const [status, setStatus] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const pendingChanges = meta ? Math.max(0, meta.localVersion - meta.syncedVersion) : 0
  const honesty = syncHonesty({
    online,
    cloudConfigured: Boolean(API_BASE),
    pendingChanges,
    lastError: meta?.lastError,
    lastSyncedAt: meta?.lastSyncedAt,
  })

  const restore = async (file: File) => {
    const text = await file.text()
    const doc = JSON.parse(text) as StateDocument
    if (!doc.tables || typeof doc.version !== 'number') {
      setStatus('That file is not a ledger backup.')
      return
    }
    const rows = Object.values(doc.tables).reduce((n, table) => n + (table?.length ?? 0), 0)
    const ok = window.confirm(
      `Restore ${rows} records from this backup? This REPLACES everything currently in the app.`,
    )
    if (!ok) return
    await importState(doc)
    setStatus(`Restored ${rows} records.`)
  }

  const syncNow = async () => {
    setWorking(true)
    const result = await sync()
    setWorking(false)
    if (result.status === 'pushed') setStatus(`Synced version ${result.version} to the server.`)
    else if (result.status === 'pulled') setStatus(`Pulled version ${result.version} from the server.`)
    else if (result.status === 'clean') setStatus('Server and this device are already in sync.')
    else if (result.status === 'unauthorized') {
      setStatus('Session expired. Sign in again.')
      void signOut()
    } else if (result.status === 'conflict') {
      setStatus('Both copies changed. Download a backup before choosing which copy to keep.')
    } else if (result.status === 'offline') setStatus('Offline — your changes remain on this device.')
    else if (result.status === 'error') setStatus(`Sync failed: ${result.message}`)
    else setStatus('No sync server is configured; download a backup instead.')
  }

  const importHistory = async (file: File) => {
    setWorking(true)
    try {
      const preview = await previewExcel(file)
      if (preview.logs.length === 0) {
        setStatus('The workbook is a blank template — no dated history was found to import.')
        return
      }
      const ok = window.confirm(
        `Merge ${preview.logs.length} dated rows into the ledger? Existing fields are kept ` +
          `unless the workbook contains a value for them.`,
      )
      if (!ok) return
      await importDailyLogs(preview.logs)
      setStatus(`Imported ${preview.logs.length} dated rows from ${file.name}.`)
    } catch (error) {
      setStatus(`Import failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setWorking(false)
    }
  }

  return (
    <CanvasPage>
      <div className="canvas-stack">
        <header>
          <p className="canvas-kicker">You</p>
          <h1 className="canvas-title">Account</h1>
          <p className="canvas-lede">Profile, backup, and the quiet controls.</p>
        </header>

        {status ? <p className="canvas-status">{status}</p> : null}

        <section className="canvas-section">
          <h2>Profile</h2>
          <div className="canvas-fields">
            <CanvasTextField
              label="Name"
              value={profile?.name ?? ''}
              onCommit={(name) => void updateProfile({ name })}
            />
            <NumberField
              label="Height"
              unit="cm"
              step="0.5"
              value={profile?.heightCm ?? null}
              onCommit={(heightCm) => void updateProfile({ heightCm })}
            />
            <NumberField
              label="Birth year"
              inputMode="numeric"
              value={profile?.birthYear ?? null}
              onCommit={(birthYear) => void updateProfile({ birthYear })}
            />
            <NumberField
              label="Start weight"
              unit="kg"
              step="0.1"
              value={profile?.startWeightKg ?? null}
              onCommit={(startWeightKg) => startWeightKg != null && void updateProfile({ startWeightKg })}
            />
            <NumberField
              label="Goal weight"
              unit="kg"
              step="0.1"
              value={profile?.goalWeightKg ?? null}
              onCommit={(goalWeightKg) => goalWeightKg != null && void updateProfile({ goalWeightKg })}
            />
          </div>
          <label className="account-field">
            <span>Timezone</span>
            <select
              className="canvas-select"
              value={settings?.timezone ?? ''}
              onChange={(event) => void updateSettings({ timezone: event.target.value })}
              disabled={!settings}
            >
              {timezoneOptions(settings?.timezone ?? '').map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          <p className="canvas-note">
            Units are metric (kg, cm, kcal). Imperial is not stored on this account yet.
          </p>
        </section>

        <section className="canvas-section">
          <h2>Coaching preferences</h2>
          <p className="account-placeholder">
            Training, diet, and constraints will live here. They are not stored as editable settings
            after onboarding yet.
          </p>
        </section>

        <section className="canvas-section">
          <h2>Connections and sync</h2>
          <div className="account-identity">
            <div className="account-avatar">
              {auth?.user.picture ? (
                <img src={auth.user.picture} alt="" />
              ) : (
                (auth?.user.name ?? auth?.user.email ?? 'A').charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <h3>{auth?.user.name ?? 'Signed in'}</h3>
              <p>{auth?.user.email ?? 'Google account'}</p>
            </div>
            <span
              className={`canvas-pill${
                honesty.state === 'error'
                  ? ' canvas-pill-alert'
                  : honesty.state === 'offline'
                    ? ' canvas-pill-warn'
                    : honesty.state === 'connected'
                      ? ' canvas-pill-accent'
                      : ''
              }`}
              style={{ marginLeft: 'auto' }}
            >
              {honesty.label}
            </span>
          </div>
          <dl className="account-dl">
            <dt>Cloud</dt>
            <dd>{API_BASE ? 'Google account backup' : 'Not configured'}</dd>
            <dt>Last successful sync</dt>
            <dd className="tabular">{lastSyncCopy(meta?.lastSyncedAt)}</dd>
            <dt>Local version</dt>
            <dd className="tabular">{fmtInt(meta?.localVersion ?? 0)}</dd>
            <dt>Server version</dt>
            <dd className="tabular">{fmtInt(meta?.syncedVersion ?? 0)}</dd>
          </dl>
          {meta?.lastError ? <p className="canvas-warn">{meta.lastError}</p> : null}
          <div className="canvas-row" style={{ marginTop: '0.9rem' }}>
            {API_BASE ? (
              <button
                type="button"
                className="canvas-btn"
                onClick={() => void syncNow()}
                disabled={working}
              >
                {working ? 'Working…' : 'Sync now'}
              </button>
            ) : null}
          </div>
        </section>

        <section className="canvas-section">
          <h2>Privacy and data</h2>
          <p className="account-placeholder">
            This device keeps the working copy in the browser. Cloud backup, when configured, is tied
            to your Google sign-in. Nothing here is shared with other services.
          </p>
          <div className="canvas-row" style={{ marginTop: '0.9rem' }}>
            <button
              type="button"
              className="canvas-btn canvas-btn-quiet"
              onClick={() => void downloadBackup().then(() => setStatus('Downloaded a complete JSON backup.'))}
            >
              Download backup
            </button>
            <label className="canvas-file">
              Restore from file
              <input
                type="file"
                accept="application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void restore(file)
                  event.target.value = ''
                }}
              />
            </label>
            <label className="canvas-file">
              {working ? 'Reading workbook…' : 'Import Excel'}
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={working}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void importHistory(file)
                  event.target.value = ''
                }}
              />
            </label>
            <button
              type="button"
              className="canvas-btn canvas-btn-quiet"
              onClick={() =>
                void requestPersistentStorage().then((granted) =>
                  setStatus(
                    granted
                      ? 'Browser granted persistent storage.'
                      : 'Browser declined persistent storage — keep downloading backups.',
                  ),
                )
              }
            >
              Request persistent storage
            </button>
          </div>

          <div className="canvas-danger">
            <p className="canvas-note" style={{ marginTop: 0 }}>
              Sign out clears this device copy. Synced cloud data stays with your Google account.
            </p>
            <button
              type="button"
              className="canvas-btn canvas-btn-danger"
              onClick={() => {
                const ok = window.confirm(
                  'Sign out and clear this device copy? Your synced cloud data stays with your Google account.',
                )
                if (ok) void signOut()
              }}
            >
              Sign out
            </button>
          </div>
        </section>
      </div>
    </CanvasPage>
  )
}

function CanvasTextField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: string
  onCommit: (next: string | null) => void
}) {
  const [text, setText] = useState(value)
  const timer = useRef<number | undefined>(undefined)
  const dirty = useRef(false)

  useEffect(() => {
    if (dirty.current) return
    setText(value)
  }, [value])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const commit = (raw: string) => {
    dirty.current = false
    const trimmed = raw.trim()
    onCommit(trimmed === '' ? null : trimmed)
  }

  return (
    <label className="glass-tile flex items-center justify-between gap-3 rounded-3xl px-4 py-3.5">
      <span className="block text-[13px] font-medium text-ink-200">{label}</span>
      <input
        type="text"
        value={text}
        placeholder="—"
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          dirty.current = true
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => commit(next), 500)
        }}
        onBlur={(event) => {
          window.clearTimeout(timer.current)
          commit(event.target.value)
        }}
        className="canvas-text"
        style={{ width: '14rem', marginTop: 0, minHeight: '2.25rem' }}
      />
    </label>
  )
}
