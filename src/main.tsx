import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installPendingQueueDrainers } from './lib/pendingQueue.ts'
import { applyBranding, readCachedBranding } from './lib/branding.ts'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Signal the blank-page recovery guard in index.html that the app mounted,
// so it clears the reload counter and the watchdog stands down.
window.__wtAppMounted?.()
