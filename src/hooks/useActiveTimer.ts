import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api'
import { recordError } from '@/lib/diagnostics';
import { topicFor, useMercureTopic } from '@/lib/mercure';

/**
 * Snapshot of the user's running stopwatch — mirrors the JSON returned
 * by /v1/timers/current and /v1/timers/start.
 */
export type ActiveTimerSnapshot = {
  running: true;
  timerId: string;
  startedAt: string;
  elapsedSeconds: number;
  taskId: string | null;
  projectId: string | null;
  typeOfWorkId: string | null;
  description: string | null;
  isBillable: boolean;
};

export type StartTimerInput = {
  taskId?: string | null;
  projectId?: string | null;
  description?: string | null;
  isBillable?: boolean;
};

type ApiResponseIdle = { running: false };
type ApiResponseRunning = ActiveTimerSnapshot;

/**
 * Per-user stopwatch state machine. One hook instance lives in the
 * AppLayout (FloatingTimer) so every page sees the same timer.
 *
 * Sync strategy:
 *  - Initial GET /v1/timers/current on mount to seed
 *  - Mercure subscription on the active_timers URI template catches
 *    starts/stops from other tabs (same user logged in twice) so the
 *    floating pill stays consistent. The Mercure frame is just a
 *    nudge — we refetch the canonical state to avoid trusting the
 *    payload shape.
 *
 * The visible clock is driven by a 1Hz setInterval that re-derives
 * elapsed seconds from `startedAt` — no API calls per tick.
 */
export function useActiveTimer() {
  const [timer, setTimer] = useState<ActiveTimerSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<ApiResponseIdle | ApiResponseRunning>('/timers/current');
      setTimer(data.running ? data : null);
    } catch (err) {
      recordError('active_timer.fetch_failed', String(err));
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  // Mercure: any active_timer mutation (start/stop/cancel) nudges us to
  // refetch — payload is per-instance, we don't try to parse it.
  useMercureTopic(topicFor('active_timers'), {
    onMessage: () => {
      void refresh();
    },
  });

  const start = useCallback(
    async (input: StartTimerInput) => {
      const { data } = await api.post<ActiveTimerSnapshot>('/timers/start', input);
      setTimer(data);
      return data;
    },
    [],
  );

  const stop = useCallback(async () => {
    await api.post('/timers/stop', {});
    setTimer(null);
  }, []);

  const cancel = useCallback(async () => {
    await api.post('/timers/cancel', {});
    setTimer(null);
  }, []);

  return { timer, isLoading, refresh, start, stop, cancel };
}

/**
 * Re-renders every second so a consumer can show a live mm:ss clock
 * without prop-drilling a tick or burning a render budget on the main
 * tree. The number itself isn't useful — subscribe and call elapsed()
 * yourself.
 */
export function useTick(intervalMs = 1000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return tick;
}

/** Format seconds as `H:MM:SS` (no padding on the hours) — never grows wider than 8 chars under a 100-hour timer. */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${hh}:${pad(mm)}:${pad(ss)}`;
}
