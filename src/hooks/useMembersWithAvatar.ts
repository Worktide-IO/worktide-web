import { useList } from '@refinedev/core';
import { useMemo } from 'react';

import type { Row } from '@/lib/refine';

type FileRow = { target?: string; targetId?: string };

/**
 * The set of user ids that actually have an avatar, from one workspace-scoped
 * `files?target=user` list. Used to gate {@link AuthedAvatar} so it only
 * blob-fetches the avatar of members who have one — otherwise every member
 * without a photo would 404 the (auth-gated) avatar route and clutter the
 * console.
 */
export function useMembersWithAvatar(): Set<string> {
  const { result } = useList<Row<FileRow>>({
    resource: 'files',
    pagination: { mode: 'off' },
    filters: [{ field: 'target', operator: 'eq', value: 'user' }],
  });

  return useMemo(() => {
    const ids = new Set<string>();
    for (const f of result?.data ?? []) {
      if (f.targetId) ids.add(f.targetId);
    }
    return ids;
  }, [result]);
}
