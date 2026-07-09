import { useEffect, useState } from 'react';

import { api, readAuth, WORKSPACE_STORAGE_KEY } from '@/lib/api';

/** Roles as returned per membership by GET /v1/auth/me. */
export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest';

type MeWorkspace = { id?: string; role?: WorkspaceRole; isCurrent?: boolean };
type MeResponse = { workspaces?: MeWorkspace[] };

/**
 * Current user's role in the active workspace, read from GET /v1/auth/me
 * (the same endpoint the auth provider already hits — its response carries
 * one entry per membership with `role` + `isCurrent`, the latter derived from
 * the X-Workspace-Id header the api client sends).
 *
 * This gates UI only — the real enforcement is the backend ChannelVoter.
 * The result is cached per active-workspace for the session so opening
 * several dialogs doesn't refetch.
 */
const cache = new Map<string, Promise<MeResponse>>();

function fetchMe(workspaceId: string): Promise<MeResponse> {
  let p = cache.get(workspaceId);
  if (!p) {
    p = api.get<MeResponse>('/auth/me').then((r) => r.data);
    // Drop from cache on failure so a transient error can retry next mount.
    p.catch(() => cache.delete(workspaceId));
    cache.set(workspaceId, p);
  }
  return p;
}

export function useWorkspaceRole(): { role: WorkspaceRole | null; isAdmin: boolean; isLoading: boolean } {
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const wsId = readAuth(WORKSPACE_STORAGE_KEY) ?? '';
    let cancelled = false;
    fetchMe(wsId)
      .then((me) => {
        if (cancelled) return;
        const ws =
          me.workspaces?.find((w) => w.isCurrent) ??
          me.workspaces?.find((w) => w.id === wsId) ??
          null;
        setRole(ws?.role ?? null);
      })
      .catch(() => {
        if (!cancelled) setRole(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { role, isAdmin: role === 'owner' || role === 'admin', isLoading };
}
