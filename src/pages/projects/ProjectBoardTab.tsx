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
import { useList, useOne, useUpdate } from '@refinedev/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Ban, Flag, ListTree, SlidersHorizontal } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { BoardConfigDialog } from '@/components/BoardConfigDialog';
import { Button } from '@/components/ui/button';

import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { TaskDependencyJsonld } from '@/api/types/taskDependency/Jsonld';
import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import type { WorkspaceJsonld } from '@/api/types/workspace/Jsonld';
import { readAuth, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { resolveBoardColumns, type BoardColumnConfig, type ResolvedColumn } from '@/lib/boardColumns';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TagChips } from '@/components/TagChips';
import { EntitySyncBadgeStack } from '@/components/EntitySyncBadgeStack';
import { TrackerChip } from '@/components/TrackerChip';
import { VersionBadge } from '@/components/VersionBadge';
import { useProjectVersions } from '@/hooks/useProjectVersions';
import { useTrackers } from '@/hooks/useTrackers';
import { useWorkflowTransitions } from '@/hooks/useWorkflowTransitions';
import { TaskDetailSheet } from '@/components/TaskDetailSheet';
import { UserAvatarStack } from '@/components/UserAvatarStack';

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

  // Subtask counts + "is blocked" lookup powered by the dependency
  // table. We pull dependencies once per project — cheap because they
  // stay rare per board.
  const { result: dependencies } = useList<Row<TaskDependencyJsonld>>({
    resource: 'task_dependencies',
    pagination: { mode: 'off' },
    queryOptions: { enabled: Boolean(projectIri) },
  });

  // Pre-check workflow rules client-side so a forbidden DnD shows a
  // useful toast instead of silently snapping back after a 403.
  const { allowedToStatuses } = useWorkflowTransitions();

  // Board-column config lives in the workspace settings (grouping several
  // statuses into one named column, each with a "primary" drop-target status).
  // Absent → one column per status (original behaviour).
  const wsId = readAuth(WORKSPACE_STORAGE_KEY);
  const { result: workspace } = useOne<Row<WorkspaceJsonld> & { settings?: Record<string, unknown> | null }>({
    resource: 'workspaces',
    id: wsId ?? '',
    queryOptions: { enabled: Boolean(wsId) },
  });
  const boardConfig =
    (workspace?.settings as { boardColumns?: BoardColumnConfig[] } | null | undefined)?.boardColumns ?? null;

  const columns = useMemo(
    () => resolveBoardColumns(statuses?.data ?? [], boardConfig),
    [statuses, boardConfig],
  );

  const subtaskCountByParent = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tasks?.data ?? []) {
      if (t.parent) m[t.parent] = (m[t.parent] ?? 0) + 1;
    }
    return m;
  }, [tasks]);

  const blockedTaskIris = useMemo(() => {
    const open = new Set<string>();
    const openStatusIris = new Set<string>();
    for (const s of statuses?.data ?? []) {
      const done = (s as { completed?: boolean }).completed ?? s.isCompleted ?? false;
      if (!done && s['@id']) openStatusIris.add(s['@id']);
    }
    const taskByIri = new Map<string, Row<TaskJsonld>>();
    for (const t of tasks?.data ?? []) {
      if (t['@id']) taskByIri.set(t['@id'], t);
    }
    // Blocking-style relations stop the successor from moving forward
    // while the predecessor is still in an open status. The set lives
    // in BLOCKING_TYPES so the UI stays in sync with the backend's
    // TaskDependencyType::isBlocking() — see that PHP file for why
    // these three count and the others don't.
    const BLOCKING_TYPES = new Set(['finish_to_start', 'blocks', 'precedes']);
    for (const d of dependencies?.data ?? []) {
      if (!d.type || !BLOCKING_TYPES.has(d.type)) continue;
      const pred = d.predecessor ? taskByIri.get(d.predecessor) : null;
      if (!pred || !pred.status) continue;
      if (openStatusIris.has(pred.status) && d.successor) {
        open.add(d.successor);
      }
    }
    return open;
  }, [dependencies, statuses, tasks]);

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const { mutate: updateTask } = useUpdate<Row<TaskJsonld>>();

  const tasksByColumn = useMemo(() => {
    const statusToCol: Record<string, string> = {};
    for (const c of columns) for (const iri of c.statusIris) statusToCol[iri] = c.id;
    const map: Record<string, Row<TaskJsonld>[]> = {};
    for (const t of tasks?.data ?? []) {
      if (!t.status) continue;
      const colId = statusToCol[t.status];
      if (!colId) continue;
      (map[colId] ??= []).push(t);
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
  }, [tasks, columns]);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
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
    const colId = e.over?.id ? String(e.over.id) : null;
    if (!colId) return;
    const column = columns.find((c) => c.id === colId);
    if (!column) return;

    const task = (tasks?.data ?? []).find((t) => t['@id'] === taskIri);
    if (!task || !task.id) return;
    // Already in this column (its current status belongs to the group) → no-op.
    if (task.status && column.statusIris.has(task.status)) return;

    // Dropping onto a (possibly grouped) column moves the task to that column's
    // primary status.
    const newStatusIri = column.primaryStatusIri;

    // Pre-check the workflow gate so we can show a useful "this move
    // isn't part of the workflow" toast instead of the bare 403 the
    // backend would throw. Role-based 403s still surface from the
    // server because the SPA does NOT replicate role-filtering.
    const allowed = allowedToStatuses(task.tracker ?? null, task.status ?? null);
    if (allowed && !allowed.has(newStatusIri)) {
      toast.error(
        `Statuswechsel nicht im Workflow erlaubt — siehe Workspace-Einstellungen → Workflows.`,
      );
      return;
    }

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

  if (columns.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-12">
        Keine Task-Status definiert.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
          <SlidersHorizontal className="size-4" /> Board konfigurieren
        </Button>
      </div>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {columns.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              tasks={tasksByColumn[column.id] ?? []}
              subtaskCountByParent={subtaskCountByParent}
              blockedTaskIris={blockedTaskIris}
              onOpenTask={(iri) => setOpenTaskId(iri)}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? <TaskCard task={activeTask} dragging /> : null}
        </DragOverlay>
        <TaskDetailSheet
          taskId={openTaskId?.split('/').pop() ?? null}
          onOpenChange={(o) => !o && setOpenTaskId(null)}
        />
      </DndContext>
      {configOpen && wsId ? (
        <BoardConfigDialog
          open
          onOpenChange={setConfigOpen}
          workspaceId={wsId}
          settings={(workspace?.settings as Record<string, unknown> | null | undefined) ?? null}
          columns={boardConfig}
          statuses={statuses?.data ?? []}
        />
      ) : null}
    </div>
  );
}

function BoardColumn({
  column,
  tasks,
  subtaskCountByParent,
  blockedTaskIris,
  onOpenTask,
}: {
  column: ResolvedColumn;
  tasks: Row<TaskJsonld>[];
  subtaskCountByParent: Record<string, number>;
  blockedTaskIris: Set<string>;
  onOpenTask: (iri: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Virtualize the card list so a column with hundreds of tasks (e.g. "Done")
  // only mounts the visible rows. The scroll element is bounded in height, so
  // short columns render fully (no windowing) and tall ones window on scroll.
  // Cards are drag SOURCES only (the column is the drop target), so cards that
  // scroll out of view can safely unmount without breaking drag & drop.
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96,
    overscan: 8,
    getItemKey: (index) => tasks[index]['@id'] ?? index,
  });
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex max-h-[calc(100vh-14rem)] w-72 shrink-0 flex-col rounded-lg border bg-muted/30 p-3 transition-colors',
        isOver && 'border-primary bg-primary/5',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ backgroundColor: column.color }}
          />
          <h3 className="text-sm font-medium">{column.name}</h3>
        </div>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground/70 py-6">Keine Aufgaben</p>
      ) : (
        <div ref={scrollRef} className="-mr-1 flex-1 overflow-y-auto pr-1">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualItems.map((vi) => {
              const t = tasks[vi.index];
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full pb-2"
                  style={{ transform: `translateY(${vi.start}px)` }}
                >
                  <TaskCard
                    task={t}
                    subtaskCount={t['@id'] ? subtaskCountByParent[t['@id']] ?? 0 : 0}
                    isBlocked={t['@id'] ? blockedTaskIris.has(t['@id']) : false}
                    onOpen={() => t['@id'] && onOpenTask(t['@id'])}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  dragging = false,
  subtaskCount = 0,
  isBlocked = false,
  onOpen,
}: {
  task: Row<TaskJsonld>;
  dragging?: boolean;
  subtaskCount?: number;
  isBlocked?: boolean;
  onOpen?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task['@id'] ?? '',
    disabled: dragging,
  });
  const { byIri: trackerByIri } = useTrackers();
  const { byIri: versionByIri } = useProjectVersions(task.project ?? null);

  return (
    <Card
      ref={dragging ? undefined : setNodeRef}
      {...(dragging ? {} : attributes)}
      {...(dragging ? {} : listeners)}
      onClick={(e) => {
        // dnd-kit fires PointerDown→Move on drag-start; a plain click
        // (no drag) is what we want to convert into an open-action.
        if (dragging || isDragging) return;
        e.stopPropagation();
        onOpen?.();
      }}
      className={cn(
        'cursor-pointer select-none border bg-background py-2 shadow-sm transition',
        isDragging && !dragging && 'opacity-30',
        dragging && 'shadow-lg ring-2 ring-primary/30',
        isBlocked && 'ring-1 ring-orange-300 dark:ring-orange-700',
      )}
    >
      <CardContent className="space-y-1.5 px-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <TrackerChip tracker={task.tracker ? trackerByIri[task.tracker] : null} variant="icon" />
            <span className="font-mono text-[10px] text-muted-foreground">{task.identifier}</span>
            <EntitySyncBadgeStack entityId={task.id} variant="compact" />
          </div>
          <div className="flex items-center gap-1.5">
            {isBlocked ? (
              <Ban
                className="size-3 text-orange-500"
                aria-label="Blockiert durch andere Aufgabe"
              />
            ) : null}
            {subtaskCount > 0 ? (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
                aria-label={`${subtaskCount} Subtasks`}
              >
                <ListTree className="size-3" />
                {subtaskCount}
              </span>
            ) : null}
            {task.isPrio ? (
              <Flag className="size-3 text-orange-500" aria-label="Priorisiert" />
            ) : null}
          </div>
        </div>
        <p className="text-sm font-medium leading-snug">{task.title}</p>
        {task.tags && task.tags.length > 0 ? (
          <TagChips iris={task.tags} size="sm" max={4} />
        ) : null}
        {task.fixedVersion ? (
          <VersionBadge version={versionByIri[task.fixedVersion] ?? null} />
        ) : null}
        <div className="flex items-center justify-between gap-2 pt-0.5">
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
          <UserAvatarStack iris={task.assignees} size="sm" max={3} />
        </div>
      </CardContent>
    </Card>
  );
}
