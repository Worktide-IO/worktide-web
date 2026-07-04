import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, WifiOff } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { NetworkErrorKind, NetworkStatusEventDetail } from '@/lib/api';

/**
 * Sticky top banner that surfaces network / server failures the user
 * would otherwise see only as a stuck spinner.
 *
 * Three states it actually renders:
 *  - `offline` — browser `offline` event OR axios reported network error
 *  - `degraded` — last request hit a 5xx or timed out
 *  - `recovered` — flashed for 2.5 s after recovery, then dismissed
 *
 * Source-of-truth is the `wt-network-status` CustomEvent emitted by
 * `src/lib/api.ts`. The browser `online`/`offline` events are layered
 * on top so we react instantly to WLAN drops without waiting for the
 * next API call to fail.
 *
 * Validation 4xx and `401` are deliberately filtered out at the api.ts
 * interceptor layer — those belong to the calling component, not the
 * banner.
 */
type BannerKind = 'offline' | 'degraded' | 'recovered';

type BannerState = {
  kind: BannerKind;
  message: string;
} | null;

export function NetworkStatusBanner(): React.JSX.Element | null {
  const [state, setState] = useState<BannerState>(
    typeof navigator !== 'undefined' && navigator.onLine === false
      ? { kind: 'offline', message: 'Keine Internetverbindung.' }
      : null,
  );

  useEffect(() => {
    const onOnline = () => {
      // Browser-level recovery; we still wait for an actual successful
      // API call before claiming "all good", but flip the banner to
      // recovered so the user knows the OS sees the network back.
      setState({ kind: 'recovered', message: 'Internetverbindung wieder da.' });
    };
    const onOffline = () => {
      setState({ kind: 'offline', message: 'Keine Internetverbindung.' });
    };
    const onApiStatus = (e: CustomEvent<NetworkStatusEventDetail>) => {
      if (e.detail.recovered) {
        setState({ kind: 'recovered', message: e.detail.message });
        return;
      }
      const next = kindFromApi(e.detail.kind);
      if (!next) return;
      setState({ kind: next, message: e.detail.message });
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('wt-network-status', onApiStatus);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('wt-network-status', onApiStatus);
    };
  }, []);

  // Auto-dismiss the "recovered" pulse after a short window so it
  // doesn't sit there forever after every network blip.
  useEffect(() => {
    if (state?.kind !== 'recovered') return;
    const t = window.setTimeout(() => setState(null), 2_500);
    return () => window.clearTimeout(t);
  }, [state]);

  if (!state) return null;

  const styles = bannerStyles[state.kind];
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'sticky top-0 z-40 flex items-center justify-center gap-2 px-4 py-1.5 text-sm font-medium',
        styles.container,
      )}
    >
      <styles.icon className="size-4 shrink-0" />
      <span>{state.message}</span>
    </div>
  );
}

function kindFromApi(kind: NetworkErrorKind): BannerKind | null {
  switch (kind) {
    case 'offline':
      return 'offline';
    case 'timeout':
    case 'server':
      return 'degraded';
    default:
      return null;
  }
}

const bannerStyles: Record<BannerKind, { container: string; icon: React.ElementType }> = {
  offline: {
    container: 'bg-rose-600 text-white',
    icon: WifiOff,
  },
  degraded: {
    container: 'bg-amber-500 text-amber-950',
    icon: AlertTriangle,
  },
  recovered: {
    container: 'bg-emerald-600 text-white',
    icon: CheckCircle2,
  },
};
