import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { ensureSeeded } from '@/db/database'
import { requestPersistentStorage } from '@/sync/client'
import Today from '@/screens/Today'
import Calendar from '@/screens/Calendar'
import DayDetail from '@/screens/DayDetail'
import WorkoutScreen from '@/screens/WorkoutScreen'
import Progress from '@/screens/Progress'
import Plan from '@/screens/Plan'
import './index.css'

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateServiceWorker(true)
  },
})

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Today /> },
      { path: 'calendar', element: <Calendar /> },
      { path: 'calendar/:date', element: <DayDetail /> },
      { path: 'workout', element: <WorkoutScreen /> },
      { path: 'progress', element: <Progress /> },
      { path: 'plan', element: <Plan /> },
    ],
  },
])

// Seed before first paint so no screen has to handle a half-empty database.
await ensureSeeded()
// Best-effort: ask the browser not to evict the only copy of the data.
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
