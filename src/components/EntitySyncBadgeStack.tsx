import { useList } from '@refinedev/core';
import { useMemo } from 'react';

import type { ChannelJsonld } from '@/api/types/channel/Jsonld';
import type { EntitySyncJsonld } from '@/api/types/entitySync/Jsonld';
import type { Row } from '@/lib/refine';

import { EntitySyncBadge } from './EntitySyncBadge';

/**
 * Renders all external-system badges for one Worktide entity in a
 * row. Reads from the workspace's `entity_syncs` list (single
 * cached fetch shared across every task on the page) and filters
 * client-side by (entityType, entityId) — much cheaper than a
 * per-task fetch in a long kanban list.
 *
 * Use `variant="compact"` on dense surfaces (kanban cards, task
 * list rows) and `variant="full"` in the task detail sheet header
 * where the external IDs deserve space.
 */
export function EntitySyncBadgeStack({
  entityType = 'task',
  entityId,
  variant = 'compact',
  className,
}: {
  entityType?: string;
  entityId: string | undefined;
  variant?: 'compact' | 'full';
  className?: string;
}) {
  const { result: syncs } = useList<Row<EntitySyncJsonld>>({
    resource: 'entity_syncs',
    pagination: { mode: 'off' },
  });
  const { result: channels } = useList<Row<ChannelJsonld>>({
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
    return (syncs?.data ?? []).filter(
      (s) => s.entityType === entityType && s.entityId === entityId,
    );
  }, [syncs, entityType, entityId]);

  if (matching.length === 0) return null;

  return (
    <span className={className} style={{ display: 'inline-flex', gap: variant === 'compact' ? '0.25rem' : '0.5rem', flexWrap: 'wrap' }}>
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
