import { useInvalidate, useList } from '@refinedev/core';
import type { EventChangeArg, EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import { CalendarRange, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { UserJsonld } from '@/api/types/user/Jsonld';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLiveResource } from '@/lib/mercure';
import { api } from '@/lib/api';
import type { Row } from '@/lib/refine';

import { PlannerSidebar } from './PlannerSidebar';

import '../calendar/calendar.css';

type View = 'resourceTimeGridDay' | 'resourceTimeGridWeek';

/**
 * Team-Planner at `/planner` — awork-style multi-user calendar.
 *
 * Columns are workspace users, rows are time-of-day slots. Tasks
 * with `startOn` + `scheduledEnd` render as drag/resize-able blocks
 * inside the assigned user's column. Drop a task into another time
 * slot to reschedule; drop into another user's column to reassign
 * (V2 — V1 only allows in-column moves).
 *
 * The page reads three lists: users (workspace members), projects
 * (for filter sidebar + event colour), and tasks (scheduled +
 * unscheduled). Live updates via Mercure on `tasks` so a colleague's
 * drag shows up immediately.
 *
 * The toolbar is intentionally hand-rolled — FullCalendar's
 * built-in header doesn't render the KW-counter that the awork-style
 * design calls for, and a custom toolbar lets us keep "Heute" + the
 * view-switcher visually consistent with the rest of the SPA.
 */
export function TeamPlannerPage() {
  const invalidate = useInvalidate();
  const calRef = useRef<FullCalendar | null>(null);

  const [view, setView] = useState<View>('resourceTimeGridWeek');
  const [periodLabel, setPeriodLabel] = useState('');
  const [activeUserIris, setActiveUserIris] = useState<string[]>([]);
  const [activeProjectIris, setActiveProjectIris] = useState<string[] | null>(null);

  useLiveResource('tasks');

  const { result: users } = useList<Row<UserJsonld>>({
    resource: 'users',
    pagination: { mode: 'off' },
  });
  const { result: tasks } = useList<Row<TaskJsonld>>({
    resource: 'tasks',
    pagination: { mode: 'off' },
  });
  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
  });

  const projectByIri = useMemo(() => {
    const m: Record<string, Row<ProjectJsonld>> = {};
    for (const p of projects?.data ?? []) if (p['@id']) m[p['@id']] = p;
    return m;
  }, [projects]);

  // Resources = workspace users. Initially all are visible; the
  // avatar-picker in the sidebar toggles individuals.
  const allResources = useMemo(
    () =>
      (users?.data ?? []).map((u) => ({
        id: u['@id'] ?? '',
        title: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'Unbekannt',
        extendedProps: { user: u },
      })),
    [users],
  );

  const visibleResources = useMemo(() => {
    if (activeUserIris.length === 0) return allResources;
    return allResources.filter((r) => activeUserIris.includes(r.id));
  }, [allResources, activeUserIris]);

  // Events = scheduled tasks. A task qualifies when it has `startOn`
  // AND a way to derive an end (`scheduledEnd` or `estimatedMinutes`).
  const events = useMemo<EventInput[]>(() => {
    const out: EventInput[] = [];
    for (const t of tasks?.data ?? []) {
      if (!t.startOn) continue;
      if (activeProjectIris !== null && t.project && !activeProjectIris.includes(t.project)) {
        continue;
      }
      const start = new Date(t.startOn);
      let end: Date;
      if (t.scheduledEnd) {
        end = new Date(t.scheduledEnd);
      } else if (t.estimatedMinutes) {
        end = new Date(start.getTime() + t.estimatedMinutes * 60_000);
      } else {
        end = new Date(start.getTime() + 30 * 60_000); // 30-min fallback
      }
      // Pick the FIRST assignee user as resourceId. Multi-assignee
      // tasks render in the primary assignee's column; the others
      // see it as a marker once we wire mirror-events later.
      const primaryAssignee = (t.assignees ?? [])[0];
      if (!primaryAssignee) continue;
      const project = t.project ? projectByIri[t.project] : null;
      const colour = project?.color ?? '#6366f1';
      out.push({
        id: t['@id'] ?? '',
        resourceId: primaryAssignee,
        start,
        end,
        title: t.title ?? '(no title)',
        backgroundColor: colour,
        borderColor: colour,
        extendedProps: { task: t },
      });
    }
    return out;
  }, [tasks, projectByIri, activeProjectIris]);

  // FullCalendar's locale.weekText defaults to "W" — we want "KW".
  // Period label is custom so we can show KW + date-range together.
  const updatePeriodLabel = () => {
    const api = calRef.current?.getApi();
    if (!api) return;
    const v = api.view;
    if (view === 'resourceTimeGridDay') {
      setPeriodLabel(v.currentStart.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }));
    } else {
      const start = v.currentStart;
      const end = new Date(v.currentEnd.getTime() - 1);
      const week = weekOfYear(start);
      const startStr = start.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
      const endStr = end.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
      setPeriodLabel(`KW ${week} · ${startStr} – ${endStr}`);
    }
  };

  const setCalView = (next: View) => {
    setView(next);
    calRef.current?.getApi().changeView(next);
    setTimeout(updatePeriodLabel, 0);
  };

  const goPrev = () => { calRef.current?.getApi().prev(); setTimeout(updatePeriodLabel, 0); };
  const goNext = () => { calRef.current?.getApi().next(); setTimeout(updatePeriodLabel, 0); };
  const goToday = () => { calRef.current?.getApi().today(); setTimeout(updatePeriodLabel, 0); };

  const onEventChange = async (arg: EventChangeArg | EventDropArg) => {
    const taskIri = arg.event.id;
    if (!taskIri) return;
    const taskId = taskIri.split('/').pop();
    if (!taskId) return;
    const newStart = arg.event.start;
    const newEnd = arg.event.end;
    if (!newStart) {
      arg.revert();
      return;
    }
    // Detect resource (user) change for cross-column drops. V1: revert
    // and surface a toast — V2 will wire reassign through TaskAssignee.
    if ('newResource' in arg && arg.newResource && arg.oldResource && arg.newResource.id !== arg.oldResource.id) {
      arg.revert();
      toast.info('Cross-User-Drop folgt — V1 nur Slot-Verschieben in derselben Spalte.');
      return;
    }
    try {
      await api.patch(
        `/tasks/${taskId}`,
        {
          startOn: newStart.toISOString(),
          scheduledEnd: newEnd ? newEnd.toISOString() : null,
        },
        { headers: { 'Content-Type': 'application/merge-patch+json' } },
      );
      void invalidate({ resource: 'tasks', invalidates: ['list', 'detail'], id: taskId });
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Konnte Slot nicht speichern.');
      arg.revert();
    }
  };

  const onEventClick = (arg: EventClickArg) => {
    const task = arg.event.extendedProps.task as Row<TaskJsonld> | undefined;
    if (task?.identifier) {
      toast.info(`${task.identifier} — ${task.title}`);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-2xl flex items-center gap-2">
          <CalendarRange className="size-6 text-muted-foreground" />
          Planer
        </h2>
        <p className="text-sm text-muted-foreground">
          Team-Kalender — eine Spalte pro Mitarbeiter, Drag &amp; Drop ändert
          den Zeit-Slot.
        </p>
      </div>

      <div className="grid grid-cols-[260px_1fr] gap-3">
        <PlannerSidebar
          users={users?.data ?? []}
          projects={projects?.data ?? []}
          activeUserIris={activeUserIris}
          setActiveUserIris={setActiveUserIris}
          activeProjectIris={activeProjectIris}
          setActiveProjectIris={setActiveProjectIris}
        />

        <Card>
          <CardContent className="space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={goToday}>Heute</Button>
              <div className="flex">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={goPrev} aria-label="Zurück">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={goNext} aria-label="Weiter">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <span className="text-sm font-medium">{periodLabel}</span>
              <div className="ml-auto flex items-center gap-1.5">
                <Badge variant="outline" className="text-xs">
                  <Users className="mr-1 size-3" />
                  {visibleResources.length} / {allResources.length}
                </Badge>
                <Button
                  size="sm"
                  variant={view === 'resourceTimeGridDay' ? 'default' : 'outline'}
                  onClick={() => setCalView('resourceTimeGridDay')}
                >
                  Tag
                </Button>
                <Button
                  size="sm"
                  variant={view === 'resourceTimeGridWeek' ? 'default' : 'outline'}
                  onClick={() => setCalView('resourceTimeGridWeek')}
                >
                  Woche
                </Button>
              </div>
            </div>

            <FullCalendar
              ref={calRef}
              plugins={[resourceTimeGridPlugin, interactionPlugin]}
              schedulerLicenseKey="CC-Attribution-NonCommercial-NoDerivatives"
              initialView={view}
              headerToolbar={false}
              firstDay={1}
              locale="de"
              slotMinTime="07:00:00"
              slotMaxTime="20:00:00"
              nowIndicator
              editable
              eventResizableFromStart
              resources={visibleResources}
              events={events}
              eventClick={onEventClick}
              eventDrop={onEventChange}
              eventResize={onEventChange}
              datesSet={updatePeriodLabel}
              height="auto"
              expandRows
              allDaySlot={false}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * ISO 8601 week number — Monday-based, week 1 contains the first
 * Thursday of the year. Matches the German KW convention.
 */
function weekOfYear(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
