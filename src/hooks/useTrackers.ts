import { useList } from '@refinedev/core';
import { useMemo } from 'react';

import type { TrackerJsonld } from '@/api/types/tracker/Jsonld';
import type { Row } from '@/lib/refine';

/**
 * Workspace-scoped tracker directory (Bug / Feature / Story / Support…).
 * Same pattern as useTags — one fetch shared across every consumer so
 * the chip on a kanban card and the dropdown in the task-detail sheet
 * draw from the same in-memory map.
 *
 * The directory also exposes the workspace's default tracker so that
 * "new task" flows can pre-select it without a second round-trip.
 */
export function useTrackers() {
  const { result, query } = useList<Row<TrackerJsonld>>({
    resource: 'trackers',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });

  const trackers = result?.data ?? [];

  const byIri = useMemo(() => {
    const map: Record<string, Row<TrackerJsonld>> = {};
    for (const t of trackers) if (t['@id']) map[t['@id']] = t;
    return map;
  }, [trackers]);

  const defaultTracker = useMemo(
    () => trackers.find((t) => (t as unknown as { default?: boolean }).default) ?? null,
    [trackers],
  );

  return { trackers, byIri, defaultTracker, isLoading: query.isLoading };
}
