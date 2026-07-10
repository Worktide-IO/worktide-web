import { useGetIdentity, useList } from '@refinedev/core';
import type { EventClickArg, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { CalendarDays, Wifi, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import './calendar.css';

type Identity = { id?: string };
type Filter = 'all' | 'mine' | 'customers';
type BookingRow = Row<{ '@id': string; id?: string; startAt: string; endAt: string; inviteeName: string; status: string }>;

/**
 * Calendar view at `/calendar`.
 *
 * Renders every Task with a `dueOn` as a one-day event coloured by its
 * project. Three filters via tabs:
 *   - Alle      every task in the workspace
 *   - Meine     tasks where the current user is in `assignees`
 *   - Kunden    tasks whose project has a customer FK
 *
 * Click on an event navigates to the project's board tab — that's where
 * the user lives anyway for any deeper context. The board view will scroll
 * to the right column automatically once we wire the deep-link later.
 *
 * Locale + first-day-of-week are hard-coded to de-DE / Monday for now
 * (matches the seed workspace). A future iteration takes those from
 * `Workspace.locale` / `Workspace.timezone`.
 */
export function CalendarPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const { data: identity } = useGetIdentity<Identity>();
  const userIri = identity?.id ? `/v1/users/${identity.id}` : null;

  const { result: tasks } = useList<Row<TaskJsonld>>({
    resource: 'tasks',
    pagination: { mode: 'off' },
  });
  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
  });
  const { result: bookings } = useList<BookingRow>({
    resource: 'bookings',
    pagination: { mode: 'off' },
  });
  const { connected } = useLiveResource('tasks');

  const projectByIri = useMemo(() => {
    const map: Record<string, Row<ProjectJsonld>> = {};
    for (const p of projects?.data ?? []) {
      if (p['@id']) map[p['@id']] = p;
    }
    return map;
  }, [projects]);

  const filteredTasks = useMemo(() => {
    return (tasks?.data ?? []).filter((t) => {
      if (!t.dueOn) return false;
      switch (filter) {
        case 'mine':
          return userIri ? (t.assignees ?? []).includes(userIri) : false;
        case 'customers': {
          const project = t.project ? projectByIri[t.project] : null;
          return Boolean(project?.customer);
        }
        case 'all':
        default:
          return true;
      }
    });
  }, [tasks, filter, userIri, projectByIri]);

  const events = useMemo<EventInput[]>(() => {
    return filteredTasks.map((t) => {
      const project = t.project ? projectByIri[t.project] : null;
      return {
        id: t['@id'] ?? '',
        title: `${t.identifier ?? '?'} · ${t.title ?? ''}`,
        start: t.dueOn ?? undefined,
        allDay: true,
        backgroundColor: project?.color ?? '#6366f1',
        borderColor: project?.color ?? '#6366f1',
        extendedProps: {
          projectId: project?.id ?? null,
          taskId: t.id ?? null,
        },
      };
    });
  }, [filteredTasks, projectByIri]);

  // Confirmed bookings as timed events (always shown, brand-coloured).
  const bookingEvents = useMemo<EventInput[]>(() => {
    return (bookings?.data ?? [])
      .filter((b) => b.status !== 'cancelled')
      .map((b) => ({
        id: b['@id'] ?? '',
        title: `📅 ${b.inviteeName}`,
        start: b.startAt,
        end: b.endAt,
        backgroundColor: '#0F8C72',
        borderColor: '#0F8C72',
        extendedProps: { type: 'booking' },
      }));
  }, [bookings]);

  const allEvents = useMemo<EventInput[]>(() => [...events, ...bookingEvents], [events, bookingEvents]);

  const handleClick = (arg: EventClickArg) => {
    if (arg.event.extendedProps.type === 'booking') {
      navigate('/buchungen');
      return;
    }
    const projectId = arg.event.extendedProps.projectId as string | null;
    if (projectId) {
      navigate(`/projects/${projectId}?tab=board`);
    } else {
      navigate('/tasks');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl">Kalender</h2>
            {connected ? (
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
            {events.length} Tasks · {bookingEvents.length} Termine
          </p>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">Alle</TabsTrigger>
            <TabsTrigger value="mine">Meine</TabsTrigger>
            <TabsTrigger value="customers">Kunden</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4 text-muted-foreground" />
            {labelFor(filter)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="worktide-calendar">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              locale="de"
              firstDay={1}
              height="auto"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay',
              }}
              buttonText={{
                today: 'Heute',
                month: 'Monat',
                week: 'Woche',
                day: 'Tag',
              }}
              events={allEvents}
              eventClick={handleClick}
              dayMaxEventRows={4}
              weekNumbers
              weekNumberFormat={{ week: 'short' }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function labelFor(f: Filter): string {
  switch (f) {
    case 'mine':
      return 'Mir zugewiesene Aufgaben';
    case 'customers':
      return 'Aufgaben in Kunden-Projekten';
    case 'all':
    default:
      return 'Alle Aufgaben mit Fälligkeitsdatum';
  }
}
