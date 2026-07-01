import { useList } from '@refinedev/core';
import { ListChecks } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { useCustomerLookup } from '@/lib/useCustomerLookup';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const PRIORITY_VARIANT: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  low: 'outline',
  normal: 'secondary',
  high: 'default',
  urgent: 'destructive',
};

/**
 * Cross-project list of open tasks that belong to projects with an
 * assigned customer. The "everything a paying customer is still
 * waiting on" view — the coordinator's first thing to look at every
 * morning.
 *
 * Filters client-side (workspace usually has < 100 active tasks):
 *  - task.status.isCompleted === false
 *  - task.project.customer !== null
 */
export function OpenCustomerTasksWidget() {
  const navigate = useNavigate();

  const { result: tasks, query } = useList<Row<TaskJsonld>>({
    resource: 'tasks',
    pagination: { mode: 'off' },
    sorters: [{ field: 'dueOn', order: 'asc' }],
  });
  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
  });
  const { result: statuses } = useList<Row<TaskStatusJsonld>>({
    resource: 'task_statuses',
    pagination: { mode: 'off' },
  });
  useLiveResource('tasks');

  const projectByIri = useMemo(() => {
    const m: Record<string, Row<ProjectJsonld>> = {};
    for (const p of projects?.data ?? []) if (p['@id']) m[p['@id']] = p;
    return m;
  }, [projects]);
  const customerByIri = useCustomerLookup((projects?.data ?? []).map((p) => p.customer));
  const openStatusIris = useMemo(() => {
    const set = new Set<string>();
    for (const s of statuses?.data ?? []) {
      const completed = (s as { completed?: boolean }).completed ?? s.isCompleted ?? false;
      if (s['@id'] && !completed) set.add(s['@id']);
    }
    return set;
  }, [statuses]);

  const rows = useMemo(() => {
    return (tasks?.data ?? []).filter((t) => {
      if (!t.status || !openStatusIris.has(t.status)) return false;
      if (!t.project) return false;
      const project = projectByIri[t.project];
      return Boolean(project?.customer);
    });
  }, [tasks, openStatusIris, projectByIri]);

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="size-4 text-muted-foreground" />
          Offene Kunden-Aufgaben
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {rows.length}
          </span>
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
          <p className="text-center text-sm text-muted-foreground py-8">
            Alle Kunden-Aufgaben sind erledigt 🎉
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((t) => {
              const project = t.project ? projectByIri[t.project] : null;
              const customer = project?.customer ? customerByIri[project.customer] : null;
              return (
                <li key={t['@id']}>
                  <button
                    type="button"
                    className="widget-no-drag flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/50"
                    onClick={() =>
                      project?.id && navigate(`/projects/${project.id}?tab=board`)
                    }
                  >
                    <span
                      className="mt-1 size-2 shrink-0 rounded-full"
                      aria-hidden
                      style={{ backgroundColor: project?.color ?? '#6366f1' }}
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {t.identifier}
                        </span>
                        <span className="truncate text-sm font-medium">{t.title}</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {customer?.name ?? '—'} · {project?.name}
                        {t.dueOn ? ` · ${new Date(t.dueOn).toLocaleDateString()}` : ''}
                      </div>
                    </div>
                    {t.priority && t.priority !== 'normal' ? (
                      <Badge
                        variant={PRIORITY_VARIANT[t.priority] ?? 'outline'}
                        className="ml-1 shrink-0 text-[10px]"
                      >
                        {t.priority === 'urgent'
                          ? 'Dringend'
                          : t.priority === 'high'
                            ? 'Hoch'
                            : 'Niedrig'}
                      </Badge>
                    ) : null}
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
