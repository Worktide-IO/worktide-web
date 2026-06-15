import { useGetIdentity, useList } from '@refinedev/core';
import { Clock, Pause, Play } from 'lucide-react';
import { useMemo } from 'react';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TimeEntryJsonld } from '@/api/types/timeEntry/Jsonld';
import {
  formatElapsed,
  useActiveTimer,
  useTick,
} from '@/hooks/useActiveTimer';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type Identity = { id?: string };

/**
 * Dashboard widget — bigger, stationary cousin of the FloatingTimer.
 *
 * Top row: state (running/idle).
 * Middle: big H:MM:SS clock when running, "Timer starten" CTA when idle.
 * Bottom: today's total minutes booked, summed from the current user's
 *         TimeEntries with startsAt within today.
 *
 * Start-from-widget posts a no-context timer (Freie Zeit). For
 * project/task specificity the user opens the FloatingTimer's
 * popover via its bottom-right button — keeping this widget short and
 * single-purpose.
 */
export function ActiveTimerWidget() {
  const { timer, start, stop, isLoading } = useActiveTimer();
  useTick();
  const { data: identity } = useGetIdentity<Identity>();
  const userIri = identity?.id ? `/v1/users/${identity.id}` : null;

  // Today's TimeEntries for the current user — only fetched once we know
  // the user IRI. Used for the "X h Y min heute" badge.
  const todayIso = new Date().toISOString().slice(0, 10);
  const { result: today } = useList<Row<TimeEntryJsonld>>({
    resource: 'time_entries',
    pagination: { mode: 'off' },
    filters: userIri
      ? [
          { field: 'user', operator: 'eq', value: userIri },
          { field: 'startsAt[after]', operator: 'eq', value: todayIso },
        ]
      : [],
    queryOptions: { enabled: Boolean(userIri) },
  });
  useLiveResource('time_entries');

  const todayMinutes = useMemo(
    () => (today?.data ?? []).reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0),
    [today],
  );

  const projectId = timer?.projectId;
  const { result: project } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
    queryOptions: { enabled: Boolean(projectId) },
  });
  const projectName = useMemo(() => {
    if (!projectId) return null;
    return (project?.data ?? []).find((p) => p.id === projectId)?.name ?? null;
  }, [project, projectId]);

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4 text-muted-foreground" /> Zeiterfassung
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-32" />
        </CardContent>
      </Card>
    );
  }

  const elapsedSeconds = timer
    ? Math.max(0, Math.round((Date.now() - new Date(timer.startedAt).getTime()) / 1000))
    : 0;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="size-4 text-muted-foreground" />
          Zeiterfassung
          {timer ? (
            <Badge variant="secondary" className="ml-auto gap-1 text-[10px]">
              <span
                className="size-1.5 animate-pulse rounded-full bg-green-500"
                aria-hidden
              />
              läuft
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex h-[calc(100%-3rem)] flex-col items-center justify-center gap-3 pb-6 text-center">
        {timer ? (
          <>
            <div className="font-mono text-3xl font-medium tabular-nums">
              {formatElapsed(elapsedSeconds)}
            </div>
            <p className="line-clamp-2 max-w-full text-xs text-muted-foreground">
              {projectName ?? timer.description ?? 'Freie Zeit'}
            </p>
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={() => void stop()}
              className="widget-no-drag"
            >
              <Pause className="size-3.5" /> Stoppen
            </Button>
          </>
        ) : (
          <>
            <div className="font-mono text-3xl font-medium tabular-nums text-muted-foreground/50">
              0:00:00
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void start({})}
              className="widget-no-drag"
            >
              <Play className="size-3.5 fill-current" /> Timer starten
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Für Projekt-/Task-Wahl: Floating-Button unten rechts
            </p>
          </>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Heute: <span className="font-mono tabular-nums">{formatMinutes(todayMinutes)}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
