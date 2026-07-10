import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { EntitySyncJsonld } from '@/api/types/entitySync/Jsonld';
import { api } from '@/lib/api';
import type { Row } from '@/lib/refine';

/**
 * Batched external-sync lookup for a set of entities.
 *
 * Wrap a list/board in {@link EntitySyncScopeProvider} with the visible entity
 * ids; it does ONE `entity_syncs?entityType=…&entityId[]=…` request and exposes
 * the results keyed by `${entityType}:${entityId}`. Every {@link EntitySyncBadgeStack}
 * rendered underneath then reads from this scope instead of self-fetching the
 * whole workspace `entity_syncs` table per surface (which `pagination:off` turns
 * into a page-by-page crawl — dozens of round-trips on a big workspace).
 */
type EntitySyncScopeValue = {
  byKey: Record<string, Row<EntitySyncJsonld>[]>;
};

const EntitySyncScopeContext = createContext<EntitySyncScopeValue | null>(null);

export function useEntitySyncScope(): EntitySyncScopeValue | null {
  return useContext(EntitySyncScopeContext);
}

export function EntitySyncScopeProvider({
  entityType = 'task',
  ids,
  children,
}: {
  entityType?: string;
  ids: Array<string | null | undefined>;
  children: ReactNode;
}) {
  const cleanIds = useMemo(
    () => Array.from(new Set(ids.filter((id): id is string => Boolean(id)))),
    [ids],
  );

  const { data } = useQuery({
    queryKey: ['entity-sync-scope', entityType, cleanIds],
    enabled: cleanIds.length > 0,
    queryFn: async () => {
      const search = new URLSearchParams();
      search.set('entityType', entityType);
      for (const id of cleanIds) search.append('entityId[]', id);
      // 200 = API max per page; sync rows are sparse (most entities have none),
      // so one page comfortably covers a board's worth of scoped ids.
      search.set('itemsPerPage', '200');
      const { data } = await api.get(`/entity_syncs?${search.toString()}`);
      return (data.member ?? data['hydra:member'] ?? []) as Row<EntitySyncJsonld>[];
    },
  });

  const value = useMemo<EntitySyncScopeValue>(() => {
    const byKey: Record<string, Row<EntitySyncJsonld>[]> = {};
    for (const s of data ?? []) {
      if (!s.entityId) continue;
      const key = `${s.entityType}:${s.entityId}`;
      (byKey[key] ??= []).push(s);
    }
    return { byKey };
  }, [data]);

  return (
    <EntitySyncScopeContext.Provider value={value}>{children}</EntitySyncScopeContext.Provider>
  );
}
