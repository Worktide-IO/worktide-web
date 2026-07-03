import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installPendingQueueDrainers } from './lib/pendingQueue.ts'

// Replay any mutations that were queued during the last session's
// outage. Safe to call before React mounts — drainers run async.
installPendingQueueDrainers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
