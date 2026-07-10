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
import { useGetIdentity, useInvalidate, useList, useOne, useUpdate } from '@refinedev/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Ban, ChevronsLeft, Clock, Flag, ListTree, Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { BoardConfigDialog } from '@/components/BoardConfigDialog';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import type { WorkspaceJsonld } from '@/api/types/workspace/Jsonld';
import { readAuth, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { resolveBoardColumns, type BoardColumnConfig, type ResolvedColumn } from '@/lib/boardColumns';
import { topicFor, useLiveResource, useMercureTopic } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TagChips } from '@/components/TagChips';
import { EntitySyncBadgeStack } from '@/components/EntitySyncBadgeStack';
import { PriorityScoreBadge, scoreEntryFromTask } from '@/components/PriorityScoreBadge';
import { TrackerChip } from '@/components/TrackerChip';
import { VersionBadge } from '@/components/VersionBadge';
import { useProjectVersions } from '@/hooks/useProjectVersions';
import { useTrackers } from '@/hooks/useTrackers';
import { useWorkflowTransitions } from '@/hooks/useWorkflowTransitions';
import { TaskDetailSheet } from '@/components/TaskDetailSheet';
import { UserAvatarStack } from '@/components/UserAvatarStack';
import { userDisplayName, useUserDirectory } from '@/hooks/useUserDirectory';

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

type SwimlaneDim = 'none' | 'assignee' | 'priority' | 'tracker';
const LANE_NONE = '__none__';
const LANE_SEP = '~~'; // joins laneKey + columnId into a droppable id

/** Per-user, per-project board quick-filter — persisted to localStorage. */
type BoardFilter = {
  q: string;
  mine: boolean;
  priority: string; // '' = any
  hideDone: boolean;
  swimlane: SwimlaneDim;
  collapsed: string[]; // collapsed column ids
};

const EMPTY_FILTER: BoardFilter = {
  q: '',
  mine: false,
  priority: '',
  hideDone: false,
  swimlane: 'none',
  collapsed: [],
};

const boardFilterKey = (projectIri: string) => `worktide.boardFilter.${projectIri}`;

/** Compact hours → "<1 h" / "N h" / "N.d d" for the flow-metrics strip. */
function fmtHoursShort(h: number | null | undefined): string {
  if (h == null) return '—';
  if (h < 1) return '<1 h';
  if (h < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

/** Stable per-column card ordering: manual position, then identifier. */
function sortTasks(list: Row<TaskJsonld>[]): Row<TaskJsonld>[] {
  return list.sort((a, b) => {
    const pa = a.position ?? 0;
    const pb = b.position ?? 0;
    if (pa !== pb) return pa - pb;
    return (a.identifier ?? '').localeCompare(b.identifier ?? '');
  });
}

function readBoardFilter(projectIri: string): BoardFilter {
  try {
    const raw = localStorage.getItem(boardFilterKey(projectIri));
    if (raw) return { ...EMPTY_FILTER, ...(JSON.parse(raw) as Partial<BoardFilter>) };
  } catch {
    /* ignore malformed storage */
  }
  return EMPTY_FILTER;
}

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

  // Blocked-task highlighting comes from a project-scoped read-model instead of
  // pulling EVERY workspace dependency: the server returns the successors whose
  // blocking predecessor in this project is still open. Refetched on live task /
  // status changes so a predecessor closing clears the block promptly.
  const projectId = projectIri.split('/').pop() ?? '';
  const queryClient = useQueryClient();
  const { data: blockedData } = useQuery({
    queryKey: ['board-blocked', projectId],
    queryFn: async () => {
      const { data } = await api.get<{ blocked: string[] }>('/dashboard/project-blocked', {
        params: { project: projectId },
      });
      return data;
    },
    enabled: Boolean(projectId),
  });
  const invalidateBlocked = () => void queryClient.invalidateQueries({ queryKey: ['board-blocked', projectId] });
  useMercureTopic(topicFor('tasks'), { onMessage: invalidateBlocked });
  useMercureTopic(topicFor('task_statuses'), { onMessage: invalidateBlocked });

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
  const boardSettings = workspace?.settings as
    | { boardColumns?: BoardColumnConfig[]; doneWindowDays?: number | null }
    | null
    | undefined;
  const boardConfig = boardSettings?.boardColumns ?? null;
  // Done columns only show tasks closed within this rolling window (0/undefined
  // shows all). Default keeps the board focused on recent completions.
  const doneWindowDays = boardSettings?.doneWindowDays ?? 30;

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

  // The blocking rule (predecessor in this project still open → successor
  // blocked, for TaskDependencyType::isBlocking() types) now runs server-side.
  const blockedTaskIris = useMemo(() => new Set(blockedData?.blocked ?? []), [blockedData]);

  // The open ticket lives in the URL (?task=<uuid>) so it's deep-linkable and
  // survives back/forward — no local state.
  const [searchParams, setSearchParams] = useSearchParams();
  const openTaskUuid = searchParams.get('task');
  const setOpenTask = (iri: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const uuid = iri ? iri.split('/').pop() : null;
      if (uuid) next.set('task', uuid);
      else next.delete('task');
      return next;
    });
  };

  const { mutate: updateTask } = useUpdate<Row<TaskJsonld>>();
  const invalidate = useInvalidate();

  const { data: identity } = useGetIdentity<{ id?: string }>();
  const myId = identity?.id ?? null;

  // Quick-filter, persisted per user + project. Filtering the fetched task
  // set client-side is cheap (a few hundred rows) and keeps the board snappy.
  const [filter, setFilterState] = useState<BoardFilter>(() => readBoardFilter(projectIri));
  const setFilter = (patch: Partial<BoardFilter>) =>
    setFilterState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(boardFilterKey(projectIri), JSON.stringify(next));
      } catch {
        /* ignore storage failures (private mode etc.) */
      }
      return next;
    });
  const toggleCollapse = (colId: string) =>
    setFilter({
      collapsed: filter.collapsed.includes(colId)
        ? filter.collapsed.filter((c) => c !== colId)
        : [...filter.collapsed, colId],
    });
  const filterActive =
    filter.q !== '' || filter.mine || filter.priority !== '' || filter.hideDone || filter.swimlane !== 'none';

  // Columns whose every status is "completed" — hidden when "Erledigte ausblenden".
  const doneColumnIds = useMemo(() => {
    const completed = new Set<string>();
    for (const s of statuses?.data ?? []) {
      const done = s.completed ?? s.isCompleted ?? false;
      if (done && s['@id']) completed.add(s['@id']);
    }
    const ids = new Set<string>();
    for (const c of columns) {
      if (c.statusIris.size > 0 && [...c.statusIris].every((iri) => completed.has(iri))) ids.add(c.id);
    }
    return ids;
  }, [statuses, columns]);

  // Tasks passing the quick-filter (shared by the column grouping and swimlanes).
  const filteredTasks = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    return (tasks?.data ?? []).filter((t) => {
      if (!t.status) return false;
      if (filter.priority && t.priority !== filter.priority) return false;
      if (filter.mine && myId && !(t.assignees ?? []).some((a) => a.endsWith(`/${myId}`))) return false;
      if (q && !`${t.title ?? ''} ${t.identifier ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, filter.q, filter.priority, filter.mine, myId]);

  const statusToCol = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of columns) for (const iri of c.statusIris) m[iri] = c.id;
    return m;
  }, [columns]);

  // Stable "now" for the whole board (aging + the done rolling window).
  const [boardNowMs] = useState(() => Date.now());
  const doneCutoffMs = doneWindowDays > 0 ? boardNowMs - doneWindowDays * 86_400_000 : null;

  const tasksByColumn = useMemo(() => {
    const byColumn: Record<string, Row<TaskJsonld>[]> = {};
    const hiddenOlder: Record<string, number> = {};
    for (const t of filteredTasks) {
      const colId = t.status ? statusToCol[t.status] : undefined;
      if (!colId) continue;
      // Done columns: keep only tasks closed within the rolling window; older
      // or undated completions are counted as hidden, not rendered.
      if (doneColumnIds.has(colId) && doneCutoffMs !== null) {
        const closed = t.closedOn ? Date.parse(t.closedOn) : Number.NaN;
        if (!(Number.isFinite(closed) && closed >= doneCutoffMs)) {
          hiddenOlder[colId] = (hiddenOlder[colId] ?? 0) + 1;
          continue;
        }
      }
      (byColumn[colId] ??= []).push(t);
    }
    for (const list of Object.values(byColumn)) sortTasks(list);
    return { byColumn, hiddenOlder };
  }, [filteredTasks, statusToCol, doneColumnIds, doneCutoffMs]);

  const { byIri: trackerByIri } = useTrackers();
  // Assignee-lane labels resolve through the shared user directory (keyed by
  // user IRI), which is already fetched once for avatars.
  const { byIri: userByIri } = useUserDirectory();

  // Swimlanes (rows) for the selected dimension; null when grouping is off.
  const swimlanes = useMemo(() => {
    const dim = filter.swimlane;
    if (dim === 'none') return null;
    const label = (key: string) => {
      if (key === LANE_NONE)
        return dim === 'assignee' ? 'Nicht zugewiesen' : dim === 'tracker' ? 'Kein Tracker' : 'Ohne Priorität';
      if (dim === 'priority') return PRIORITY_LABEL[key] ?? key;
      if (dim === 'tracker') return trackerByIri[key]?.name ?? 'Tracker';
      return userByIri[key] ? userDisplayName(userByIri[key]) : 'Benutzer';
    };
    const keyOf = (t: Row<TaskJsonld>) =>
      dim === 'assignee'
        ? t.assignees?.[0] ?? LANE_NONE
        : dim === 'priority'
          ? t.priority ?? LANE_NONE
          : t.tracker ?? LANE_NONE;

    const byLaneCol: Record<string, Record<string, Row<TaskJsonld>[]>> = {};
    const present = new Set<string>();
    for (const t of filteredTasks) {
      const colId = t.status ? statusToCol[t.status] : undefined;
      if (!colId) continue;
      if (doneColumnIds.has(colId) && doneCutoffMs !== null) {
        const closed = t.closedOn ? Date.parse(t.closedOn) : Number.NaN;
        if (!(Number.isFinite(closed) && closed >= doneCutoffMs)) continue; // outside done window
      }
      const lk = keyOf(t);
      present.add(lk);
      ((byLaneCol[lk] ??= {})[colId] ??= []).push(t);
    }
    for (const cols of Object.values(byLaneCol)) for (const list of Object.values(cols)) sortTasks(list);

    let keys: string[];
    if (dim === 'priority') {
      keys = (['urgent', 'high', 'normal', 'low'] as const).filter((p) => present.has(p));
      if (present.has(LANE_NONE)) keys.push(LANE_NONE);
    } else {
      keys = [...present].filter((k) => k !== LANE_NONE).sort((a, b) => label(a).localeCompare(label(b)));
      if (present.has(LANE_NONE)) keys.push(LANE_NONE);
    }
    const lanes = keys.map((key) => ({
      key,
      label: label(key),
      count: Object.values(byLaneCol[key] ?? {}).reduce((n, l) => n + l.length, 0),
    }));
    return { lanes, byLaneCol };
  }, [filter.swimlane, filteredTasks, statusToCol, userByIri, trackerByIri, doneColumnIds, doneCutoffMs]);

  const visibleColumns = columns.filter((c) => !(filter.hideDone && doneColumnIds.has(c.id)));

  // Flow-metrics strip. Computed over ALL project tasks (not the quick filter)
  // so the KPIs reflect real flow, not the current view. WIP = work that has
  // left the first (backlog) column but isn't done yet.
  const flowMetrics = useMemo(() => {
    const firstColId = columns[0]?.id;
    let wip = 0;
    let tp7 = 0;
    let tp30 = 0;
    let oldestOpenDays = 0;
    for (const t of tasks?.data ?? []) {
      const colId = t.status ? statusToCol[t.status] : undefined;
      const isDone = colId ? doneColumnIds.has(colId) : false;
      if (colId && !isDone && colId !== firstColId) wip += 1;
      if (!isDone && t.updatedAt) {
        const d = Math.floor((boardNowMs - Date.parse(t.updatedAt)) / 86_400_000);
        if (d > oldestOpenDays) oldestOpenDays = d;
      }
      if (t.closedOn) {
        const ageDays = (boardNowMs - Date.parse(t.closedOn)) / 86_400_000;
        if (ageDays >= 0 && ageDays <= 7) tp7 += 1;
        if (ageDays >= 0 && ageDays <= 30) tp30 += 1;
      }
    }
    return { wip, tp7, tp30, oldestOpenDays };
  }, [tasks, columns, statusToCol, doneColumnIds, boardNowMs]);

  const projectUuid = projectIri.split('/').pop() ?? '';
  const { data: cycleStat } = useQuery({
    queryKey: ['board-cycle-p50', projectUuid],
    enabled: Boolean(projectUuid),
    queryFn: async () => {
      const to = new Date(boardNowMs).toISOString().slice(0, 10);
      const from = new Date(boardNowMs - 180 * 86_400_000).toISOString().slice(0, 10);
      const { data } = await api.get<{ percentiles: { p50: number } | null; count: number }>(
        '/reports/cycle-time',
        { params: { from, to, project: projectUuid } },
      );
      return data;
    },
  });

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
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;

    // Droppable id is either a column id, or `laneKey~~columnId` in swimlane mode.
    let laneKey: string | null = null;
    let colId = overId;
    const sep = overId.indexOf(LANE_SEP);
    if (sep >= 0) {
      laneKey = overId.slice(0, sep);
      colId = overId.slice(sep + LANE_SEP.length);
    }
    const column = columns.find((c) => c.id === colId);
    if (!column) return;

    const task = (tasks?.data ?? []).find((t) => t['@id'] === taskIri);
    if (!task || !task.id) return;

    const values: Record<string, unknown> = {};

    // Column → status. Skip when the card already sits in this column. The
    // workflow gate is pre-checked so we show a useful toast instead of the
    // bare 403 the backend would throw (role-based 403s still surface server-side).
    if (!(task.status && column.statusIris.has(task.status))) {
      const newStatusIri = column.primaryStatusIri;
      const allowed = allowedToStatuses(task.tracker ?? null, task.status ?? null);
      if (allowed && !allowed.has(newStatusIri)) {
        toast.error(
          `Statuswechsel nicht im Workflow erlaubt — siehe Workspace-Einstellungen → Workflows.`,
        );
        return;
      }
      values.status = newStatusIri;
    }

    // Lane → dimension: dragging across a swimlane reassigns that dimension.
    // priority/tracker are PATCH-writable; assignees are NOT (read-only derived
    // field) and go through the set-assignees action endpoint instead.
    let assigneeUserIds: string[] | null = null; // null = leave assignees untouched
    if (laneKey !== null && filter.swimlane !== 'none') {
      if (filter.swimlane === 'priority') {
        if (laneKey !== LANE_NONE && task.priority !== laneKey) values.priority = laneKey;
      } else if (filter.swimlane === 'tracker') {
        const next = laneKey === LANE_NONE ? null : laneKey;
        if ((task.tracker ?? null) !== next) values.tracker = next;
      } else {
        const cur = task.assignees ?? [];
        if (laneKey === LANE_NONE) {
          if (cur.length > 0) assigneeUserIds = [];
        } else if (!(cur.length === 1 && cur[0] === laneKey)) {
          assigneeUserIds = [laneKey.split('/').pop() ?? ''].filter(Boolean);
        }
      }
    }

    if (Object.keys(values).length === 0 && assigneeUserIds === null) return;

    if (Object.keys(values).length > 0) {
      updateTask({ resource: 'tasks', id: task.id, values, successNotification: false });
    }
    if (assigneeUserIds !== null) {
      const taskId = task.id;
      const userIds = assigneeUserIds;
      void (async () => {
        try {
          await api.post(`/tasks/${taskId}/set-assignees`, { userIds });
          void invalidate({ resource: 'tasks', invalidates: ['list', 'detail'], id: taskId });
        } catch {
          toast.error('Zuweisung fehlgeschlagen.');
        }
      })();
    }
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
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {[
          { label: 'WIP', value: String(flowMetrics.wip) },
          { label: 'Throughput 7 T', value: String(flowMetrics.tp7) },
          { label: 'Throughput 30 T', value: String(flowMetrics.tp30) },
          { label: 'Ø Cycle p50', value: fmtHoursShort(cycleStat?.percentiles?.p50) },
          { label: 'Älteste offene', value: `${flowMetrics.oldestOpenDays} d` },
        ].map((m) => (
          <div key={m.label} className="rounded-md border bg-muted/30 px-2.5 py-1">
            <span className="text-muted-foreground">{m.label}</span>{' '}
            <span className="font-medium tabular-nums">{m.value}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter.q}
              onChange={(e) => setFilter({ q: e.target.value })}
              placeholder="Suche…"
              className="h-8 w-44 pl-7"
            />
          </div>
          <Select
            value={filter.priority || 'all'}
            onValueChange={(v) => setFilter({ priority: v === 'all' ? '' : v })}
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue placeholder="Priorität" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Prioritäten</SelectItem>
              {(['urgent', 'high', 'normal', 'low'] as const).map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant={filter.mine ? 'default' : 'outline'}
            onClick={() => setFilter({ mine: !filter.mine })}
          >
            Nur meine
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filter.hideDone ? 'default' : 'outline'}
            onClick={() => setFilter({ hideDone: !filter.hideDone })}
          >
            Erledigte ausblenden
          </Button>
          <Select
            value={filter.swimlane}
            onValueChange={(v) => setFilter({ swimlane: v as SwimlaneDim })}
          >
            <SelectTrigger className="h-8 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Keine Swimlanes</SelectItem>
              <SelectItem value="assignee">Nach Zuständige:r</SelectItem>
              <SelectItem value="priority">Nach Priorität</SelectItem>
              <SelectItem value="tracker">Nach Tracker</SelectItem>
            </SelectContent>
          </Select>
          {filterActive ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setFilter(EMPTY_FILTER)}>
              <X className="size-4" /> Zurücksetzen
            </Button>
          ) : null}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
          <SlidersHorizontal className="size-4" /> Board konfigurieren
        </Button>
      </div>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {swimlanes ? (
          <SwimlaneGrid
            lanes={swimlanes.lanes}
            byLaneCol={swimlanes.byLaneCol}
            columns={visibleColumns}
            columnTotals={tasksByColumn.byColumn}
            subtaskCountByParent={subtaskCountByParent}
            blockedTaskIris={blockedTaskIris}
            doneColumnIds={doneColumnIds}
            onOpenTask={(iri) => setOpenTask(iri)}
          />
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {visibleColumns.map((column) => (
              <BoardColumn
                key={column.id}
                column={column}
                tasks={tasksByColumn.byColumn[column.id] ?? []}
                hiddenOlder={tasksByColumn.hiddenOlder[column.id] ?? 0}
                collapsed={filter.collapsed.includes(column.id)}
                onToggleCollapse={() => toggleCollapse(column.id)}
                subtaskCountByParent={subtaskCountByParent}
                blockedTaskIris={blockedTaskIris}
                showAging={!doneColumnIds.has(column.id)}
                onOpenTask={(iri) => setOpenTask(iri)}
              />
            ))}
          </div>
        )}
        <DragOverlay>
          {activeTask ? <TaskCard task={activeTask} dragging /> : null}
        </DragOverlay>
        <TaskDetailSheet
          taskId={openTaskUuid}
          onOpenChange={(o) => {
            if (!o) setOpenTask(null);
          }}
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
  hiddenOlder = 0,
  collapsed = false,
  onToggleCollapse,
  subtaskCountByParent,
  blockedTaskIris,
  showAging = false,
  onOpenTask,
}: {
  column: ResolvedColumn;
  tasks: Row<TaskJsonld>[];
  hiddenOlder?: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  subtaskCountByParent: Record<string, number>;
  blockedTaskIris: Set<string>;
  showAging?: boolean;
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

  // Collapsed: a slim vertical bar (name + count). Stays a drop target so a
  // card dropped on it still moves to this column. (After hooks — rules-of-hooks.)
  if (collapsed) {
    return (
      <button
        type="button"
        ref={setNodeRef}
        onClick={onToggleCollapse}
        title={`${column.name} ausklappen`}
        className={cn(
          'flex h-[calc(100vh-14rem)] w-11 shrink-0 flex-col items-center gap-2 rounded-lg border bg-muted/30 py-3 transition-colors hover:bg-muted/60',
          isOver && 'border-primary bg-primary/5',
        )}
      >
        <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: column.color }} />
        <span className="text-xs font-medium tabular-nums text-muted-foreground">{tasks.length}</span>
        <span className="mt-1 [writing-mode:vertical-rl] rotate-180 text-sm font-medium">
          {column.name}
        </span>
      </button>
    );
  }

  const wip = column.wipLimit ?? null;
  const overWip = wip != null && tasks.length > wip;
  const atWip = wip != null && tasks.length === wip;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex max-h-[calc(100vh-14rem)] w-72 shrink-0 flex-col rounded-lg border bg-muted/30 p-3 transition-colors',
        isOver && 'border-primary bg-primary/5',
        overWip && 'border-red-400/80 bg-red-500/5 dark:border-red-500/60',
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
        <div className="flex items-center gap-1.5">
          {wip != null ? (
            <span
              className={cn(
                'text-xs font-medium tabular-nums',
                overWip ? 'text-red-600 dark:text-red-400' : atWip ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
              )}
              title={overWip ? `WIP-Limit überschritten (${tasks.length}/${wip})` : `WIP ${tasks.length} von ${wip}`}
            >
              {tasks.length} / {wip}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{tasks.length}</span>
          )}
          {onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Spalte einklappen"
              className="text-muted-foreground/60 hover:text-foreground"
            >
              <ChevronsLeft className="size-4" />
            </button>
          ) : null}
        </div>
      </div>
      {tasks.length === 0 && hiddenOlder === 0 ? (
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
                    showAging={showAging}
                    onOpen={() => t['@id'] && onOpenTask(t['@id'])}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {hiddenOlder > 0 ? (
        <p className="pt-2 text-center text-[11px] text-muted-foreground/70">
          +{hiddenOlder} ältere ausgeblendet
        </p>
      ) : null}
    </div>
  );
}

type Lane = { key: string; label: string; count: number };

/**
 * Swimlane view: a lanes × columns grid. One shared column header row on top,
 * then a bordered block per lane whose cells are droppables encoding both the
 * lane and the column (`laneKey~~columnId`). Cells are not virtualized — cards
 * are distributed across lanes, so each cell list stays short.
 */
function SwimlaneGrid({
  lanes,
  byLaneCol,
  columns,
  columnTotals,
  subtaskCountByParent,
  blockedTaskIris,
  doneColumnIds,
  onOpenTask,
}: {
  lanes: Lane[];
  byLaneCol: Record<string, Record<string, Row<TaskJsonld>[]>>;
  columns: ResolvedColumn[];
  columnTotals: Record<string, Row<TaskJsonld>[]>;
  subtaskCountByParent: Record<string, number>;
  blockedTaskIris: Set<string>;
  doneColumnIds: Set<string>;
  onOpenTask: (iri: string) => void;
}) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="w-max space-y-3">
        <div className="flex gap-4 border-b pb-1">
          {columns.map((col) => {
            const total = columnTotals[col.id]?.length ?? 0;
            const wip = col.wipLimit ?? null;
            const over = wip != null && total > wip;
            return (
              <div key={col.id} className="flex w-72 items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                  <h3 className="text-sm font-medium">{col.name}</h3>
                </div>
                <span
                  className={cn(
                    'text-xs tabular-nums',
                    over ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted-foreground',
                  )}
                >
                  {wip != null ? `${total} / ${wip}` : total}
                </span>
              </div>
            );
          })}
        </div>
        {lanes.map((lane) => (
          <div key={lane.key} className="rounded-lg border bg-muted/20">
            <div className="flex items-center gap-2 border-b px-3 py-1.5">
              <span className="text-sm font-medium">{lane.label}</span>
              <span className="text-xs text-muted-foreground">{lane.count}</span>
            </div>
            <div className="flex gap-4 p-2">
              {columns.map((col) => (
                <SwimlaneCell
                  key={col.id}
                  droppableId={`${lane.key}${LANE_SEP}${col.id}`}
                  tasks={byLaneCol[lane.key]?.[col.id] ?? []}
                  showAging={!doneColumnIds.has(col.id)}
                  subtaskCountByParent={subtaskCountByParent}
                  blockedTaskIris={blockedTaskIris}
                  onOpenTask={onOpenTask}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SwimlaneCell({
  droppableId,
  tasks,
  showAging,
  subtaskCountByParent,
  blockedTaskIris,
  onOpenTask,
}: {
  droppableId: string;
  tasks: Row<TaskJsonld>[];
  showAging: boolean;
  subtaskCountByParent: Record<string, number>;
  blockedTaskIris: Set<string>;
  onOpenTask: (iri: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[3.5rem] w-72 shrink-0 flex-col gap-2 rounded-md p-1 transition-colors',
        isOver && 'bg-primary/5 ring-1 ring-primary/40',
      )}
    >
      {tasks.length === 0 ? (
        <div className="py-4 text-center text-[11px] text-muted-foreground/40">—</div>
      ) : (
        tasks.map((t) => (
          <TaskCard
            key={t['@id']}
            task={t}
            subtaskCount={t['@id'] ? subtaskCountByParent[t['@id']] ?? 0 : 0}
            isBlocked={t['@id'] ? blockedTaskIris.has(t['@id']) : false}
            showAging={showAging}
            onOpen={() => t['@id'] && onOpenTask(t['@id'])}
          />
        ))
      )}
    </div>
  );
}

function TaskCard({
  task,
  dragging = false,
  subtaskCount = 0,
  isBlocked = false,
  showAging = false,
  onOpen,
}: {
  task: Row<TaskJsonld>;
  dragging?: boolean;
  subtaskCount?: number;
  isBlocked?: boolean;
  showAging?: boolean;
  onOpen?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task['@id'] ?? '',
    disabled: dragging,
  });
  // "Card aging" — days since last update, a proxy for staleness (there is no
  // dedicated time-in-column timestamp). Only surfaced in open columns.
  // Capture "now" once per mount (useState initializer) so render stays pure.
  const [nowMs] = useState(() => Date.now());
  const agingDays =
    showAging && task.updatedAt
      ? Math.max(0, Math.floor((nowMs - Date.parse(task.updatedAt)) / 86_400_000))
      : 0;
  const agingColor =
    agingDays >= 30
      ? 'text-red-600 dark:text-red-400'
      : agingDays >= 14
        ? 'text-orange-500'
        : 'text-amber-600 dark:text-amber-500';
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
            <PriorityScoreBadge entry={scoreEntryFromTask(task)} compact />
            {task.dueOn ? (
              <span className="text-[10px] text-muted-foreground">
                {new Date(task.dueOn).toLocaleDateString()}
              </span>
            ) : null}
            {agingDays >= 7 ? (
              <span
                className={cn('inline-flex items-center gap-0.5 text-[10px] font-medium', agingColor)}
                title={`Seit ${agingDays} Tagen nicht aktualisiert`}
              >
                <Clock className="size-3" />
                {agingDays}d
              </span>
            ) : null}
          </div>
          <UserAvatarStack iris={task.assignees} size="sm" max={3} />
        </div>
      </CardContent>
    </Card>
  );
}
