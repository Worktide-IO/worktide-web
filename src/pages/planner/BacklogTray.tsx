import { Draggable } from '@fullcalendar/interaction';
import { intlLocale } from '@/lib/intl';
import { Calendar, Flag, GripVertical } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

/**
 * Side-tray of unscheduled tasks — every task with a non-closed
 * status and NO `startOn` set. The user drags an entry into the
 * calendar grid to schedule it; FullCalendar's interaction plugin
 * picks the drop up and fires our `drop` handler on the parent.
 *
 * Setup is two parts:
 *   1. Each `.fc-tray-item` carries `data-event` with a JSON shape
 *      FullCalendar interprets as an EventInput.
 *   2. `new Draggable(containerEl)` registers the tray with
 *      FullCalendar's drag manager so drops are coordinated.
 *
 * Tasks are filtered by the same activeProjectIris the grid uses so
 * the tray stays consistent with the calendar.
 */
export function BacklogTray({
  tasks,
  projects,
  activeProjectIris,
  onDropConfigured,
}: {
  tasks: Row<TaskJsonld>[];
  projects: Row<ProjectJsonld>[];
  activeProjectIris: string[] | null;
  onDropConfigured?: () => void;
}) {
  const trayRef = useRef<HTMLDivElement | null>(null);

  const projectByIri = useMemo(() => {
    const m: Record<string, Row<ProjectJsonld>> = {};
    for (const p of projects) if (p['@id']) m[p['@id']] = p;
    return m;
  }, [projects]);

  // Unscheduled = no startOn, not closed. closedOn comes back as
  // either undefined or a date string when the API serialises the
  // task — both branches keep the item in the tray.
  const unscheduled = useMemo(() => {
    return tasks.filter((t) => {
      if (t.startOn) return false;
      if ((t as unknown as { closedOn?: string | null }).closedOn) return false;
      if (activeProjectIris !== null && t.project && !activeProjectIris.includes(t.project)) {
        return false;
      }
      return true;
    });
  }, [tasks, activeProjectIris]);

  // Wire FullCalendar Draggable once the tray container exists.
  useEffect(() => {
    if (!trayRef.current) return;
    const draggable = new Draggable(trayRef.current, {
      itemSelector: '.fc-tray-item',
      eventData: (el) => {
        const raw = el.getAttribute('data-event');
        if (!raw) return {};
        try {
          return JSON.parse(raw);
        } catch {
          return {};
        }
      },
    });
    onDropConfigured?.();
    return () => {
      draggable.destroy();
    };
  }, [onDropConfigured, unscheduled.length]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Calendar className="size-4 text-muted-foreground" />
            Ungeplant
          </span>
          <span className="text-xs text-muted-foreground">{unscheduled.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 p-3 pt-0" ref={trayRef}>
        {unscheduled.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Keine ungeplanten Aufgaben.
          </p>
        ) : (
          unscheduled.map((t) => {
            const project = t.project ? projectByIri[t.project] : null;
            const colour = project?.color ?? '#94a3b8';
            const minutes = t.estimatedMinutes ?? 30;
            const durMs = minutes * 60_000;
            return (
              <div
                key={t['@id']}
                className={cn(
                  'fc-tray-item group flex cursor-grab items-start gap-1.5 rounded-md border bg-background p-1.5 text-xs',
                  'hover:border-primary/40 hover:shadow-sm active:cursor-grabbing',
                )}
                data-event={JSON.stringify({
                  id: t['@id'] ?? '',
                  title: t.title ?? '(no title)',
                  duration: { milliseconds: durMs },
                  backgroundColor: colour,
                  borderColor: colour,
                  extendedProps: { task: t, fromBacklog: true },
                })}
              >
                <GripVertical className="mt-0.5 size-3 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span
                      className="block size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: colour }}
                    />
                    <span className="truncate font-medium">{t.title}</span>
                    {t.isPrio ? <Flag className="size-3 shrink-0 text-orange-500" /> : null}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="font-mono">{t.identifier}</span>
                    {minutes ? <span>· {minutes} min</span> : null}
                    {t.dueOn ? (
                      <span>· {new Date(t.dueOn).toLocaleDateString(intlLocale())}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
