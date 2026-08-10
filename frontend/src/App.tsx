import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Aurora } from '@/components/Aurora'
import { GoogleSlideSignIn } from '@/components/GoogleSlideSignIn'
import { Icon, type IconName } from '@/components/Icon'
import { getSettings } from '@/db/repo'
import { useLiquidGlass } from '@/hooks/useLiquidGlass'
import { useOnline, useSyncMeta } from '@/hooks/useDashboard'
import { useAutoSync } from '@/hooks/useDashboard'
import { Onboarding } from '@/screens/Onboarding'
import { API_BASE, scheduleSync, sync } from '@/sync/client'
import { getAuthState, signOut, subscribeAuth, type AuthState } from '@/auth/session'

const TABS: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/progress', label: 'Progress', icon: 'progress' },
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
  const [status, setStatus] = useState<string | null>(null)

  return (
    <div className="min-h-dvh">
      <Aurora />

      <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-6 safe-top sm:px-8 lg:px-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-2xl font-black text-ink-950 shadow-[0_18px_40px_-22px] shadow-accent">
              k
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-50">Fat Loss Ledger</div>
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-400">
                Private training dashboard
              </div>
            </div>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[minmax(0,1.1fr)_24rem] lg:gap-12">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              Rules decide. AI narrates.
            </div>
            <h1 className="text-5xl font-semibold leading-[0.95] tracking-tight text-ink-50 sm:text-6xl lg:text-7xl">
              Your cut, training, and recovery in one calm place.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-ink-200 sm:text-lg">
              Log the day, watch the trend, and keep decisions grounded in the plan instead of
              noise from one weigh-in.
            </p>

            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
              {[
                ['Today', 'Calories, protein, training, recovery'],
                ['Progress', 'Trend weight and adherence'],
                ['Plan', 'Phase targets and reviews'],
              ].map(([title, body]) => (
                <div key={title} className="glass-inset rounded-2xl p-4">
                  <div className="text-sm font-semibold text-ink-50">{title}</div>
                  <div className="mt-1 text-[12px] leading-relaxed text-ink-400">{body}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-strong rounded-3xl p-5 shadow-[0_30px_90px_-52px_rgba(0,240,255,0.75)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-ink-50">Welcome back</div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-400">
                  Sign in to open the tracker and sync this device.
                </p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/8 text-xl font-black text-accent ring-1 ring-inset ring-white/10">
                k
              </div>
            </div>

            <GoogleSlideSignIn onStatus={setStatus} />
            {status ? <div className="mt-3 text-[12px] text-ink-300">{status}</div> : null}

            <div className="mt-5 grid grid-cols-2 gap-2 text-[11px] text-ink-400">
              <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-inset ring-white/8">
                <span className="block text-ink-200">Account-backed</span>
                Private to your Google sign-in
              </div>
              <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-inset ring-white/8">
                <span className="block text-ink-200">Offline-capable</span>
                Works after your plan loads
              </div>
            </div>
          </div>
        </section>
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
  const [bootstrappedUserId, setBootstrappedUserId] = useState<number | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    if (!auth) {
      setBootstrappedUserId(null)
      return
    }
    let cancelled = false
    setBootError(null)
    void sync()
      .then((outcome) => {
        if (cancelled) return
        if (outcome.status === 'error') setBootError(outcome.message)
        setBootstrappedUserId(auth.user.id)
      })
      .catch((error) => {
        if (cancelled) return
        setBootError(error instanceof Error ? error.message : String(error))
        setBootstrappedUserId(auth.user.id)
      })
    return () => {
      cancelled = true
    }
  }, [auth])

  if (!auth) return <WelcomePage />
  if (bootstrappedUserId !== auth.user.id || !settings) {
    return (
      <div className="min-h-dvh">
        <Aurora />
        <main className="mx-auto flex min-h-dvh max-w-md items-center px-5 text-center">
          <div className="glass-strong rounded-3xl p-5">
            <div className="text-lg font-semibold text-ink-50">Loading your tracker</div>
            <p className="mt-2 text-sm leading-6 text-ink-300">
              Pulling your account data before opening the dashboard.
            </p>
            {bootError ? <div className="mt-3 text-[12px] text-warn">{bootError}</div> : null}
          </div>
        </main>
      </div>
    )
  }
  if (!settings.onboardingCompleted || !settings.planStartDate) {
    return (
      <div className="min-h-dvh">
        <Aurora />
        <Onboarding />
      </div>
    )
  }

  return <TrackerShell />
}
