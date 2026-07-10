import { CalendarDays, ListTodo } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { topicFor, useMercureTopic } from '@/lib/mercure';
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

/** One row from GET /v1/dashboard/my-tasks — the project + open-flag are inlined. */
type MyTask = {
  '@id': string;
  id: string;
  identifier: string;
  title: string;
  priority?: string;
  dueOn: string | null;
  status: string;
  isOpen: boolean;
  project: { '@id': string; id: string; name: string; color: string } | null;
};

const MY_TASKS_KEY = ['dashboard', 'my-tasks'] as const;

/**
 * "Meine Aufgaben" — tasks the current user is an assignee on, bucketed by
 * due-date relative to today:
 *
 *   Heute      dueOn === heute (+ open no-due) → roter Badge
 *   Diese Wo.  dueOn ∈ [heute, +6]
 *   Überfäll.  dueOn < heute UND status nicht completed
 *
 * Data comes from the dedicated /v1/dashboard/my-tasks read-model (server
 * filters to THIS user's open/due-soon tasks with the project inlined) instead
 * of fetching the whole tasks/projects/statuses collections and filtering
 * client-side. Bucketing stays client-side so it uses the browser's timezone.
 */
type TabKey = 'today' | 'week' | 'overdue';

export function MyTasksWidget() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('today');
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: MY_TASKS_KEY,
    queryFn: async () => {
      const { data } = await api.get<{ tasks: MyTask[]; capped: boolean }>('/dashboard/my-tasks');
      return data;
    },
  });
  // Live: refetch when any task changes (mirrors the old useLiveResource('tasks')).
  useMercureTopic(topicFor('tasks'), {
    onMessage: () => void queryClient.invalidateQueries({ queryKey: MY_TASKS_KEY }),
  });

  const mine = query.data?.tasks ?? [];

  // Bucket boundaries — local time, midnight-snapped so the filter survives
  // server-side UTC offsets in dueOn.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  const buckets = useMemo(() => {
    const todays: MyTask[] = [];
    const weeks: MyTask[] = [];
    const overdues: MyTask[] = [];
    for (const t of mine) {
      const isOpen = t.isOpen;
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
  }, [mine, today, tomorrow, weekEnd]);

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

  const renderList = (list: MyTask[]) =>
    list.length === 0 ? (
      <p className="text-center text-xs text-muted-foreground py-8">
        Nichts hier — gönn dir 'nen Kaffee.
      </p>
    ) : (
      <ul className="divide-y">
        {list.map((t) => {
          const project = t.project;
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
