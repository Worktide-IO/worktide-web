import { useList } from '@refinedev/core';
import { useMemo } from 'react';

import type { ChannelJsonld } from '@/api/types/channel/Jsonld';
import type { EntitySyncJsonld } from '@/api/types/entitySync/Jsonld';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

import { EntitySyncBadge } from './EntitySyncBadge';
import { useEntitySyncScope } from './EntitySyncScope';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Renders all external-system badges for one Worktide entity in a row.
 *
 * Sync source, in precedence order:
 *  1. **`syncs` prop** — the parent passes this entity's already-filtered syncs.
 *  2. **{@link EntitySyncScopeProvider} context** — a list/board wraps its rows
 *     in one provider that batch-fetches syncs for all visible ids; each stack
 *     reads its slice from there. No per-stack fetch.
 *  3. **Self-fetch** (fallback, single surfaces like the detail sheet): load the
 *     workspace `entity_syncs` and filter client-side. Avoid on long lists —
 *     `pagination:off` crawls the whole table (dozens of round-trips).
 *
 * Use `variant="compact"` on dense surfaces (kanban cards, task list rows) and
 * `variant="full"` in the task detail sheet header where the IDs deserve space.
 */
export function EntitySyncBadgeStack({
  entityType = 'task',
  entityId,
  syncs: providedSyncs,
  variant = 'compact',
  className,
}: {
  entityType?: string;
  entityId: string | undefined;
  /** Pre-scoped syncs for this entity; when set, no self-fetch is done. */
  syncs?: Row<EntitySyncJsonld>[];
  variant?: 'compact' | 'full';
  className?: string;
}) {
  const scope = useEntitySyncScope();
  // Fall back to fetching only when neither an explicit prop nor a scope
  // provider supplies the syncs for this entity. Even then, scope the request to
  // THIS entity (entityType + entityId) so a single surface (e.g. the detail
  // sheet) fetches its own 0–2 rows instead of crawling the whole workspace
  // table page by page.
  const selfFetch = providedSyncs === undefined && scope === null && Boolean(entityId);
  const { result: syncs, query: syncsQuery } = useList<Row<EntitySyncJsonld>>({
    resource: 'entity_syncs',
    pagination: { mode: 'off' },
    filters: entityId
      ? [
          { field: 'entityType', operator: 'eq', value: entityType },
          { field: 'entityId', operator: 'eq', value: entityId },
        ]
      : [],
    queryOptions: { enabled: selfFetch },
  });
  const { result: channels, query: channelsQuery } = useList<Row<ChannelJsonld>>({
    resource: 'channels',
    pagination: { mode: 'off' },
  });

  const channelByIri = useMemo(() => {
    const m: Record<string, Row<ChannelJsonld>> = {};
    for (const c of channels?.data ?? []) if (c['@id']) m[c['@id']] = c;
    return m;
  }, [channels]);

  const matching = useMemo(() => {
    if (!entityId) return [];
    if (providedSyncs !== undefined) return providedSyncs;
    if (scope) return scope.byKey[`${entityType}:${entityId}`] ?? [];
    return (syncs?.data ?? []).filter(
      (s) => s.entityType === entityType && s.entityId === entityId,
    );
  }, [providedSyncs, scope, syncs, entityType, entityId]);

  const loadingSelf = selfFetch && syncsQuery.isLoading;
  const loadingChannels = channelsQuery.isLoading;

  if (loadingSelf) {
    return (
      <span className={cn('inline-flex flex-wrap gap-1', className)}>
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </span>
    );
  }

  if (matching.length === 0) return null;

  return (
    <span className={cn('inline-flex flex-wrap', variant === 'compact' ? 'gap-1' : 'gap-2', className)}>
      {matching.map((s) => {
        const channel = s.channel ? channelByIri[s.channel] : null;
        return (
          <EntitySyncBadge
            key={s['@id']}
            adapterCode={channel?.adapterCode ?? 'unknown'}
            externalId={s.externalId ?? ''}
            externalUrl={s.externalUrl ?? null}
            variant={variant}
            lastSyncedAt={(s as unknown as { lastSyncedAt?: string }).lastSyncedAt}
            lastError={(s as unknown as { lastSyncError?: string }).lastSyncError}
          />
        );
      })}
    </span>
  );
}
