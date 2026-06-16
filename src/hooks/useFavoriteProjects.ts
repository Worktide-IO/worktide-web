import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { api } from '@/lib/api';

type Prefs = {
  favoriteProjectIds?: string[] | null;
  dashboardLayout?: unknown;
  idleTimeoutMinutes?: number | null;
  updatedAt?: string | null;
};

const QUERY_KEY = ['me', 'preferences'] as const;

/**
 * Read + mutate the user's favorite-project list (project UUIDs).
 *
 * Persists through PUT /v1/me/preferences alongside dashboardLayout
 * and idleTimeoutMinutes — same endpoint, partial-PUT semantics so
 * other keys stay untouched. Optimistic update so the star icon
 * flips immediately while the request is in flight.
 *
 * Cache key is shared across the app so SideBar, ProjectsList and
 * Detail header always see the same set.
 */
export function useFavoriteProjects() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<string[]> => {
      const { data } = await api.get<Prefs>('/me/preferences');
      return data.favoriteProjectIds ?? [];
    },
    staleTime: 30_000,
  });

  const favorites = query.data ?? [];

  const isFavorite = useCallback(
    (projectId: string | null | undefined): boolean =>
      Boolean(projectId) && favorites.includes(projectId as string),
    [favorites],
  );

  const toggle = useCallback(
    async (projectId: string) => {
      const current = qc.getQueryData<string[]>(QUERY_KEY) ?? [];
      const next = current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [projectId, ...current];
      qc.setQueryData(QUERY_KEY, next);
      try {
        await api.put('/me/preferences', { favoriteProjectIds: next });
      } catch {
        // rollback on failure
        qc.setQueryData(QUERY_KEY, current);
      }
    },
    [qc],
  );

  return { favorites, isFavorite, toggle, isLoading: query.isLoading };
}
