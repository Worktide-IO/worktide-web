import { useList } from '@refinedev/core';
import { useMemo } from 'react';

import type { UserJsonld } from '@/api/types/user/Jsonld';
import type { Row } from '@/lib/refine';

/**
 * Workspace-scoped user directory.
 *
 * Fetches every user the active workspace can see in one shot
 * (`pagination.mode: 'off'`) and exposes a `byIri` map so any consumer
 * can resolve a user-IRI → User without re-fetching. Refine's
 * tanstack-query layer shares the cache across all hook callers in the
 * tree, so calling this from N components only triggers one network
 * request per workspace/session.
 *
 * The list is small in practice (agency-sized workspaces, dozens not
 * thousands of seats), making the off-pagination single request the
 * right trade-off against a per-user `useOne` fan-out.
 */
export function useUserDirectory() {
  const { result, query } = useList<Row<UserJsonld>>({
    resource: 'users',
    pagination: { mode: 'off' },
  });

  const byIri = useMemo(() => {
    const map: Record<string, Row<UserJsonld>> = {};
    for (const u of result?.data ?? []) {
      if (u['@id']) map[u['@id']] = u;
    }
    return map;
  }, [result]);

  return {
    users: result?.data ?? [],
    byIri,
    isLoading: query.isLoading,
  };
}

/**
 * "JD" from "Jane Doe", "S" from solo "Sven", "?" when nothing usable.
 * Falls back to email local-part initial if no name is set.
 */
export function userInitials(u: { firstName?: string; lastName?: string; email?: string }): string {
  const first = u.firstName?.trim();
  const last = u.lastName?.trim();
  if (first && last) return (first[0] + last[0]).toUpperCase();
  if (first) return first[0].toUpperCase();
  if (last) return last[0].toUpperCase();
  if (u.email) return u.email[0].toUpperCase();
  return '?';
}

/** Best human-friendly name; falls back to email, then "Unbekannt". */
export function userDisplayName(u: {
  firstName?: string;
  lastName?: string;
  email?: string;
}): string {
  const parts = [u.firstName?.trim(), u.lastName?.trim()].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return u.email ?? 'Unbekannt';
}
