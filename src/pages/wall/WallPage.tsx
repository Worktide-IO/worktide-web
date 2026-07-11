import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { topicFor, useMercureTopic } from '@/lib/mercure';
import { LiveBadge } from '@/components/LiveBadge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

import { ProjectWallCard, type WallProject } from './ProjectWallCard';

type Lane = { '@id': string; id: string; name: string; color: string };
type WallData = { lanes: Lane[]; projects: WallProject[] };

const KEY = ['dashboard', 'wall'] as const;

/**
 * "The Wall" — workspace-wide team dashboard. One column per open
 * ProjectStatus, listing every non-archived project currently in that lane
 * with its task-progress, customer and team. Read-only standup view.
 *
 * Backed by the /v1/dashboard/wall read-model: the server assembles lanes,
 * projects (customer inlined), per-project task counts (one GROUP BY, no task
 * rows shipped) and member user-IRIs — replacing five pagination:off fetch-alls
 * (project_statuses + projects + task_statuses + EVERY task + project_members).
 * Search + lane grouping stay client-side over the bounded project set. Mercure
 * live on projects / tasks / project_members / project_statuses.
 */
export function WallPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await api.get<WallData>('/dashboard/wall');
      return data;
    },
  });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: KEY });
  const { connected: liveConnected } = useMercureTopic(topicFor('projects'), { onMessage: invalidate });
  useMercureTopic(topicFor('tasks'), { onMessage: invalidate });
  useMercureTopic(topicFor('project_members'), { onMessage: invalidate });
  useMercureTopic(topicFor('project_statuses'), { onMessage: invalidate });

  const lanes = query.data?.lanes ?? [];
  const projects = query.data?.projects ?? [];

  const filteredProjects = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((p) => [p.name, p.key, p.description ?? ''].join(' ').toLowerCase().includes(needle));
  }, [projects, search]);

  const projectsByStatus = useMemo(() => {
    const map: Record<string, WallProject[]> = {};
    for (const p of filteredProjects) (map[p.status] ??= []).push(p);
    return map;
  }, [filteredProjects]);

  const totalShown = filteredProjects.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl">The Wall</h2>
            <LiveBadge connected={liveConnected} />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('wall.summary', { count: totalShown, lanes: lanes.length })}
          </p>
        </div>
        <Input
          placeholder={t('wall.search_placeholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
      </div>

      {query.isLoading ? (
        <div className="flex gap-4 overflow-x-auto">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-72 shrink-0 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ))}
        </div>
      ) : lanes.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">
          {t('wall.no_active_statuses')}
        </p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {lanes.map((lane) => {
            const laneProjects = projectsByStatus[lane['@id']] ?? [];
            return (
              <div key={lane['@id']} className="w-72 shrink-0 rounded-lg border bg-muted/30 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: lane.color ?? '#94a3b8' }}
                    />
                    <h3 className="text-sm font-medium">{lane.name}</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">{laneProjects.length}</span>
                </div>
                <div className="space-y-2">
                  {laneProjects.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground/70 py-6">
                      {t('wall.no_projects')}
                    </p>
                  ) : (
                    laneProjects.map((p) => <ProjectWallCard key={p['@id']} project={p} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
