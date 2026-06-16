import { useList } from '@refinedev/core';
import { useMemo } from 'react';

import type { TagJsonld } from '@/api/types/tag/Jsonld';
import type { Row } from '@/lib/refine';

/**
 * Workspace-scoped tag directory. Like useUserDirectory, this fetches
 * every tag in a single call and shares the cache across every consumer
 * — so the TagPicker on the sheet and the TagChips on the kanban card
 * draw from the same in-memory map without a second network roundtrip.
 *
 * Optional `scope` parameter narrows the dropdown in the picker. The
 * scope-filter is client-side because Tag entries with `scope: 'any'`
 * are valid everywhere and the API search filter is "exact".
 */
export function useTags(scope?: 'project' | 'task' | 'customer') {
  const { result, query } = useList<Row<TagJsonld>>({
    resource: 'tags',
    pagination: { mode: 'off' },
    sorters: [{ field: 'name', order: 'asc' }],
  });

  const all = result?.data ?? [];

  const inScope = useMemo(() => {
    if (!scope) return all;
    return all.filter((t) => t.scope === scope || t.scope === 'any');
  }, [all, scope]);

  const byIri = useMemo(() => {
    const map: Record<string, Row<TagJsonld>> = {};
    for (const t of all) if (t['@id']) map[t['@id']] = t;
    return map;
  }, [all]);

  return { tags: inScope, all, byIri, isLoading: query.isLoading };
}
