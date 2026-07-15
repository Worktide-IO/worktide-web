import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n' // initialise i18next before the app renders
import App from './App.tsx'
import { installPendingQueueDrainers } from './lib/pendingQueue.ts'
import { applyBranding, readCachedBranding } from './lib/branding.ts'
import { logVersionDiagnostics } from './lib/version.ts'

declare global {
  interface Window {
    __wtAppMounted?: () => void
  }
}

// Apply the last-known branding (colors + title) before first paint so a
// white-labeled instance never flashes stock Worktide colors. The
// BrandingProvider revalidates against the API once mounted.
applyBranding(readCachedBranding())

// Replay any mutations that were queued during the last session's
// outage. Safe to call before React mounts — drainers run async.
installPendingQueueDrainers()

// One-time console diagnostics: log the web build + the API build and warn on
// a mismatch (stale SPA against a newer API).
logVersionDiagnostics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Signal the blank-page recovery guard in index.html that the app mounted,
// so it clears the reload counter and the watchdog stands down.
window.__wtAppMounted?.()
