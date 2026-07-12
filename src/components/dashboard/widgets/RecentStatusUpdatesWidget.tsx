import { Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { intlLocale } from '@/lib/intl';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { topicFor, useMercureTopic } from '@/lib/mercure';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type Health = 'on_track' | 'at_risk' | 'off_track' | 'on_hold' | 'complete';

/** One row from GET /v1/dashboard/recent-status-updates — project + author inlined. */
type StatusUpdate = {
  '@id': string;
  id: string;
  health: Health;
  title: string | null;
  summary: string | null;
  createdAt: string | null;
  project: { '@id': string; id: string; name: string };
  author: { id: string; name: string } | null;
};

const HEALTH_DOT: Record<Health, string> = {
  on_track: 'bg-green-500',
  at_risk: 'bg-amber-500',
  off_track: 'bg-red-500',
  on_hold: 'bg-slate-400',
  complete: 'bg-sky-500',
};

const KEY = ['dashboard', 'recent-status-updates'] as const;

/**
 * Workspace-wide feed of the most recent project status-updates — the
 * coordinator's "what did every project last report" glance. Backed by the
 * /v1/dashboard/recent-status-updates read-model (server returns the newest 12
 * with project + author inlined) instead of fetching the whole
 * project_status_updates + projects collections and slicing client-side.
 */
export function RecentStatusUpdatesWidget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await api.get<{ updates: StatusUpdate[] }>('/dashboard/recent-status-updates');
      return data;
    },
  });
  useMercureTopic(topicFor('project_status_updates'), {
    onMessage: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });

  const rows = query.data?.updates ?? [];

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="size-4 text-muted-foreground" />
          {t('widget.recent_status_updates.label')}
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
              const project = u.project;
              const line = u.title || u.summary || '—';
              return (
                <li key={u['@id']}>
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
                        {u.author ? ` · ${u.author.name}` : ''}
                        {u.createdAt ? ` · ${new Date(u.createdAt).toLocaleDateString(intlLocale())}` : ''}
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
