import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Aurora } from '@/components/Aurora'
import { GoogleSlideSignIn } from '@/components/GoogleSlideSignIn'
import { BrandIntro } from '@/components/BrandIntro'
import { hasSeenBrandIntro, markBrandIntroSeen } from '@/components/brandIntroState'
import { Icon, type IconName } from '@/components/Icon'
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

  if (online && pending === 0) return null

  return (
    /*
     * Sits above the tab bar on a phone and at the top on a laptop. Fixed to
     * the top on mobile would cover the page header, which is where the date
     * and phase live.
     */
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-30 flex justify-center lg:bottom-auto lg:top-0 lg:pl-24 lg:pt-3">
      <div className="glass rounded-full px-3.5 py-1.5 text-[11px] font-medium text-ink-200">
        {!online ? (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-warn" />
            Offline — saved on this device
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
      className={`group relative z-10 flex h-12 w-12 items-center justify-center rounded-full text-sm font-medium transition-[color,transform] duration-200 active:scale-95 ${
        active ? 'text-ink-950' : 'text-ink-300 hover:text-ink-50'
      }`}
      aria-label={tab.label}
      title={tab.label}
    >
      <span className="relative z-10 flex items-center justify-center">
        <Icon name={tab.icon} active={active} />
      </span>
    </NavLink>
  )
}

function RailNav() {
  const location = useLocation()
  const activeIndex = Math.max(
    0,
    TABS.findIndex((tab) =>
      tab.to === '/'
        ? location.pathname === '/'
        : location.pathname === tab.to || location.pathname.startsWith(`${tab.to}/`),
    ),
  )

  return (
    <div
      className="glass-strong relative flex flex-col items-center gap-4 overflow-visible rounded-full p-2.5 shadow-[0_28px_80px_-36px_rgba(57,255,20,0.6)]"
    >
      <AccountButton />

      <nav className="relative flex flex-col items-center gap-3">
        <div
          className="absolute left-0 top-0 z-0 h-12 w-12 rounded-full bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(226,232,240,0.78))] shadow-[0_18px_42px_-20px_rgba(255,255,255,0.9),inset_0_1px_1px_rgba(255,255,255,0.95),inset_0_-12px_22px_rgba(15,23,42,0.16)] ring-1 ring-inset ring-white/80 transition-transform duration-300 ease-[cubic-bezier(.2,.9,.2,1)] will-change-transform"
          style={{ transform: `translate3d(0, ${activeIndex * 60}px, 0)` }}
          aria-hidden="true"
        />
        {TABS.map((tab, index) => (
          <SidebarLink key={tab.to} tab={tab} active={index === activeIndex} />
        ))}
      </nav>
    </div>
  )
}

function AccountButton() {
  const auth = useAuthState()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-accent text-3xl font-black text-ink-50 shadow-[0_18px_40px_-22px] shadow-accent transition-transform active:scale-95"
        aria-label="Account"
        title="Account"
      >
        {auth?.user.picture ? (
          <img src={auth.user.picture} alt="" className="h-full w-full object-cover" />
        ) : (
          'k'
        )}
      </button>

      {open ? (
        <div className="glass-strong absolute left-full top-0 z-40 ml-3 w-72 rounded-3xl p-4 text-sm text-ink-200">
          {auth ? (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-accent text-lg font-bold text-ink-50">
                  {auth.user.picture ? (
                    <img src={auth.user.picture} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (auth.user.name ?? auth.user.email).charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink-50">
                    {auth.user.name ?? 'Signed in'}
                  </div>
                  <div className="truncate text-[12px] text-ink-400">{auth.user.email}</div>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-white/6 p-3 text-[12px] leading-relaxed text-ink-300">
                Cloud backup is tied to this Google account. Strava and Apple Fitness can plug in
                here later.
              </div>
              <button
                type="button"
                onClick={() => void signOut().then(() => setOpen(false))}
                className="mt-3 w-full rounded-2xl bg-white/8 px-3 py-2.5 font-semibold text-ink-50 ring-1 ring-inset ring-white/10"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <div className="font-semibold text-ink-50">Sign in</div>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
                Use Google to keep your tracker backed up across devices.
              </p>
              <GoogleSlideSignIn onStatus={setStatus} />
              {status ? <div className="mt-3 text-[12px] text-ink-300">{status}</div> : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function WelcomePage() {
  const [status, setStatus] = useState<string | null>(() => takeGoogleRedirectError())

  return (
    <div className="min-h-dvh bg-surface text-surface-ink">
      <main className="mx-auto flex min-h-dvh w-full max-w-[1600px] flex-col p-3 safe-top sm:p-5 lg:p-6">
        <header className="flex min-h-16 shrink-0 items-center justify-between px-2 sm:px-3">
          <div>
            <div className="font-heading text-2xl font-bold leading-none text-surface-ink sm:text-3xl">
              Formara
            </div>
            <div className="mt-1.5 text-xs font-medium text-surface-ink-muted sm:text-sm">
              Your body. Your data. Your next move.
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs font-medium text-surface-ink-muted sm:flex">
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
            Private by design
          </div>
        </header>

        <section className="relative mt-2 min-h-[calc(100dvh-6.5rem)] flex-1 overflow-hidden rounded-lg border border-surface-line bg-surface-raised shadow-[0_24px_80px_-48px_rgba(17,20,17,0.45)]">
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
            <div className="text-[11px] font-semibold uppercase text-surface-ink-muted">
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
              <h1 className="font-heading max-w-[14ch] text-4xl font-bold leading-[0.94] text-surface-ink sm:text-6xl lg:text-7xl xl:text-8xl [text-wrap:balance]">
                Make your next move count
              </h1>

              <div className="w-full max-w-sm lg:ml-auto">
                <div className="formara-auth-panel rounded-lg p-5 text-surface-ink sm:p-6">
                  <h2 className="font-heading text-2xl font-semibold leading-tight text-surface-ink">
                    Welcome back
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-surface-ink-muted">
                    Sign in to continue with your training, recovery, and nutrition data.
                  </p>

                  <GoogleSlideSignIn appearance="light" onStatus={setStatus} />
                  {status ? (
                    <div className="mt-3 text-xs leading-relaxed text-surface-ink-muted" role="status">
                      {status}
                    </div>
                  ) : null}

                  <p className="mt-4 border-t border-surface-line pt-4 text-xs leading-5 text-surface-ink-soft">
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
  onRetry,
  onUseServer,
  onReplaceServer,
}: {
  title: string
  body: string
  detail?: string | null
  onRetry: () => void
  onUseServer?: () => void
  onReplaceServer?: () => void
}) {
  return (
    <div className="min-h-dvh">
      <Aurora />
      <main className="mx-auto flex min-h-dvh max-w-md items-center px-5 text-center">
        <div className="glass-strong rounded-3xl p-5">
          <h1 className="text-lg font-semibold text-ink-50">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-ink-300">{body}</p>
          {detail ? (
            <div className="mt-3 rounded-2xl bg-warn/10 px-3 py-2 text-[12px] leading-relaxed text-warn ring-1 ring-inset ring-warn/20">
              {detail}
            </div>
          ) : null}
          <div className="mt-4 grid gap-2">
            {onUseServer ? (
              <button
                type="button"
                onClick={onUseServer}
                className="rounded-2xl bg-accent px-3 py-2.5 text-sm font-semibold text-ink-950"
              >
                Use server copy
              </button>
            ) : null}
            {onReplaceServer ? (
              <button
                type="button"
                onClick={onReplaceServer}
                className="rounded-2xl bg-white/8 px-3 py-2.5 text-sm font-semibold text-ink-50 ring-1 ring-inset ring-white/10"
              >
                Replace server with this device
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRetry}
              className="rounded-2xl bg-white/6 px-3 py-2.5 text-sm font-semibold text-ink-200 ring-1 ring-inset ring-white/10"
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
    <div className="min-h-dvh">
      <Aurora />
      <StatusChip />

      {/* Desktop floating rail. Hidden below lg, where the tab bar takes over. */}
      <aside className="pointer-events-none fixed inset-y-0 left-0 z-20 hidden w-24 flex-col items-center py-5 lg:flex">
        <div className="pointer-events-auto">
          <RailNav />
        </div>

        <div className="pointer-events-auto glass-strong mt-auto flex h-14 w-14 items-center justify-center rounded-full text-ink-300">
          ⌁
        </div>
      </aside>

      <div className="lg:pl-24">
        <main className="mx-auto w-full max-w-[92rem] px-4 pb-28 safe-top sm:px-6 lg:px-8 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Mobile tab bar: a floating glass pill, Apple Fitness style. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div
          ref={tabBarRef}
          className="glass-strong flex w-full max-w-md items-center gap-1 rounded-2xl p-1.5"
        >
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-ink-50' : 'text-ink-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <span
                      className="glass-inset absolute inset-0 rounded-xl"
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="relative z-10 flex flex-col items-center gap-0.5">
                    <Icon name={tab.icon} active={isActive} />
                    {tab.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default function App() {
  const auth = useAuthState()
  const settings = useLiveQuery(() => getSettings(), [])
  const meta = useSyncMeta()
  const previewBrandIntro =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'intro'
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
          <div className="glass-strong rounded-3xl p-5">
            <h1 className="text-lg font-semibold text-ink-50">Loading your tracker</h1>
            <p className="mt-2 text-sm leading-6 text-ink-300">
              Pulling your account data before opening the dashboard.
            </p>
            {bootError ? <div className="mt-3 text-[12px] text-warn">{bootError}</div> : null}
          </div>
        </main>
      </div>
    )
  }
  if (previewBrandIntro && introCompletedForUser !== auth.user.id) {
    return <BrandIntro onComplete={() => setIntroCompletedForUser(auth.user.id)} />
  }
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

  return <TrackerShell />
}
