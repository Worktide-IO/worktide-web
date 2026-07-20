import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api'
import { recordError } from '@/lib/diagnostics';
import {
  DEFAULT_DASHBOARD_LAYOUT,
  type DashboardLayout,
  type DashboardWidget,
} from '@/lib/dashboard';

/**
 * Older persisted layouts (or hand-crafted JSON via the curl API) may
 * lack `instanceId`. Generate one deterministically from the key so
 * subsequent renders are stable — needed because react-grid-layout uses
 * the id as the child React key.
 */
function normaliseLayout(raw: DashboardLayout): DashboardLayout {
  const seen = new Map<string, number>();
  return {
    ...raw,
    widgets: raw.widgets.map<DashboardWidget>((w) => {
      if (w.instanceId) return w;
      const n = (seen.get(w.key) ?? 0) + 1;
      seen.set(w.key, n);
      return { ...w, instanceId: n === 1 ? w.key : `${w.key}-${n}` };
    }),
  };
}

type ApiShape = {
  dashboardLayout: DashboardLayout | null;
  updatedAt: string | null;
};

/**
 * Bridges `/v1/me/preferences` to a React state-pair the dashboard can
 * mutate directly. Reads on mount; debounces writes so a free-form
 * react-grid-layout drag (which fires `onLayoutChange` per tick) doesn't
 * hammer the server. Writes wait 600ms after the last mutation.
 *
 * Falls back to the default layout when the server returns null (first
 * access) without persisting anything — the user owns the moment when
 * the layout becomes "their" layout (first edit), avoiding the case
 * where every visitor immediately gets a row.
 *
 * `setLayout(next)` returns the value it stored, so callers can chain
 * "update + read" without a render round-trip.
 */
export function useDashboardLayout() {
  const [layout, setLayoutState] = useState<DashboardLayout>(DEFAULT_DASHBOARD_LAYOUT);
  const [isLoading, setIsLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const { data } = await api.get<ApiShape>('/me/preferences');
        if (!mounted.current) return;
        if (data.dashboardLayout) {
          setLayoutState(normaliseLayout(data.dashboardLayout));
        }
      } catch (err) {
        // Network or auth error → render defaults rather than block the
        // dashboard. The user can re-save later.
        recordError('dashboard_layout.load_failed', String(err));
      } finally {
        if (mounted.current) setIsLoading(false);
      }
    })();
    return () => {
      mounted.current = false;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const persist = useCallback(async (next: DashboardLayout) => {
    try {
      await api.put('/me/preferences', { dashboardLayout: next });
      if (mounted.current) setIsDirty(false);
    } catch (err) {
      recordError('dashboard_layout.persist_failed', String(err));
    }
  }, []);

  const setLayout = useCallback(
    (next: DashboardLayout) => {
      setLayoutState(next);
      setIsDirty(true);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => persist(next), 600);
      return next;
    },
    [persist],
  );

  const resetToDefault = useCallback(() => {
    setLayout(DEFAULT_DASHBOARD_LAYOUT);
  }, [setLayout]);

  return { layout, setLayout, resetToDefault, isLoading, isDirty };
}
