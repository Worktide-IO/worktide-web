import { useList } from '@refinedev/core';
import { Wifi, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { ProjectMemberJsonld } from '@/api/types/projectMember/Jsonld';
import type { ProjectStatusJsonld } from '@/api/types/projectStatus/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { useCustomerLookup } from '@/lib/useCustomerLookup';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

import { ProjectWallCard } from './ProjectWallCard';

/**
 * "The Wall" — workspace-wide team dashboard. One column per non-archived,
 * non-completed ProjectStatus, listing every project currently in that
 * lane. Read-only at-a-glance overview: who's working on what, how far
 * along, what the customer's name is.
 *
 * Cards never duplicate /projects — that page is for filtered drill-down;
 * The Wall is the standup view ("show me everything in flight").
 *
 * Mercure live on projects / tasks / project_members / project_statuses
 * so the wall stays current without polling.
 */
export function WallPage() {
  const [search, setSearch] = useState('');

  const { result: statuses, query: statusesQuery } = useList<Row<ProjectStatusJsonld>>({
    resource: 'project_statuses',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });
  const { result: projects, query: projectsQuery } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
    sorters: [{ field: 'updatedAt', order: 'desc' }],
    filters: [{ field: 'isArchived', operator: 'eq', value: 'false' }],
  });
  const { result: taskStatuses } = useList<Row<TaskStatusJsonld>>({
    resource: 'task_statuses',
    pagination: { mode: 'off' },
  });
  // Pull every task once — `pagination: off` is fine at typical agency
  // scale; we count open vs total client-side to avoid N task queries
  // (one per project) which scales worse than one big fetch.
  const { result: tasks } = useList<Row<TaskJsonld>>({
    resource: 'tasks',
    pagination: { mode: 'off' },
  });
  const { result: members } = useList<Row<ProjectMemberJsonld>>({
    resource: 'project_members',
    pagination: { mode: 'off' },
  });

  const { connected: liveConnected } = useLiveResource('projects');
  useLiveResource('tasks');
  useLiveResource('project_members');
  useLiveResource('project_statuses');

  const customerByIri = useCustomerLookup((projects?.data ?? []).map((p) => p.customer));

  const openTaskStatusIris = useMemo(() => {
    const set = new Set<string>();
    for (const s of taskStatuses?.data ?? []) {
      // API Platform strips the "is" prefix on boolean getters in the
      // serialized response (`completed` / `archived`), even though the
      // kubb-generated types still reflect the entity property names.
      // Read from both for safety; the wire-side `completed` wins.
      const completed =
        (s as { completed?: boolean }).completed ?? s.isCompleted ?? false;
      if (s['@id'] && !completed) set.add(s['@id']);
    }
    return set;
  }, [taskStatuses]);

  // Per-project: total task count + open task count + member list.
  const taskCountsByProject = useMemo(() => {
    const counts: Record<string, { total: number; open: number }> = {};
    for (const t of tasks?.data ?? []) {
      if (!t.project) continue;
      const c = counts[t.project] ?? { total: 0, open: 0 };
      c.total += 1;
      if (t.status && openTaskStatusIris.has(t.status)) c.open += 1;
      counts[t.project] = c;
    }
    return counts;
  }, [tasks, openTaskStatusIris]);

  const membersByProject = useMemo(() => {
    const map: Record<string, Row<ProjectMemberJsonld>[]> = {};
    for (const m of members?.data ?? []) {
      if (!m.project) continue;
      (map[m.project] ??= []).push(m);
    }
    return map;
  }, [members]);

  // Open lanes only — completed/archived statuses don't belong on the wall.
  // The API serializes booleans without the "is" prefix; fall back to the
  // kubb-typed names so a future serialization tweak stays sane.
  const lanes = useMemo(
    () =>
      (statuses?.data ?? []).filter((s) => {
        const completed =
          (s as { completed?: boolean }).completed ?? s.isCompleted ?? false;
        const archived =
          (s as { archived?: boolean }).archived ?? s.isArchived ?? false;
        return !completed && !archived;
      }),
    [statuses],
  );

  const filteredProjects = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (projects?.data ?? []).filter((p) => {
      if (!needle) return true;
      const hay = [p.name, p.key, p.description ?? ''].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [projects, search]);

  const projectsByStatus = useMemo(() => {
    const map: Record<string, Row<ProjectJsonld>[]> = {};
    for (const p of filteredProjects) {
      if (!p.status) continue;
      (map[p.status] ??= []).push(p);
    }
    return map;
  }, [filteredProjects]);

  const isLoading = statusesQuery.isLoading || projectsQuery.isLoading;
  const totalShown = filteredProjects.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl">The Wall</h2>
            {liveConnected ? (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Wifi className="size-3" /> Live
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                <WifiOff className="size-3" /> offline
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {totalShown} laufende Projekte über {lanes.length} Lanes
          </p>
        </div>
        <Input
          placeholder="Projekt oder Kunde…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
      </div>

      {isLoading ? (
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
          Keine aktiven Projekt-Status definiert.
        </p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {lanes.map((lane) => {
            const laneProjects = projectsByStatus[lane['@id'] ?? ''] ?? [];
            return (
              <div
                key={lane['@id']}
                className="w-72 shrink-0 rounded-lg border bg-muted/30 p-3"
              >
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
                      Keine Projekte
                    </p>
                  ) : (
                    laneProjects.map((p) => {
                      const counts = taskCountsByProject[p['@id'] ?? ''] ?? {
                        total: 0,
                        open: 0,
                      };
                      const customer = p.customer ? customerByIri[p.customer] : null;
                      const projectMembers = membersByProject[p['@id'] ?? ''] ?? [];
                      return (
                        <ProjectWallCard
                          key={p['@id']}
                          project={p}
                          customer={customer ?? null}
                          totalTasks={counts.total}
                          openTasks={counts.open}
                          members={projectMembers}
                        />
                      );
                    })
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
