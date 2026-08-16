import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getAuthState, signOut } from '@/auth/session'
import { Button, PageHeader, Pill } from '@/components/ui'
import { NumberField } from '@/components/fields'
import { fmtInt } from '@/components/format'
import {
  getProfile,
  getSettings,
  importDailyLogs,
  updateProfile,
  updateSettings,
} from '@/db/repo'
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
import { lastSyncCopy, syncHonesty } from './account/syncState'
import { timezoneOptions } from './account/timezones'
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
  const syncTone =
    honesty.state === 'connected'
      ? 'good'
      : honesty.state === 'error'
        ? 'bad'
      : honesty.state === 'offline'
          ? 'warn'
          : honesty.state === 'local'
            ? 'neutral'
            : 'info'

  const restore = async (file: File) => {
    try {
      const doc = JSON.parse(await file.text()) as StateDocument
      if (!doc.tables || typeof doc.version !== 'number') {
        setStatus('That file is not a Formara backup.')
        return
      }
      const rows = Object.values(doc.tables).reduce((count, table) => count + (table?.length ?? 0), 0)
      const ok = window.confirm(
        `Restore ${rows} records? This replaces the current data on this device.`,
      )
      if (!ok) return
      await importState(doc)
      setStatus(`Restored ${rows} records.`)
    } catch (error) {
      setStatus(`Restore failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const syncNow = async () => {
    setWorking(true)
    try {
      const result = await sync()
      if (result.status === 'pushed') setStatus(`Synced version ${result.version}.`)
      else if (result.status === 'pulled') setStatus(`Loaded version ${result.version}.`)
      else if (result.status === 'clean') setStatus('This device and the cloud are up to date.')
      else if (result.status === 'unauthorized') setStatus('Session expired. Sign in again.')
      else if (result.status === 'conflict') setStatus('Both copies changed. Download a backup before resolving the conflict.')
      else if (result.status === 'offline') setStatus('Offline. Changes remain on this device.')
      else if (result.status === 'error') setStatus(`Sync failed: ${result.message}`)
      else setStatus('Cloud sync is not configured. Use a downloaded backup instead.')
    } catch (error) {
      setStatus(`Sync failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setWorking(false)
    }
  }

  const importHistory = async (file: File) => {
    setWorking(true)
    try {
      const preview = await previewExcel(file)
      if (preview.logs.length === 0) {
        setStatus('No dated history was found in that workbook.')
        return
      }
      const ok = window.confirm(`Merge ${preview.logs.length} dated rows into Formara?`)
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
    <div className="account-page">
      <PageHeader eyebrow="Settings and data" title="Account" action={<Pill tone={syncTone}>{honesty.label}</Pill>} />

      {status ? (
        <p className="account-status app-tone-action" role="status">
          {status}
        </p>
      ) : null}

      <section className="account-identity app-panel" aria-labelledby="account-identity-title">
        <div className="account-avatar">
          {auth?.user.picture ? (
            <img src={auth.user.picture} alt="" />
          ) : (
            (auth?.user.name ?? auth?.user.email ?? 'F').charAt(0).toUpperCase()
          )}
        </div>
        <div className="account-identity-copy">
          <h2 id="account-identity-title">{auth?.user.name ?? 'Signed in'}</h2>
          <p>{auth?.user.email ?? 'Google account'}</p>
        </div>
        <dl className="account-sync-summary">
          <div>
            <dt>Pending</dt>
            <dd>{fmtInt(pendingChanges)}</dd>
          </div>
          <div>
            <dt>Last sync</dt>
            <dd>{lastSyncCopy(meta?.lastSyncedAt)}</dd>
          </div>
        </dl>
      </section>

      <div className="account-grid">
        <section className="account-section app-panel" aria-labelledby="profile-title">
          <div className="account-section-heading">
            <p className="app-eyebrow">Profile</p>
            <h2 id="profile-title">Personal details</h2>
          </div>
          <div className="account-fields">
            <TextField
              label="Name"
              value={profile?.name ?? ''}
              onCommit={(name) => void updateProfile({ name })}
            />
            <NumberField
              label="Birth year"
              inputMode="numeric"
              value={profile?.birthYear ?? null}
              onCommit={(birthYear) => void updateProfile({ birthYear })}
            />
            <NumberField
              label="Height"
              unit="cm"
              step="0.5"
              value={profile?.heightCm ?? null}
              onCommit={(heightCm) => void updateProfile({ heightCm })}
            />
            <NumberField
              label="Start weight"
              unit="kg"
              step="0.1"
              value={profile?.startWeightKg ?? null}
              onCommit={(startWeightKg) => void updateProfile({ startWeightKg })}
            />
            <NumberField
              label="Goal weight"
              unit="kg"
              step="0.1"
              value={profile?.goalWeightKg ?? null}
              onCommit={(goalWeightKg) => void updateProfile({ goalWeightKg })}
            />
          </div>
          <label className="account-select-field">
            <span>Calendar timezone</span>
            <select
              className="app-field"
              value={settings?.timezone ?? ''}
              onChange={(event) => void updateSettings({ timezone: event.target.value })}
              disabled={!settings}
            >
              {timezoneOptions(settings?.timezone ?? '').map((timezone) => (
                <option key={timezone} value={timezone}>
                  {timezone}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="account-section app-panel" aria-labelledby="sync-title">
          <div className="account-section-heading">
            <p className="app-eyebrow">Sync</p>
            <h2 id="sync-title">Device and cloud</h2>
          </div>
          <dl className="account-detail-list">
            <dt>Cloud backup</dt>
            <dd>{API_BASE ? 'Configured' : 'Not configured'}</dd>
            <dt>Local version</dt>
            <dd>{fmtInt(meta?.localVersion ?? 0)}</dd>
            <dt>Cloud version</dt>
            <dd>{fmtInt(meta?.syncedVersion ?? 0)}</dd>
          </dl>
          {meta?.lastError ? <p className="account-inline-error">{meta.lastError}</p> : null}
          {API_BASE ? (
            <Button variant="primary" onClick={() => void syncNow()} disabled={working} className="account-full-button">
              {working ? 'Syncing' : 'Sync now'}
            </Button>
          ) : null}
        </section>
      </div>

      <section className="account-section app-panel" aria-labelledby="data-title">
        <div className="account-section-heading">
          <p className="app-eyebrow">Storage</p>
          <h2 id="data-title">Your data</h2>
        </div>
        <div className="account-actions">
          <Button
            variant="secondary"
            onClick={() => void downloadBackup().then(() => setStatus('Downloaded a complete JSON backup.'))}
          >
            Download backup
          </Button>
          <FileAction label="Restore backup" accept="application/json" onFile={restore} />
          <FileAction
            label={working ? 'Reading workbook' : 'Import Excel'}
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={working}
            onFile={importHistory}
          />
          <Button
            variant="ghost"
            onClick={() =>
              void requestPersistentStorage().then((granted) =>
                setStatus(granted ? 'Persistent browser storage is enabled.' : 'Persistent storage was not granted.'),
              )
            }
          >
            Keep data on this device
          </Button>
        </div>

        <div className="account-danger app-tone-danger">
          <div>
            <h3>Sign out on this device</h3>
            <p>Your local copy is cleared. Synced cloud data remains attached to your account.</p>
          </div>
          <Button
            variant="danger"
            onClick={() => {
              const ok = window.confirm('Sign out and clear the Formara data stored on this device?')
              if (ok) void signOut()
            }}
          >
            Sign out
          </Button>
        </div>
      </section>
    </div>
  )
}

function FileAction({
  label,
  accept,
  disabled = false,
  onFile,
}: {
  label: string
  accept: string
  disabled?: boolean
  onFile: (file: File) => Promise<void>
}) {
  return (
    <label className={`account-file-button ${disabled ? 'is-disabled' : ''}`}>
      {label}
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void onFile(file)
          event.target.value = ''
        }}
      />
    </label>
  )
}

function TextField({
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
    if (!dirty.current) setText(value)
  }, [value])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const commit = (raw: string) => {
    dirty.current = false
    onCommit(raw.trim() || null)
  }

  return (
    <label className="account-text-field app-inset">
      <span>{label}</span>
      <input
        className="app-field"
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
      />
    </label>
  )
}
