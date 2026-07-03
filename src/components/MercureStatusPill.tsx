import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { readMercureHealth, type MercureHealth } from '@/lib/mercure';

/**
 * Tiny live-status dot rendered in the sidebar footer next to the
 * user menu. Three meaningful states:
 *
 *  - green  → at least one live Mercure subscription is connected
 *  - amber  → subscriptions are reconnecting (transient — pulsing)
 *  - grey   → no subscriptions active (e.g. on a page without one)
 *  - red    → every subscription failed (hub down)
 *
 * Listens to the `wt-mercure-status` CustomEvent emitted by
 * `src/lib/mercure.ts`. We don't render a tooltip because the
 * sidebar's collapsed-icon mode already wraps siblings, and the
 * dot is informational only — clicking it is not a fix-it action.
 */
export function MercureStatusPill(): React.JSX.Element {
  const [health, setHealth] = useState<MercureHealth>(() => readMercureHealth());

  useEffect(() => {
    const onChange = (e: CustomEvent<{ health: MercureHealth }>) => {
      setHealth(e.detail.health);
    };
    window.addEventListener('wt-mercure-status', onChange);
    return () => window.removeEventListener('wt-mercure-status', onChange);
  }, []);

  const { color, label, pulse } = HEALTH_STYLES[health];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={`Live-Status: ${label}`}
      aria-label={`Live-Status: ${label}`}
    >
      <span
        className={cn(
          'inline-block size-2 rounded-full',
          color,
          pulse && 'animate-pulse',
        )}
      />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

const HEALTH_STYLES: Record<MercureHealth, { color: string; label: string; pulse: boolean }> = {
  idle: { color: 'bg-muted-foreground/40', label: 'inaktiv', pulse: false },
  connecting: { color: 'bg-amber-500', label: 'verbinde …', pulse: true },
  connected: { color: 'bg-emerald-500', label: 'live', pulse: false },
  reconnecting: { color: 'bg-amber-500', label: 'verbinde neu …', pulse: true },
  offline: { color: 'bg-rose-500', label: 'offline', pulse: false },
};
