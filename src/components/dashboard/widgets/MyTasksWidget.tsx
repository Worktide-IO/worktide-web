import { useGetIdentity, useList } from '@refinedev/core';
import { CalendarDays, ListTodo } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const PRIORITY_VARIANT: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  low: 'outline',
  normal: 'secondary',
  high: 'default',
  urgent: 'destructive',
};

type Identity = { id?: string };

/**
 * "Meine Aufgaben" — tasks the current user is an assignee on, filtered
 * by due-date relative to today. Three tabs:
 *
 *   Heute      dueOn === heute        (also "vergessen") → roter Badge
 *   Diese Wo.  dueOn ∈ [heute, +6]
 *   Überfäll.  dueOn < heute UND status nicht completed
 *
 * Assignee-check sieht direkte Zuweisungen + Team-Membership (`assignees`
 * vom Backend ist schon flattened auf User-IRIs; Team-Expansion ist
 * derzeit nur direct-user — siehe project_worktide TaskAssignee Memo).
 */
type TabKey = 'today' | 'week' | 'overdue';

export function MyTasksWidget() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('today');
  const { data: identity } = useGetIdentity<Identity>();
  const userIri = identity?.id ? `/v1/users/${identity.id}` : null;

  const { result: tasks, query } = useList<Row<TaskJsonld>>({
    resource: 'tasks',
    pagination: { mode: 'off' },
    sorters: [{ field: 'dueOn', order: 'asc' }],
    queryOptions: { enabled: Boolean(userIri) },
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
  const openStatusIris = useMemo(() => {
    const set = new Set<string>();
    for (const s of statuses?.data ?? []) {
      const completed = (s as { completed?: boolean }).completed ?? s.isCompleted ?? false;
      if (s['@id'] && !completed) set.add(s['@id']);
    }
    return set;
  }, [statuses]);

  const mine = useMemo(() => {
    if (!userIri) return [];
    return (tasks?.data ?? []).filter(
      (t) => (t.assignees ?? []).includes(userIri),
    );
  }, [tasks, userIri]);

  // Bucket boundaries — local time, midnight-snapped so the filter survives
  // server-side UTC offsets in dueOn.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  const buckets = useMemo(() => {
    const todays: Row<TaskJsonld>[] = [];
    const weeks: Row<TaskJsonld>[] = [];
    const overdues: Row<TaskJsonld>[] = [];
    for (const t of mine) {
      const isOpen = t.status ? openStatusIris.has(t.status) : true;
      if (!t.dueOn) {
        if (isOpen) todays.push(t);
        continue;
      }
      const d = new Date(t.dueOn);
      d.setHours(0, 0, 0, 0);
      if (d < today && isOpen) {
        overdues.push(t);
      } else if (d >= today && d < tomorrow) {
        todays.push(t);
      } else if (d >= today && d < weekEnd) {
        weeks.push(t);
      }
    }
    return { today: todays, week: weeks, overdue: overdues };
  }, [mine, openStatusIris, today, tomorrow, weekEnd]);

  if (query.isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListTodo className="size-4 text-muted-foreground" /> Meine Aufgaben
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-5/6" />
        </CardContent>
      </Card>
    );
  }

  const renderList = (list: Row<TaskJsonld>[]) =>
    list.length === 0 ? (
      <p className="text-center text-xs text-muted-foreground py-8">
        Nichts hier — gönn dir 'nen Kaffee.
      </p>
    ) : (
      <ul className="divide-y">
        {list.map((t) => {
          const project = t.project ? projectByIri[t.project] : null;
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
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {project ? (
                      <span className="truncate">{project.name}</span>
                    ) : (
                      <span className="italic">Privat</span>
                    )}
                    {t.dueOn ? (
                      <span
                        className={cn(
                          'inline-flex items-center gap-0.5',
                          tab === 'overdue' && 'text-destructive',
                        )}
                      >
                        <CalendarDays className="size-3" />
                        {new Date(t.dueOn).toLocaleDateString()}
                      </span>
                    ) : null}
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
    );

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListTodo className="size-4 text-muted-foreground" /> Meine Aufgaben
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[calc(100%-3rem)] overflow-y-auto px-2 pb-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="widget-no-drag">
          <TabsList className="w-full">
            <TabsTrigger value="today" className="flex-1 gap-1">
              Heute
              {buckets.today.length > 0 ? (
                <span className="rounded-full bg-background/70 px-1 text-[10px]">
                  {buckets.today.length}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="week" className="flex-1 gap-1">
              Woche
              {buckets.week.length > 0 ? (
                <span className="rounded-full bg-background/70 px-1 text-[10px]">
                  {buckets.week.length}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="overdue" className="flex-1 gap-1">
              Überfällig
              {buckets.overdue.length > 0 ? (
                <span className="rounded-full bg-destructive/20 px-1 text-[10px] text-destructive">
                  {buckets.overdue.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="today" className="pt-2">
            {renderList(buckets.today)}
          </TabsContent>
          <TabsContent value="week" className="pt-2">
            {renderList(buckets.week)}
          </TabsContent>
          <TabsContent value="overdue" className="pt-2">
            {renderList(buckets.overdue)}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
