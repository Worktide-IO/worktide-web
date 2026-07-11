import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bug, Wifi, ServerCrash, Hourglass, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  readSimulatorMode,
  readSimulatorState,
  setSimulatorMode,
  subscribeSimulator,
  type SimulatorMode,
} from '@/lib/networkSimulator';

/**
 * Dev-only floating panel for toggling the network simulator. Lives
 * bottom-left so it doesn't collide with the pending-mutations toast.
 *
 * Render is gated by `import.meta.env.DEV` at the call-site (AppLayout),
 * so the prod bundle never imports this. Keeping the gate at the
 * caller means tree-shaking actually drops the entire component +
 * its simulator module from `npm run build`.
 *
 * Layout:
 *  - Collapsed: 32 px "bug" button. Clicking opens the panel.
 *  - Expanded: title row + 4 buttons (Online / Offline / Server 500 /
 *    Slow). Active mode is highlighted; clicking again returns to
 *    Online. The bar at the bottom shows how many seconds remain
 *    before auto-revert.
 */
type Choice = {
  mode: Exclude<SimulatorMode, 'off'>;
  label: string;
  icon: React.ElementType;
  durationMs?: number;
  description: string;
};

const CHOICES: Choice[] = [
  { mode: 'offline', label: 'network_sim.offline_label', icon: Wifi, description: 'network_sim.offline_desc' },
  { mode: 'server', label: 'network_sim.server_label', icon: ServerCrash, description: 'network_sim.server_desc', durationMs: 30_000 },
  { mode: 'slow', label: 'network_sim.slow_label', icon: Hourglass, description: 'network_sim.slow_desc' },
];

export function NetworkSimulatorPanel(): React.JSX.Element | null {
  const { t: translate } = useTranslation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SimulatorMode>(() => readSimulatorMode());
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => subscribeSimulator(setMode), []);

  useEffect(() => {
    if (mode === 'off') {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const { expiresAt } = readSimulatorState();
      const remaining = Math.max(0, expiresAt - Date.now());
      setSecondsLeft(Math.ceil(remaining / 1000));
    };
    tick();
    const t = window.setInterval(tick, 500);
    return () => window.clearInterval(t);
  }, [mode]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-4 left-4 z-50 flex size-9 items-center justify-center rounded-full border border-border bg-background shadow-md hover:bg-muted',
          mode !== 'off' && 'border-amber-500 ring-2 ring-amber-500/30',
        )}
        title={mode === 'off' ? translate('network_sim.title') : translate('network_sim.active_title', { mode })}
        aria-label={translate('network_sim.open_aria')}
      >
        <Bug className={cn('size-4', mode === 'off' ? 'text-muted-foreground' : 'text-amber-600')} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 w-72 rounded-lg border border-border bg-background shadow-lg">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Bug className="size-4" />
          {translate('network_sim.title')}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-1 hover:bg-muted"
          aria-label={translate('network_sim.close_aria')}
        >
          <X className="size-3" />
        </button>
      </div>

      <div className="space-y-2 px-3 py-3">
        <Button
          variant={mode === 'off' ? 'default' : 'outline'}
          size="sm"
          className="w-full justify-start"
          onClick={() => setSimulatorMode('off')}
        >
          <Wifi className="mr-2 size-4 text-emerald-500" />
          {translate('network_sim.online')}
        </Button>
        {CHOICES.map((c) => (
          <Button
            key={c.mode}
            variant={mode === c.mode ? 'default' : 'outline'}
            size="sm"
            className="w-full justify-start"
            onClick={() => setSimulatorMode(c.mode, { durationMs: c.durationMs })}
            title={translate(c.description)}
          >
            <c.icon className="mr-2 size-4" />
            {translate(c.label)}
          </Button>
        ))}
      </div>

      <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
        {mode === 'off'
          ? translate('network_sim.hint_idle')
          : translate('network_sim.hint_active', { mode, seconds: secondsLeft })}
      </div>
    </div>
  );
}
