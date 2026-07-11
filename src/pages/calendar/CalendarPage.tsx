import { useGetIdentity, useList } from '@refinedev/core';
import type { EventClickArg, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { CalendarDays, Wifi, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import i18n from '@/i18n';
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
type ContactAbsenceRow = Row<{ '@id': string; contact: string; startsOn: string; endsOn: string }>;
type AbsenceContactRow = Row<{ '@id': string; firstName?: string; lastName?: string }>;

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
  const { t: translate } = useTranslation();
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
  const { result: contactAbsences } = useList<ContactAbsenceRow>({
    resource: 'contact_absences',
    pagination: { mode: 'off' },
  });
  const { result: absenceContacts } = useList<AbsenceContactRow>({
    resource: 'contacts',
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

  // Client (contact) absences as muted all-day spans (informational).
  const absenceContactsByIri = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of absenceContacts?.data ?? []) {
      if (c['@id']) map[c['@id']] = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
    }
    return map;
  }, [absenceContacts]);

  const absenceEvents = useMemo<EventInput[]>(() => {
    return (contactAbsences?.data ?? []).map((a) => {
      const endExclusive = new Date(a.endsOn);
      endExclusive.setDate(endExclusive.getDate() + 1);
      return {
        id: a['@id'] ?? '',
        title: translate('calendar.contact_absent', {
          name: absenceContactsByIri[a.contact] ?? translate('calendar.contact_fallback'),
        }),
        start: a.startsOn.slice(0, 10),
        end: endExclusive.toISOString().slice(0, 10),
        allDay: true,
        backgroundColor: '#94a3b8',
        borderColor: '#94a3b8',
        extendedProps: { type: 'contactAbsence' },
      };
    });
  }, [contactAbsences, absenceContactsByIri]);

  const allEvents = useMemo<EventInput[]>(
    () => [...events, ...bookingEvents, ...absenceEvents],
    [events, bookingEvents, absenceEvents],
  );

  const handleClick = (arg: EventClickArg) => {
    if (arg.event.extendedProps.type === 'booking') {
      navigate('/buchungen');
      return;
    }
    if (arg.event.extendedProps.type === 'contactAbsence') {
      navigate('/abwesenheiten');
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
            <h2 className="text-2xl">{translate('calendar.heading')}</h2>
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
            {translate('calendar.counts', {
              tasks: events.length,
              bookings: bookingEvents.length,
            })}
          </p>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">{translate('calendar.filter_all')}</TabsTrigger>
            <TabsTrigger value="mine">{translate('calendar.filter_mine')}</TabsTrigger>
            <TabsTrigger value="customers">{translate('calendar.filter_customers')}</TabsTrigger>
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
                today: translate('calendar.btn_today'),
                month: translate('calendar.btn_month'),
                week: translate('calendar.btn_week'),
                day: translate('calendar.btn_day'),
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
      return i18n.t('calendar.label_mine');
    case 'customers':
      return i18n.t('calendar.label_customers');
    case 'all':
    default:
      return i18n.t('calendar.label_all');
  }
}
