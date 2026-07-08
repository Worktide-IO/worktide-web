import { useList } from '@refinedev/core';
import { Activity } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { Row } from '@/lib/refine';
import { useUserDirectory, userDisplayName } from '@/hooks/useUserDirectory';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type Health = 'on_track' | 'at_risk' | 'off_track' | 'on_hold' | 'complete';

type StatusUpdate = Row<{
  '@id'?: string;
  id?: string;
  health?: Health;
  title?: string | null;
  summary?: string | null;
  project?: string | null;
  createdByUser?: string | null;
  createdAt?: string;
}>;

const HEALTH_DOT: Record<Health, string> = {
  on_track: 'bg-green-500',
  at_risk: 'bg-amber-500',
  off_track: 'bg-red-500',
  on_hold: 'bg-slate-400',
  complete: 'bg-sky-500',
};

/**
 * Workspace-wide feed of the most recent project status-updates — the
 * coordinator's "what did every project last report" glance. Reads the same
 * ProjectStatusUpdate resource as the project Status-Updates tab; clicking a
 * row opens that project's tab.
 */
export function RecentStatusUpdatesWidget() {
  const navigate = useNavigate();

  const { result: updates, query } = useList<StatusUpdate>({
    resource: 'project_status_updates',
    pagination: { mode: 'off' },
    sorters: [{ field: 'createdAt', order: 'desc' }],
  });
  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
  });
  const { byIri: userByIri } = useUserDirectory();

  const projectByIri = useMemo(() => {
    const m: Record<string, Row<ProjectJsonld>> = {};
    for (const p of projects?.data ?? []) if (p['@id']) m[p['@id']] = p;
    return m;
  }, [projects]);

  const rows = useMemo(() => (updates?.data ?? []).slice(0, 12), [updates]);

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="size-4 text-muted-foreground" />
          Status-Updates
          <span className="ml-auto text-xs font-normal text-muted-foreground">{rows.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[calc(100%-3rem)] overflow-y-auto px-2 pb-2">
        {query.isLoading ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-5/6" />
            <Skeleton className="h-9 w-4/5" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Noch keine Status-Updates.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((u) => {
              const project = u.project ? projectByIri[u.project] : null;
              const author = u.createdByUser ? userByIri[u.createdByUser] : undefined;
              const line = u.title || u.summary || '—';
              return (
                <li key={u['@id'] ?? u.id}>
                  <button
                    type="button"
                    className="widget-no-drag flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/50"
                    onClick={() =>
                      project?.id && navigate(`/projects/${project.id}?tab=status-updates`)
                    }
                  >
                    <span
                      className={cn(
                        'mt-1 size-2 shrink-0 rounded-full',
                        HEALTH_DOT[u.health ?? 'on_track'],
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="truncate text-sm font-medium">{line}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {project?.name ?? '—'}
                        {author ? ` · ${userDisplayName(author)}` : ''}
                        {u.createdAt ? ` · ${new Date(u.createdAt).toLocaleDateString('de-DE')}` : ''}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
