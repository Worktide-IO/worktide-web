import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api'
import { recordError } from '@/lib/diagnostics';

export type WatchableTarget = 'task' | 'project' | 'document';

type WatchSnapshot = {
  watching: boolean;
  watchId?: string | null;
  watchersCount: number;
};

/**
 * Watch/unwatch a polymorphic target (task / project / document).
 *
 * The hook owns three things: the user's own subscription state, the
 * total watcher count on the target, and the toggle action. The first
 * GET fires once per (target, targetId) mount; subsequent flips happen
 * optimistically — the POST/DELETE result reconciles if the server says
 * otherwise.
 *
 * No Mercure wiring here — when watcher counts move from other clients
 * matters less than the local-action feedback, and a refetch on
 * window-focus covers the slow drift. If we ever want shared counts
 * live, subscribe to the watch URI-template and useInvalidate.
 */
export function useWatch(target: WatchableTarget, targetId: string | null | undefined) {
  const [snapshot, setSnapshot] = useState<WatchSnapshot>({ watching: false, watchersCount: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const pending = useRef(false);

  const refresh = useCallback(async () => {
    if (!targetId) return;
    try {
      const { data } = await api.get<WatchSnapshot>('/watch/me', {
        params: { target, targetId },
      });
      setSnapshot(data);
    } catch (err) {
      recordError('watch.load_failed', String(err));
    } finally {
      setIsLoading(false);
    }
  }, [target, targetId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = useCallback(async () => {
    if (!targetId || pending.current) return;
    pending.current = true;
    const next = !snapshot.watching;
    // Optimistic — flip the count in the same direction the user just
    // requested so the icon swap feels instant.
    setSnapshot((s) => ({
      ...s,
      watching: next,
      watchersCount: Math.max(0, s.watchersCount + (next ? 1 : -1)),
    }));
    try {
      const { data } = await api.request<WatchSnapshot>({
        method: next ? 'POST' : 'DELETE',
        url: '/watch',
        data: { target, targetId },
      });
      setSnapshot(data);
    } catch (err) {
      recordError('watch.toggle_failed', String(err));
      await refresh();
    } finally {
      pending.current = false;
    }
  }, [refresh, snapshot.watching, target, targetId]);

  return { ...snapshot, isLoading, toggle };
}
