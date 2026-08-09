import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { Aurora } from '@/components/Aurora'
import { Icon, type IconName } from '@/components/Icon'
import { useLiquidGlass } from '@/hooks/useLiquidGlass'
import { useOnline, useSyncMeta } from '@/hooks/useDashboard'
import { useAutoSync } from '@/hooks/useDashboard'
import { API_BASE, scheduleSync } from '@/sync/client'
import {
  GOOGLE_CLIENT_ID,
  getAuthState,
  signInWithGoogleCredential,
  signOut,
  subscribeAuth,
  type AuthState,
} from '@/auth/session'

const TABS: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/workout', label: 'Workout', icon: 'workout' },
  { to: '/progress', label: 'Progress', icon: 'progress' },
  { to: '/plan', label: 'Plan', icon: 'plan' },
]

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string
            callback: (response: { credential?: string }) => void
          }) => void
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
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
      className="glass-strong relative flex flex-col items-center gap-4 overflow-visible rounded-full p-2.5 shadow-[0_28px_80px_-36px_rgba(74,222,128,0.55)]"
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
  const [auth, setAuth] = useState<AuthState | null>(() => getAuthState())
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const googleRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => subscribeAuth(() => setAuth(getAuthState())), [])

  useEffect(() => {
    if (auth || !open || !GOOGLE_CLIENT_ID || !googleRef.current) return
    const scriptId = 'google-identity-services'
    const render = () => {
      if (!window.google || !googleRef.current) return
      googleRef.current.innerHTML = ''
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          if (!response.credential) return
          setStatus('Signing in...')
          void signInWithGoogleCredential(response.credential)
            .then(() => setStatus('Signed in. Syncing backup...'))
            .catch((error) => setStatus(error instanceof Error ? error.message : String(error)))
        },
      })
      window.google.accounts.id.renderButton(googleRef.current, {
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
        text: 'signin_with',
      })
    }

    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script')
      script.id = scriptId
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = render
      document.head.appendChild(script)
    } else {
      render()
    }
  }, [auth, open])

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
              {GOOGLE_CLIENT_ID ? (
                <div ref={googleRef} className="mt-4 min-h-10" />
              ) : (
                <div className="mt-4 rounded-2xl bg-warn/10 p-3 text-[12px] text-warn ring-1 ring-inset ring-warn/20">
                  Add `VITE_GOOGLE_CLIENT_ID` to enable Google login.
                </div>
              )}
              {status ? <div className="mt-3 text-[12px] text-ink-300">{status}</div> : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

export default function App() {
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
