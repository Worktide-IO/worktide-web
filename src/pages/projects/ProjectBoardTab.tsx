import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useList, useUpdate } from '@refinedev/core';
import { Flag } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const PRIORITY_VARIANT: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  low: 'outline',
  normal: 'secondary',
  high: 'default',
  urgent: 'destructive',
};

const PRIORITY_LABEL: Record<string, string> = {
  low: 'Niedrig',
  normal: 'Normal',
  high: 'Hoch',
  urgent: 'Dringend',
};

type Props = {
  projectIri: string;
};

/**
 * Kanban-style board: one column per TaskStatus (workspace-scoped, ordered
 * by `position`), each column lists the project's tasks whose `status` IRI
 * matches the column.
 *
 * DnD: dropping a card on a different column issues a PATCH on the task
 * with the new status IRI. Refine's optimistic update keeps the card in
 * the new column instantly; the Mercure echo from the backend re-syncs
 * any other tabs.
 */
export function ProjectBoardTab({ projectIri }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Statuses are workspace-scoped and small — pull them all in one go.
  const { result: statuses, query: statusesQuery } = useList<Row<TaskStatusJsonld>>({
    resource: 'task_statuses',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });

  // All tasks of this project. With pagination off we get them in one shot;
  // even a busy project rarely has more than a few hundred tasks.
  const { result: tasks, query: tasksQuery } = useList<Row<TaskJsonld>>({
    resource: 'tasks',
    pagination: { mode: 'off' },
    filters: [{ field: 'project', operator: 'eq', value: projectIri }],
    queryOptions: { enabled: Boolean(projectIri) },
  });

  // Live updates on either tasks or statuses re-render the board.
  useLiveResource('tasks');
  useLiveResource('task_statuses');

  const { mutate: updateTask } = useUpdate<Row<TaskJsonld>>();

  const tasksByStatus = useMemo(() => {
    const map: Record<string, Row<TaskJsonld>[]> = {};
    for (const t of tasks?.data ?? []) {
      if (!t.status) continue;
      (map[t.status] ??= []).push(t);
    }
    // Stable per-column ordering: position then identifier.
    for (const list of Object.values(map)) {
      list.sort((a, b) => {
        const pa = a.position ?? 0;
        const pb = b.position ?? 0;
        if (pa !== pb) return pa - pb;
        return (a.identifier ?? '').localeCompare(b.identifier ?? '');
      });
    }
    return map;
  }, [tasks]);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const activeTask = useMemo(
    () => (tasks?.data ?? []).find((t) => t['@id'] === activeTaskId) ?? null,
    [tasks, activeTaskId],
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveTaskId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveTaskId(null);
    const taskIri = String(e.active.id);
    const newStatusIri = e.over?.id ? String(e.over.id) : null;
    if (!newStatusIri) return;

    const task = (tasks?.data ?? []).find((t) => t['@id'] === taskIri);
    if (!task || !task.id || task.status === newStatusIri) return;

    updateTask({
      resource: 'tasks',
      id: task.id,
      values: { status: newStatusIri },
      successNotification: false,
    });
  }

  const isLoading = statusesQuery.isLoading || tasksQuery.isLoading;

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-72 shrink-0 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    );
  }

  const cols = statuses?.data ?? [];
  if (cols.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-12">
        Keine Task-Status definiert.
      </p>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {cols.map((status) => (
          <BoardColumn
            key={status['@id']}
            status={status}
            tasks={tasksByStatus[status['@id'] ?? ''] ?? []}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumn({
  status,
  tasks,
}: {
  status: Row<TaskStatusJsonld>;
  tasks: Row<TaskJsonld>[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status['@id'] ?? '' });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'w-72 shrink-0 rounded-lg border bg-muted/30 p-3 transition-colors',
        isOver && 'border-primary bg-primary/5',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ backgroundColor: status.color ?? '#94a3b8' }}
          />
          <h3 className="text-sm font-medium">{status.name}</h3>
        </div>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground/70 py-6">
            Keine Aufgaben
          </p>
        ) : (
          tasks.map((t) => <TaskCard key={t['@id']} task={t} />)
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, dragging = false }: { task: Row<TaskJsonld>; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task['@id'] ?? '',
    disabled: dragging,
  });

  return (
    <Card
      ref={dragging ? undefined : setNodeRef}
      {...(dragging ? {} : attributes)}
      {...(dragging ? {} : listeners)}
      className={cn(
        'cursor-grab select-none border bg-background py-2 shadow-sm transition',
        isDragging && !dragging && 'opacity-30',
        dragging && 'shadow-lg ring-2 ring-primary/30',
      )}
    >
      <CardContent className="space-y-1.5 px-3">
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">{task.identifier}</span>
          {task.isPrio ? (
            <Flag className="size-3 text-orange-500" aria-label="Priorisiert" />
          ) : null}
        </div>
        <p className="text-sm font-medium leading-snug">{task.title}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {task.priority ? (
            <Badge
              variant={PRIORITY_VARIANT[task.priority] ?? 'outline'}
              className="text-[10px]"
            >
              {PRIORITY_LABEL[task.priority] ?? task.priority}
            </Badge>
          ) : null}
          {task.dueOn ? (
            <span className="text-[10px] text-muted-foreground">
              {new Date(task.dueOn).toLocaleDateString()}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
