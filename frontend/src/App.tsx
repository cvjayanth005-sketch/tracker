import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Aurora } from '@/components/Aurora'
import { GoogleSlideSignIn } from '@/components/GoogleSlideSignIn'
import { BrandIntro } from '@/components/BrandIntro'
import { hasSeenBrandIntro, markBrandIntroSeen } from '@/components/brandIntroState'
import { Icon, type IconName } from '@/components/Icon'
import { QuickAction } from '@/components/QuickAction'
import { Coach } from '@/components/Coach'
import { UndoToast } from '@/components/UndoToast'
import { useScrollCollapse } from '@/hooks/useScrollCollapse'
import { getSettings } from '@/db/repo'
import { useLiquidGlass } from '@/hooks/useLiquidGlass'
import { useOnline, useSyncMeta } from '@/hooks/useDashboard'
import { useAutoSync } from '@/hooks/useDashboard'
import { Onboarding } from '@/screens/Onboarding'
import {
  API_BASE,
  bootstrapAccountState,
  pullServerState,
  replaceServerState,
  scheduleSync,
  type SyncOutcome,
} from '@/sync/client'
import { getAuthState, signOut, subscribeAuth, takeGoogleRedirectError, type AuthState } from '@/auth/session'

const TABS: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/food', label: 'Food', icon: 'food' },
  { to: '/activity', label: 'Activity', icon: 'activity' },
  { to: '/plan', label: 'Plan', icon: 'plan' },
]

function useAuthState(): AuthState | null {
  const [auth, setAuth] = useState<AuthState | null>(() => getAuthState())

  useEffect(() => subscribeAuth(() => setAuth(getAuthState())), [])

  return auth
}

/**
 * Backup / connectivity chip.
 *
 * Deliberately a small floating chip rather than a full-width bar: it is
 * ambient status, not an alert, and it appears on every screen. It stays out
 * of the way until there is genuinely something to say.
 */
function StatusChip() {
  const online = useOnline()
  const meta = useSyncMeta()
  const durableVersion = API_BASE ? meta?.syncedVersion : meta?.backedUpVersion
  const pending = meta ? meta.localVersion - (durableVersion ?? 0) : 0
  /*
   * A background sync failure used to be visible ONLY on Plan → sync details,
   * which meant a device could quietly drift for weeks (the 178-change pileup
   * happened exactly this way). A conflict has its own full gate; every other
   * failure surfaces here as an ambient warning chip that stays on screen
   * until sync succeeds. Nothing to click — the chip is a signal, not a
   * modal — but at least the user knows something is wrong.
   */
  const conflictHandled = meta?.lastError?.startsWith('Sync conflict')
  const showError = !!meta?.lastError && !conflictHandled

  if (online && pending === 0 && !showError) return null

  return (
    /*
     * Sits above the tab bar on a phone and at the top on a laptop. Fixed to
     * the top on mobile would cover the page header, which is where the date
     * and phase live.
     */
    <div className="app-status-position pointer-events-none">
      <div className={`app-status-chip ${showError ? 'is-error' : ''}`}>
        {!online ? (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-warn" />
            Offline — saved on this device
          </span>
        ) : showError ? (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-alert" />
            Sync failing — {pending} change{pending === 1 ? '' : 's'} unsent
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-info" />
            {pending} change{pending === 1 ? '' : 's'} waiting for {API_BASE ? 'sync' : 'backup'}
          </span>
        )}
      </div>
    </div>
  )
}

function SidebarLink({ tab, active }: { tab: (typeof TABS)[number]; active: boolean }) {
  return (
    <NavLink
      to={tab.to}
      end={tab.to === '/'}
      className={`app-nav-link ${active ? 'is-active' : ''}`}
      aria-label={tab.label}
    >
      <span className="app-nav-icon">
        <Icon name={tab.icon} active={active} />
      </span>
      <span>{tab.label}</span>
    </NavLink>
  )
}

/**
 * Detail screens reached from a tab, mapped to the tab that owns them.
 *
 * Without this a user who follows a link off Today lands somewhere with no tab
 * lit at all, which reads as having fallen out of the app. Adding each as its
 * own tab would be worse: they are drill-downs, not peer sections, and a
 * five-item bar on a phone is already crowded.
 */
export const DETAIL_ROUTE_PARENT: Record<string, string> = {
  '/progress': '/',
  '/calendar': '/',
  '/workout': '/activity',
}

export function activeTabPath(pathname: string): string {
  for (const [detail, parent] of Object.entries(DETAIL_ROUTE_PARENT)) {
    if (pathname === detail || pathname.startsWith(`${detail}/`)) return parent
  }
  return pathname
}

function RailNav() {
  const location = useLocation()
  const path = activeTabPath(location.pathname)
  const activeIndex = TABS.findIndex((tab) =>
    tab.to === '/' ? path === '/' : path === tab.to || path.startsWith(`${tab.to}/`),
  )

  return (
    <div className="app-sidebar-frame">
      <div className="app-sidebar-brand">
        <strong>Formara</strong>
        <span>Your next move</span>
      </div>

      <nav className="app-sidebar-nav" aria-label="Primary navigation">
        {TABS.map((tab, index) => (
          <SidebarLink key={tab.to} tab={tab} active={index === activeIndex} />
        ))}
      </nav>

      <div className="app-sidebar-account">
        <AccountButton />
      </div>
    </div>
  )
}

function AccountButton({ mobile = false }: { mobile?: boolean }) {
  const auth = useAuthState()

  return (
    <NavLink
      to="/account"
      className={({ isActive }) => `app-account-button ${isActive ? 'is-active' : ''}`}
      aria-label="Open account"
      title="Account"
      data-mobile={mobile ? 'true' : undefined}
    >
      {auth?.user.picture ? (
        <img src={auth.user.picture} alt="" className="h-full w-full object-cover" />
      ) : (
        (auth?.user.name ?? auth?.user.email ?? 'Formara').charAt(0).toUpperCase()
      )}
    </NavLink>
  )
}

function WelcomePage() {
  const [status, setStatus] = useState<string | null>(() => takeGoogleRedirectError())

  return (
    <div className="min-h-dvh bg-surface text-surface-ink">
      <main className="mx-auto flex min-h-dvh w-full max-w-[1600px] flex-col p-3 safe-top sm:p-5 lg:p-6">
        <header className="flex min-h-16 shrink-0 items-center justify-between px-2 sm:px-3">
          <div>
            <div className="font-heading type-heading leading-none text-surface-ink">
              Formara
            </div>
            <div className="mt-1.5 type-caption font-medium text-surface-ink-muted">
              Your body. Your data. Your next move.
            </div>
          </div>
          <div className="hidden items-center gap-2 type-caption font-medium text-surface-ink-muted sm:flex">
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
            Private by design
          </div>
        </header>

        <section className="formara-welcome-hero relative mt-2 min-h-[calc(100dvh-6.5rem)] flex-1 overflow-hidden radius-control border border-surface-line bg-surface-raised shadow-[0_24px_80px_-48px_rgba(17,20,17,0.45)]">
          {/*
            The LCP element on the one screen that gates the whole app, so it is
            art-directed rather than merely scaled: the landscape frame puts the
            subject behind the headline and panel on a phone and shows mostly
            wall, so narrow viewports get a portrait crop centred on her instead.
            Intrinsic width/height reserve the aspect ratio to avoid a shift when
            it decodes, and fetchPriority outranks the JS bundle for early
            bandwidth.
          */}
          <picture>
            <source
              media="(max-width: 639px)"
              srcSet="/formara-login-hero-mobile.webp"
              type="image/webp"
            />
            <source media="(max-width: 639px)" srcSet="/formara-login-hero-mobile.jpg" />
            <source
              srcSet="/formara-login-hero-800.webp 800w, /formara-login-hero-1600.webp 1586w"
              sizes="100vw"
              type="image/webp"
            />
            <img
              src="/formara-login-hero.jpg"
              alt="Athlete checking her watch after a run on a track"
              width={1586}
              height={992}
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover object-[64%_center] sm:object-[60%_center]"
            />
          </picture>
          <div className="relative z-10 flex min-h-[calc(100dvh-6.5rem)] flex-col p-5 sm:p-8 lg:p-12">
            <div className="type-micro font-semibold text-surface-ink-muted">
              Personal fitness, made clear
            </div>

            <div className="mt-auto grid items-end gap-6 pt-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-10">
              {/*
                Wraps on width rather than being pinned to two hard lines. The
                nowrap version cleared the container by 33px at the sm
                breakpoint, and the parent clips overflow — so any longer copy
                or a translation would have been silently cut off instead of
                reflowing. `text-balance` keeps the two-line shape it was drawn
                with, and the max-width sets where it turns over.
              */}
              <h1 className="font-heading max-w-[14ch] type-display leading-[0.94] text-surface-ink lg:text-7xl xl:text-8xl [text-wrap:balance]">
                Make your next move count
              </h1>

              <div className="w-full max-w-sm lg:ml-auto">
                <div className="formara-auth-panel radius-control p-5 text-surface-ink sm:p-6">
                  <h2 className="font-heading type-heading leading-tight text-surface-ink">
                    Welcome back
                  </h2>
                  <p className="mt-2 type-caption leading-6 text-surface-ink-muted">
                    Sign in to continue with your training, recovery, and nutrition data.
                  </p>

                  <GoogleSlideSignIn appearance="light" onStatus={setStatus} />
                  {status ? (
                    <div className="mt-3 type-caption leading-relaxed text-surface-ink-muted" role="status">
                      {status}
                    </div>
                  ) : null}

                  <p className="mt-4 border-t border-surface-line pt-4 type-caption leading-5 text-surface-ink-soft">
                    Your account keeps this device synced. Your fitness data stays private.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function syncOutcomeMessage(outcome: SyncOutcome): string | null {
  if (outcome.status === 'error') return outcome.message
  if (outcome.status === 'unauthorized') return 'Session expired. Sign in again.'
  if (outcome.status === 'offline') return 'You are offline. Connect once to load this account.'
  if (outcome.status === 'conflict') {
    return `Both copies changed: server ${outcome.serverVersion}, this device ${outcome.localVersion}.`
  }
  return null
}

function AccountSyncGate({
  title,
  body,
  detail,
  serverVersion,
  localVersion,
  pendingChanges,
  onRetry,
  onUseServer,
  onReplaceServer,
}: {
  title: string
  body: string
  detail?: string | null
  /** Live version numbers for the preview panel. */
  serverVersion?: number
  localVersion?: number
  /** How many local writes would be uploaded by "replace server". */
  pendingChanges?: number
  onRetry: () => void
  onUseServer?: () => void
  onReplaceServer?: () => void
}) {
  const hasPreview = serverVersion !== undefined && localVersion !== undefined
  return (
    <div className="min-h-dvh">
      <Aurora />
      <main className="mx-auto flex min-h-dvh max-w-md items-center px-5 text-center">
        <div className="glass-strong p-5">
          <h1 className="type-lead font-semibold text-[var(--app-ink)]">{title}</h1>
          <p className="mt-2 type-caption leading-6 text-[var(--app-ink-soft)]">{body}</p>
          {detail ? (
            <div className="mt-3 radius-control bg-warn/10 px-3 py-2 type-caption leading-relaxed text-warn ring-1 ring-inset ring-warn/20">
              {detail}
            </div>
          ) : null}
          {/*
            Preview before either destructive choice. Blindly tapping "Use
            server copy" while sitting on 178 pending changes was the exact
            way real data got lost — the gate should show which side is
            bigger, and how many local writes disappear if you go the other
            way, before you commit to either.
          */}
          {hasPreview ? (
            <div className="mt-3 grid grid-cols-2 gap-2 text-left">
              <div className="radius-control bg-[var(--app-inset)] p-3">
                <div className="type-micro font-semibold text-[var(--app-muted)]">This device</div>
                <div className="mt-1 tabular-nums type-metric-sm text-[var(--app-ink)]">v{localVersion}</div>
                {pendingChanges && pendingChanges > 0 ? (
                  <div className="mt-0.5 type-caption text-[var(--app-ink-soft)]">
                    {pendingChanges.toLocaleString()} unsynced change{pendingChanges === 1 ? '' : 's'}
                  </div>
                ) : null}
              </div>
              <div className="radius-control bg-[var(--app-inset)] p-3">
                <div className="type-micro font-semibold text-[var(--app-muted)]">Server copy</div>
                <div className="mt-1 tabular-nums type-metric-sm text-[var(--app-ink)]">v{serverVersion}</div>
                <div className="mt-0.5 type-caption text-[var(--app-ink-soft)]">Last accepted by the cloud</div>
              </div>
            </div>
          ) : null}
          <div className="mt-4 grid gap-2">
            {onUseServer ? (
              <button
                type="button"
                onClick={onUseServer}
                className="radius-control bg-accent px-3 py-2.5 type-caption font-semibold text-ink-950"
              >
                {pendingChanges && pendingChanges > 0
                  ? `Use server copy (discard ${pendingChanges.toLocaleString()} local)`
                  : 'Use server copy'}
              </button>
            ) : null}
            {onReplaceServer ? (
              <button
                type="button"
                onClick={onReplaceServer}
                className="radius-control bg-[var(--app-inset)] px-3 py-2.5 type-caption font-semibold text-[var(--app-ink)] ring-1 ring-inset ring-[var(--app-line)]"
              >
                Replace server with this device
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRetry}
              className="radius-control bg-[var(--app-inset)] px-3 py-2.5 type-caption font-semibold text-[var(--app-ink)] ring-1 ring-inset ring-[var(--app-line)]"
            >
              Retry sync
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

function TrackerShell() {
  useAutoSync()
  const shellLocation = useLocation()
  const mobileTabPath = activeTabPath(shellLocation.pathname)
  const chromeCollapsed = useScrollCollapse()
  const [quickActionOpen, setQuickActionOpen] = useState(false)
  // Collapsing the dock hides every tab but Today, which left no way to reach
  // the other pages without scrolling back to the top first. Tapping the
  // collapsed circle now re-opens the full dock instead of navigating, so the
  // circle behaves like "open the menu" rather than a dead Today link.
  const [navManuallyOpen, setNavManuallyOpen] = useState(false)
  const collapsed = chromeCollapsed && !navManuallyOpen

  // Picking a page closes the temporarily-opened menu; scrolling does too, so
  // it never lingers open over content the user has moved past.
  useEffect(() => {
    setNavManuallyOpen(false)
  }, [shellLocation.pathname])
  useEffect(() => {
    if (!navManuallyOpen) return
    const close = () => setNavManuallyOpen(false)
    window.addEventListener('scroll', close, { passive: true })
    return () => window.removeEventListener('scroll', close)
  }, [navManuallyOpen])
  // The tab bar is the one surface always on screen on mobile, so it is worth
  // the real refraction; content scrolling behind it is what makes it read as
  // glass rather than as a grey bar.
  const tabBarRef = useLiquidGlass<HTMLDivElement>({
    scale: -70,
    chroma: 4,
    blur: 5,
    mapBlur: 10,
  })

  useEffect(() => {
    const syncAfterAuth = () => scheduleSync(0)
    window.addEventListener('tracker-auth-change', syncAfterAuth)
    return () => window.removeEventListener('tracker-auth-change', syncAfterAuth)
  }, [])

  return (
    <div className="app-shell">
      <StatusChip />

      <aside className="app-sidebar">
        <RailNav />
      </aside>

      <div className="app-workspace">
        <header className="app-mobile-header safe-top">
          <div>
            <strong>Formara</strong>
            <span>Your body. Your data. Your next move.</span>
          </div>
          <AccountButton mobile />
        </header>
        <main className="app-page safe-top">
          <Outlet />
        </main>
      </div>

      {/*
        One dock that morphs rather than two elements swapping: collapsed, it
        clips down to just the Today icon as a circle; expanded, its right
        edge travels out to full width and the remaining tabs fade in behind
        it. A conditional swap could never animate that, because React would
        unmount whichever side was not showing and there would be no shared
        element for the transition to interpolate.
      */}
      <nav
        className={`app-mobile-nav app-mobile-nav--with-plus ${collapsed ? 'is-chrome-collapsed' : ''}`}
        aria-label="Primary navigation"
      >
        <div ref={tabBarRef} className="app-mobile-tabs">
          {TABS.map((tab) => {
            /*
              NavLink's own isActive only knows its exact path, so a detail
              screen would leave every tab dark. Resolving through the parent map
              keeps the owning tab lit, matching the desktop rail.
            */
            const active =
              tab.to === '/'
                ? mobileTabPath === '/'
                : mobileTabPath === tab.to || mobileTabPath.startsWith(`${tab.to}/`)
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === '/'}
                className={`app-mobile-tab ${active ? 'is-active' : ''}`}
                /* Collapsed, the clipped tabs must not stay focusable while
                   invisible; the visible Today circle stays reachable and
                   doubles as the control that re-opens the dock. */
                tabIndex={collapsed && tab.to !== '/' ? -1 : undefined}
                aria-hidden={collapsed && tab.to !== '/' ? true : undefined}
                aria-expanded={tab.to === '/' && chromeCollapsed ? !collapsed : undefined}
                onClick={(event) => {
                  // While collapsed, the circle opens the dock instead of
                  // navigating — otherwise there is no way back to the other
                  // tabs short of scrolling to the very top.
                  if (collapsed && tab.to === '/') {
                    event.preventDefault()
                    setNavManuallyOpen(true)
                  }
                }}
              >
                <Icon name={tab.icon} active={active} />
                <span>{tab.label}</span>
              </NavLink>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => setQuickActionOpen(true)}
          aria-label="Quick log"
          aria-haspopup="dialog"
          className="app-mobile-nav-plus motion-press"
        >
          <Icon name="plus" className="h-5 w-5" />
        </button>
      </nav>

      <QuickAction open={quickActionOpen} onOpenChange={setQuickActionOpen} />
      <Coach collapsed={collapsed} />
      <UndoToast />
    </div>
  )
}

export default function App() {
  const auth = useAuthState()
  const settings = useLiveQuery(() => getSettings(), [])
  const meta = useSyncMeta()
  const previewBrandIntro =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'intro'
  const previewOnboarding =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'onboarding'
  const [bootstrappedUserId, setBootstrappedUserId] = useState<number | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [bootConflict, setBootConflict] = useState<Extract<SyncOutcome, { status: 'conflict' }> | null>(null)
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [introCompletedForUser, setIntroCompletedForUser] = useState<number | null>(null)

  useEffect(() => {
    if (!auth) {
      setBootstrappedUserId(null)
      setBootConflict(null)
      return
    }
    let cancelled = false
    setBootError(null)
    setBootConflict(null)
    void bootstrapAccountState(auth.user.id)
      .then((outcome) => {
        if (cancelled) return
        const message = syncOutcomeMessage(outcome)
        if (outcome.status === 'conflict') {
          setBootConflict(outcome)
          setBootError(message)
          return
        }
        if (outcome.status === 'unauthorized') {
          void signOut()
          return
        }
        if (message) {
          setBootError(message)
          return
        }
        setBootstrappedUserId(auth.user.id)
      })
      .catch((error) => {
        if (cancelled) return
        setBootError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
    }
  }, [auth])

  const finishRecovery = async (action: 'pull' | 'replace' | 'retry') => {
    if (!auth) return
    setRecoveryBusy(true)
    setBootError(null)
    const outcome =
      action === 'pull'
        ? await pullServerState()
        : action === 'replace'
          ? await replaceServerState()
          : await bootstrapAccountState(auth.user.id)
    setRecoveryBusy(false)
    const message = syncOutcomeMessage(outcome)
    if (outcome.status === 'conflict') {
      setBootConflict(outcome)
      setBootError(message)
      return
    }
    if (outcome.status === 'unauthorized') {
      void signOut()
      return
    }
    if (message) {
      setBootError(message)
      return
    }
    setBootConflict(null)
    setBootstrappedUserId(auth.user.id)
  }

  if (!auth) return <WelcomePage />
  if (bootConflict) {
    return (
      <AccountSyncGate
        title={recoveryBusy ? 'Resolving account sync' : 'Choose your account copy'}
        body="This device and the cloud both changed. The server copy is safest, but you can intentionally overwrite it with this device."
        detail={bootError}
        serverVersion={bootConflict.serverVersion}
        localVersion={bootConflict.localVersion}
        pendingChanges={Math.max(0, bootConflict.localVersion - (meta?.syncedVersion ?? 0))}
        onRetry={() => void finishRecovery('retry')}
        onUseServer={() => void finishRecovery('pull')}
        onReplaceServer={() => void finishRecovery('replace')}
      />
    )
  }
  if (bootstrappedUserId !== auth.user.id || !settings) {
    return (
      <div className="min-h-dvh">
        <Aurora />
        <main className="mx-auto flex min-h-dvh max-w-md items-center px-5 text-center">
          <div className="glass-strong p-5">
            <h1 className="type-lead font-semibold text-[var(--app-ink)]">Loading your tracker</h1>
            <p className="mt-2 type-caption leading-6 text-[var(--app-ink-soft)]">
              Pulling your account data before opening the dashboard.
            </p>
            {bootError ? <div className="mt-3 type-caption text-warn">{bootError}</div> : null}
          </div>
        </main>
      </div>
    )
  }
  if (previewBrandIntro && introCompletedForUser !== auth.user.id) {
    return <BrandIntro onComplete={() => setIntroCompletedForUser(auth.user.id)} />
  }
  if (previewOnboarding) return <Onboarding preview />
  if (!settings.onboardingCompleted || !settings.planStartDate) {
    const introSeen =
      introCompletedForUser === auth.user.id || hasSeenBrandIntro(auth.user.id)
    if (!introSeen) {
      return (
        <BrandIntro
          onComplete={() => {
            markBrandIntroSeen(auth.user.id)
            setIntroCompletedForUser(auth.user.id)
          }}
        />
      )
    }
    return (
      <div className="min-h-dvh">
        <Aurora />
        <Onboarding />
      </div>
    )
  }
  if (meta && meta.lastSyncedAt === null && meta.localVersion > meta.syncedVersion) {
    return (
      <AccountSyncGate
        title={recoveryBusy ? 'Saving your account' : 'Finish cloud save'}
        body="Your plan is saved on this device, but the cloud copy has not accepted it yet. Finish this before opening the dashboard."
        detail={bootError ?? meta.lastError}
        onRetry={() => void finishRecovery('retry')}
      />
    )
  }

  /*
   * A conflict can also surface from a background sync mid-session, not just
   * at boot — the previous version only checked at boot, so a conflict that
   * happened while the app was already open kept failing silently every
   * retry with nothing ever telling the user. This is reactive to the same
   * `syncMeta.lastError` autoSync writes, so it appears the moment it
   * happens rather than waiting for the next cold start.
   */
  if (meta?.lastError?.startsWith('Sync conflict')) {
    /*
     * A mid-session conflict does not carry the server number in the error
     * message, so parse it if present and otherwise fall back to unknown —
     * still shows the local side (which is what the user was about to lose
     * blindly), just without the direct comparison.
     */
    const parsed = /server\s+(\d+)/i.exec(meta.lastError)
    const serverVersion = parsed ? Number(parsed[1]) : null
    return (
      <AccountSyncGate
        title={recoveryBusy ? 'Resolving account sync' : 'Choose your account copy'}
        body="This device and the cloud both changed since your last sync. The server copy is safest, but you can intentionally overwrite it with this device."
        detail={meta.lastError}
        {...(serverVersion !== null ? { serverVersion } : {})}
        localVersion={meta.localVersion}
        pendingChanges={Math.max(0, meta.localVersion - meta.syncedVersion)}
        onRetry={() => void finishRecovery('retry')}
        onUseServer={() => void finishRecovery('pull')}
        onReplaceServer={() => void finishRecovery('replace')}
      />
    )
  }

  return <TrackerShell />
}
