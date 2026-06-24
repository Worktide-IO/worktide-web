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
import { useCreate, useList, useUpdate } from '@refinedev/core';
import { useQuery } from '@tanstack/react-query';
import { Flag, Plus, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatarStack } from '@/components/UserAvatarStack';
import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

const BACKLOG = '__backlog__';

const STATE_LABEL: Record<string, string> = {
  planned: 'Geplant',
  active: 'Aktiv',
  completed: 'Abgeschlossen',
};
const STATE_VARIANT: Record<string, 'outline' | 'secondary' | 'default'> = {
  planned: 'outline',
  active: 'default',
  completed: 'secondary',
};

// The generated Task type doesn't carry `sprint` yet (gen:api not run to avoid
// churning the in-flight api/ dir) — augment locally.
type TaskRow = Row<TaskJsonld> & { sprint?: string | null };

type SprintRow = {
  '@id'?: string;
  id?: string;
  name: string;
  goal?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  state?: 'planned' | 'active' | 'completed';
  position?: number;
  project?: string;
};

type VelocityRow = {
  id: string;
  name: string;
  committedMinutes: number;
  completedMinutes: number;
  committedCount: number;
  completedCount: number;
};
type VelocityResponse = { project: string; sprints: VelocityRow[] };

function hrs(min: number): string {
  const h = min / 60;
  return h === 0 ? '0' : h < 10 ? h.toFixed(1) : String(Math.round(h));
}
function fmtDate(d?: string | null): string {
  return d ? new Date(d).toLocaleDateString() : '—';
}

/**
 * Sprints / Backlog board. A project's tasks with no sprint form the Backlog
 * column; each Sprint is its own column. Dragging a card assigns (or clears)
 * the task's sprint. A velocity panel and a per-sprint burndown sit alongside.
 * Project-scoped — sprints belong to one project (same as the burndown report).
 */
export function SprintsPage() {
  const [projectId, setProjectId] = useState<string>('');
  const projectIri = projectId ? `/v1/projects/${projectId}` : '';

  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
    sorters: [{ field: 'name', order: 'asc' }],
  });

  return (
    <div className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-2xl">
          <Zap className="size-6 text-muted-foreground" />
          Sprints
        </h2>
        <p className="text-sm text-muted-foreground">
          Backlog und Sprints eines Projekts — Aufgaben per Drag &amp; Drop zuordnen.
        </p>
      </div>

      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sprint-project" className="text-xs">Projekt</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger id="sprint-project" className="w-64">
              <SelectValue placeholder="Projekt wählen…" />
            </SelectTrigger>
            <SelectContent>
              {(projects?.data ?? []).map((p) => (
                <SelectItem key={p['@id']} value={p.id ?? ''}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {projectId ? (
        <SprintBoard projectId={projectId} projectIri={projectIri} />
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Bitte ein Projekt wählen, um Backlog und Sprints zu sehen.
        </p>
      )}
    </div>
  );
}

function SprintBoard({ projectId, projectIri }: { projectId: string; projectIri: string }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const { result: sprints, query: sprintsQuery } = useList<SprintRow>({
    resource: 'sprints',
    pagination: { mode: 'off' },
    filters: [{ field: 'project', operator: 'eq', value: projectIri }],
    sorters: [{ field: 'startDate', order: 'asc' }],
  });
  const { result: tasks, query: tasksQuery } = useList<TaskRow>({
    resource: 'tasks',
    pagination: { mode: 'off' },
    filters: [{ field: 'project', operator: 'eq', value: projectIri }],
    queryOptions: { enabled: Boolean(projectIri) },
  });
  useLiveResource('sprints');
  useLiveResource('tasks');

  const velocity = useQuery({
    queryKey: ['reports/velocity', projectId],
    queryFn: async (): Promise<VelocityResponse> => {
      const { data } = await api.get<VelocityResponse>('/reports/velocity', {
        params: { project: projectId },
      });
      return data;
    },
    enabled: Boolean(projectId),
  });
  const velocityById = useMemo(() => {
    const m: Record<string, VelocityRow> = {};
    for (const v of velocity.data?.sprints ?? []) m[v.id] = v;
    return m;
  }, [velocity.data]);

  const { mutate: updateTask } = useUpdate<TaskRow>();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [burndownSprint, setBurndownSprint] = useState<SprintRow | null>(null);

  const tasksBySprint = useMemo(() => {
    const map: Record<string, TaskRow[]> = { [BACKLOG]: [] };
    for (const t of tasks?.data ?? []) {
      const key = t.sprint ?? BACKLOG;
      (map[key] ??= []).push(t);
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || (a.identifier ?? '').localeCompare(b.identifier ?? ''));
    }
    return map;
  }, [tasks]);

  const activeTask = useMemo(
    () => (tasks?.data ?? []).find((t) => t['@id'] === activeId) ?? null,
    [tasks, activeId],
  );

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const taskIri = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;
    const task = (tasks?.data ?? []).find((t) => t['@id'] === taskIri);
    if (!task?.id) return;
    const target = overId === BACKLOG ? null : overId;
    if ((task.sprint ?? null) === target) return;
    updateTask({
      resource: 'tasks',
      id: task.id,
      values: { sprint: target },
      successNotification: false,
    });
  }

  if (sprintsQuery.isLoading || tasksQuery.isLoading) {
    return (
      <div className="flex gap-4">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 w-72 shrink-0" />)}
      </div>
    );
  }

  const orderedSprints = sprints?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> Neuer Sprint
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-2">
          <Column id={BACKLOG} title="Backlog" tasks={tasksBySprint[BACKLOG] ?? []} />
          {orderedSprints.map((s) => (
            <Column
              key={s['@id']}
              id={s['@id'] ?? ''}
              title={s.name}
              tasks={tasksBySprint[s['@id'] ?? ''] ?? []}
              sprint={s}
              velocity={s.id ? velocityById[s.id] : undefined}
              onBurndown={() => setBurndownSprint(s)}
            />
          ))}
        </div>
        <DragOverlay>{activeTask ? <SprintTaskCard task={activeTask} dragging /> : null}</DragOverlay>
      </DndContext>

      <VelocityPanel sprints={orderedSprints} velocityById={velocityById} loading={velocity.isLoading} />

      <CreateSprintDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectIri={projectIri}
        nextPosition={orderedSprints.length}
      />
      <BurndownDialog sprint={burndownSprint} onOpenChange={(o) => !o && setBurndownSprint(null)} />
    </div>
  );
}

function Column({
  id,
  title,
  tasks,
  sprint,
  velocity,
  onBurndown,
}: {
  id: string;
  title: string;
  tasks: TaskRow[];
  sprint?: SprintRow;
  velocity?: VelocityRow;
  onBurndown?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const pct = velocity && velocity.committedMinutes > 0
    ? Math.round((velocity.completedMinutes / velocity.committedMinutes) * 100)
    : 0;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'w-72 shrink-0 rounded-lg border bg-muted/30 p-3 transition-colors',
        isOver && 'border-primary bg-primary/5',
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{title}</h3>
          {sprint ? (
            <p className="text-[11px] text-muted-foreground">
              {fmtDate(sprint.startDate)} – {fmtDate(sprint.endDate)}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">Nicht eingeplant</p>
          )}
        </div>
        {sprint?.state ? (
          <Badge variant={STATE_VARIANT[sprint.state] ?? 'outline'} className="text-[10px]">
            {STATE_LABEL[sprint.state] ?? sprint.state}
          </Badge>
        ) : null}
      </div>

      {sprint && velocity ? (
        <div className="mb-2 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{hrs(velocity.completedMinutes)} / {hrs(velocity.committedMinutes)} h</span>
            <button type="button" onClick={onBurndown} className="underline hover:text-foreground">
              Burndown
            </button>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
      ) : null}

      <div className="flex items-center justify-between pb-1 text-xs text-muted-foreground">
        <span>{tasks.length} Aufgaben</span>
      </div>

      <div className="space-y-2">
        {tasks.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground/70">Keine Aufgaben</p>
        ) : (
          tasks.map((t) => <SprintTaskCard key={t['@id']} task={t} />)
        )}
      </div>
    </div>
  );
}

function SprintTaskCard({ task, dragging = false }: { task: TaskRow; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task['@id'] ?? '',
    disabled: dragging,
  });
  const est = task.estimatedMinutes ?? 0;

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
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-muted-foreground">{task.identifier}</span>
          {task.isPrio ? <Flag className="size-3 text-orange-500" aria-label="Priorisiert" /> : null}
        </div>
        <p className="text-sm font-medium leading-snug">{task.title}</p>
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {est > 0 ? (
            <span className="text-[10px] text-muted-foreground">{hrs(est)} h</span>
          ) : <span />}
          <UserAvatarStack iris={task.assignees} size="sm" max={3} />
        </div>
      </CardContent>
    </Card>
  );
}

function VelocityPanel({
  sprints,
  velocityById,
  loading,
}: {
  sprints: SprintRow[];
  velocityById: Record<string, VelocityRow>;
  loading: boolean;
}) {
  const data = useMemo(
    () =>
      sprints
        .filter((s) => s.id)
        .map((s) => {
          const v = velocityById[s.id ?? ''];
          return {
            name: s.name,
            committed: v ? Math.round((v.committedMinutes / 60) * 10) / 10 : 0,
            completed: v ? Math.round((v.completedMinutes / 60) * 10) / 10 : 0,
          };
        }),
    [sprints, velocityById],
  );

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="mb-3 text-sm font-medium">Velocity (Stunden je Sprint)</h3>
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Noch keine Sprints.</p>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" h" />
                <Tooltip formatter={(v) => `${Number(v) || 0} h`} />
                <Legend />
                <Bar dataKey="committed" name="Geplant" fill="#94a3b8" />
                <Bar dataKey="completed" name="Erledigt" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateSprintDialog({
  open,
  onOpenChange,
  projectIri,
  nextPosition,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectIri: string;
  nextPosition: number;
}) {
  const { mutate: create, mutation } = useCreate<SprintRow>();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const wsId = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;

  function submit() {
    if (!name.trim() || !wsId) return;
    create(
      {
        resource: 'sprints',
        values: {
          project: projectIri,
          workspace: `/v1/workspaces/${wsId}`,
          name: name.trim(),
          startDate: startDate || null,
          endDate: endDate || null,
          state: 'planned',
          position: nextPosition,
        },
      },
      {
        onSuccess: () => {
          setName('');
          setStartDate('');
          setEndDate('');
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neuer Sprint</DialogTitle>
          <DialogDescription>Eine Iteration mit Start- und Enddatum anlegen.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="s-name" className="text-xs">Name</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprint 1" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="s-start" className="text-xs">Start</Label>
              <Input id="s-start" type="date" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="s-end" className="text-xs">Ende</Label>
              <Input id="s-end" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={submit} disabled={!name.trim() || mutation.isPending}>Anlegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type BurndownResponse = { sprint: string | null; totalTasks: number; series: { date: string; open: number }[] };

function BurndownDialog({ sprint, onOpenChange }: { sprint: SprintRow | null; onOpenChange: (o: boolean) => void }) {
  const sprintId = sprint?.id ?? null;
  const from = sprint?.startDate ?? null;
  const to = sprint?.endDate ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ['reports/burndown', sprintId, from, to],
    queryFn: async (): Promise<BurndownResponse> => {
      const { data } = await api.get<BurndownResponse>('/reports/burndown', {
        params: { sprint: sprintId, from, to },
      });
      return data;
    },
    enabled: Boolean(sprintId && from && to),
  });

  return (
    <Dialog open={Boolean(sprint)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Burndown — {sprint?.name}</DialogTitle>
          <DialogDescription>Offene Aufgaben je Tag im Sprint-Zeitraum.</DialogDescription>
        </DialogHeader>
        {!from || !to ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Dieser Sprint hat kein Start-/Enddatum.
          </p>
        ) : isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <AreaChart data={data?.series ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="open" name="Offen" stroke="#6366f1" fill="#6366f1" fillOpacity={0.4} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
