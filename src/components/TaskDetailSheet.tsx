import { useGetIdentity, useInvalidate, useList, useOne } from '@refinedev/core';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  CheckSquare,
  GitBranch,
  ListTree,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { TaskDependencyJsonld, TaskDependencyJsonldTypeEnum } from '@/api/types/taskDependency/Jsonld';
import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatarStack } from '@/components/UserAvatarStack';
import { api } from '@/lib/api';
import { WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

type Identity = { id?: string };

type Props = {
  taskId: string | null;
  onOpenChange: (open: boolean) => void;
};

const TYPE_LABEL: Record<TaskDependencyJsonldTypeEnum, string> = {
  finish_to_start: 'Finish → Start',
  start_to_start: 'Start → Start',
  finish_to_finish: 'Finish → Finish',
  start_to_finish: 'Start → Finish',
};
const TYPE_SHORT: Record<TaskDependencyJsonldTypeEnum, string> = {
  finish_to_start: 'FS',
  start_to_start: 'SS',
  finish_to_finish: 'FF',
  start_to_finish: 'SF',
};

/**
 * Slide-over panel for a single Task. Opens from the right and shows
 * everything that didn't fit on the kanban card: full title, current
 * status, due date, assignees plus the two sections we've been missing
 * — subtasks and dependencies. Closing the sheet doesn't navigate, so
 * the user keeps the board context.
 *
 * Cache invalidation philosophy: each section invalidates only the
 * query keys it owns (subtasks: ['tasks'], dependencies:
 * ['task_dependencies']). Mercure live subscribes to ['tasks'] so a
 * second tab editing the same task reflects on this one.
 */
export function TaskDetailSheet({ taskId, onOpenChange }: Props) {
  const open = taskId !== null;

  useLiveResource('tasks');

  const { result: task, query } = useOne<Row<TaskJsonld>>({
    resource: 'tasks',
    id: taskId ?? '',
    queryOptions: { enabled: open },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto sm:!max-w-xl"
      >
        {query.isLoading || !task ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <TaskDetailBody task={task} onClose={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function TaskDetailBody({ task, onClose }: { task: Row<TaskJsonld>; onClose: () => void }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <SheetHeader className="space-y-2">
        <SheetTitle className="text-lg leading-tight pr-9">
          <span className="font-mono text-xs text-muted-foreground mr-2">
            {task.identifier}
          </span>
          {task.title}
        </SheetTitle>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {task.priority ? (
            <Badge variant="outline" className="text-[10px]">
              Priorität: {task.priority}
            </Badge>
          ) : null}
          {task.dueOn ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" />
              {new Date(task.dueOn).toLocaleDateString()}
            </span>
          ) : null}
          <UserAvatarStack iris={task.assignees ?? []} size="sm" max={3} />
          {task.project ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onClose();
                navigate(`/projects/${task.project!.split('/').pop()}?tab=board`);
              }}
              className="ml-auto h-6 px-2 text-xs"
            >
              Projekt öffnen
            </Button>
          ) : null}
        </div>
      </SheetHeader>

      <div className="px-4 pb-6 space-y-5">
        {task.description ? (
          <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
            {task.description}
          </div>
        ) : null}

        <SubtasksSection parent={task} />
        <DependenciesSection task={task} />
      </div>
    </div>
  );
}

// ----- Subtasks ----------------------------------------------------------

function SubtasksSection({ parent }: { parent: Row<TaskJsonld> }) {
  const invalidate = useInvalidate();
  const { data: identity } = useGetIdentity<Identity>();
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);

  const { result: subtasks, query } = useList<Row<TaskJsonld>>({
    resource: 'tasks',
    pagination: { mode: 'off' },
    filters: parent.id
      ? [{ field: 'parent', operator: 'eq', value: `/v1/tasks/${parent.id}` }]
      : [],
    sorters: [{ field: 'position', order: 'asc' }],
    queryOptions: { enabled: Boolean(parent.id) },
  });
  const { result: statuses } = useList<Row<TaskStatusJsonld>>({
    resource: 'task_statuses',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });

  const defaultStatus = useMemo(() => {
    const rows = statuses?.data ?? [];
    return rows.find((s) => (s as { default?: boolean }).default ?? s.isDefault) ?? rows[0];
  }, [statuses]);

  const openStatusIris = useMemo(() => {
    const set = new Set<string>();
    for (const s of statuses?.data ?? []) {
      const completed = (s as { completed?: boolean }).completed ?? s.isCompleted ?? false;
      if (s['@id'] && !completed) set.add(s['@id']);
    }
    return set;
  }, [statuses]);

  const items = subtasks?.data ?? [];
  const done = items.filter((t) => t.status && !openStatusIris.has(t.status)).length;

  const submit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || !defaultStatus?.['@id']) return;
    setCreating(true);
    const workspaceId =
      typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    const parentKey = parent.identifier?.replace(/-.*$/, '') ?? 'TASK';
    const hex = Math.floor(0x1000 + Math.random() * 0xefff).toString(16);
    try {
      await api.post('/tasks', {
        title: trimmed,
        identifier: `${parentKey}-${hex}`,
        parent: parent['@id'],
        project: parent.project ?? null,
        status: defaultStatus['@id'],
        workspace: workspaceId ? `/v1/workspaces/${workspaceId}` : undefined,
        createdBy: identity?.id ? `/v1/users/${identity.id}` : undefined,
      });
      setDraft('');
      void invalidate({ resource: 'tasks', invalidates: ['list'] });
    } catch {
      toast.error('Konnte Subtask nicht anlegen.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <ListTree className="size-4 text-muted-foreground" />
          Subtasks
          {items.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              ({done}/{items.length})
            </span>
          ) : null}
        </h3>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Noch keine Subtasks.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((t) => (
            <li key={t['@id']} className="flex items-center gap-2 px-3 py-1.5">
              <CheckSquare
                className={cn(
                  'size-3.5 shrink-0',
                  t.status && !openStatusIris.has(t.status)
                    ? 'text-emerald-600'
                    : 'text-muted-foreground',
                )}
              />
              <span className="font-mono text-[10px] text-muted-foreground">
                {t.identifier}
              </span>
              <span className="flex-1 truncate text-sm">{t.title}</span>
              <UserAvatarStack iris={t.assignees ?? []} size="sm" max={2} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Input
          placeholder="Neue Subtask … (Enter speichert)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !creating && draft.trim()) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button
          size="sm"
          onClick={submit}
          disabled={creating || !draft.trim() || !defaultStatus}
        >
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </Button>
      </div>
    </section>
  );
}

// ----- Dependencies ------------------------------------------------------

function DependenciesSection({ task }: { task: Row<TaskJsonld> }) {
  const taskIri = task['@id'] ?? '';
  const invalidate = useInvalidate();
  const [showAdd, setShowAdd] = useState(false);

  // "Wird blockiert von" = wir sind successor — der predecessor blockiert uns.
  const { result: blockedBy, query: blockedByQ } = useList<Row<TaskDependencyJsonld>>({
    resource: 'task_dependencies',
    pagination: { mode: 'off' },
    filters: task.id ? [{ field: 'successor', operator: 'eq', value: taskIri }] : [],
    queryOptions: { enabled: Boolean(task.id) },
  });
  // "Blockiert" = wir sind predecessor — wir blockieren den successor.
  const { result: blocking, query: blockingQ } = useList<Row<TaskDependencyJsonld>>({
    resource: 'task_dependencies',
    pagination: { mode: 'off' },
    filters: task.id ? [{ field: 'predecessor', operator: 'eq', value: taskIri }] : [],
    queryOptions: { enabled: Boolean(task.id) },
  });

  const incoming = blockedBy?.data ?? [];
  const outgoing = blocking?.data ?? [];

  const remove = async (id: string) => {
    if (!window.confirm('Dependency wirklich entfernen?')) return;
    try {
      await api.delete(`/task_dependencies/${id}`);
      void invalidate({ resource: 'task_dependencies', invalidates: ['list'] });
    } catch {
      toast.error('Konnte Dependency nicht entfernen.');
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <GitBranch className="size-4 text-muted-foreground" />
          Abhängigkeiten
        </h3>
        <Button size="sm" variant="outline" onClick={() => setShowAdd((v) => !v)}>
          <Plus className="size-3.5" />
          Hinzufügen
        </Button>
      </div>

      {showAdd ? (
        <AddDependencyForm
          task={task}
          onClose={() => setShowAdd(false)}
          onCreated={() => invalidate({ resource: 'task_dependencies', invalidates: ['list'] })}
        />
      ) : null}

      {/* Wird blockiert von */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <ArrowDown className="size-3" /> Wird blockiert von
        </p>
        {blockedByQ.isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : incoming.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">—</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {incoming.map((d) => (
              <DependencyRow
                key={d['@id']}
                dep={d}
                otherTaskIri={d.predecessor ?? null}
                onDelete={() => d.id && remove(d.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Blockiert */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <ArrowUp className="size-3" /> Blockiert
        </p>
        {blockingQ.isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : outgoing.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">—</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {outgoing.map((d) => (
              <DependencyRow
                key={d['@id']}
                dep={d}
                otherTaskIri={d.successor ?? null}
                onDelete={() => d.id && remove(d.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function DependencyRow({
  dep,
  otherTaskIri,
  onDelete,
}: {
  dep: Row<TaskDependencyJsonld>;
  otherTaskIri: string | null;
  onDelete: () => void;
}) {
  const { result: other } = useOne<Row<TaskJsonld>>({
    resource: 'tasks',
    id: otherTaskIri?.split('/').pop() ?? '',
    queryOptions: { enabled: Boolean(otherTaskIri) },
  });

  const type = (dep.type ?? 'finish_to_start') as TaskDependencyJsonldTypeEnum;
  const lag = dep.lagMinutes ?? 0;

  return (
    <li className="flex items-center gap-2 px-3 py-1.5">
      <span
        className="font-mono text-[10px] rounded bg-muted px-1.5 py-0.5"
        title={TYPE_LABEL[type]}
      >
        {TYPE_SHORT[type]}
      </span>
      <ArrowRight className="size-3 text-muted-foreground" />
      {other ? (
        <>
          <span className="font-mono text-[10px] text-muted-foreground">
            {other.identifier}
          </span>
          <span className="flex-1 truncate text-sm">{other.title}</span>
        </>
      ) : (
        <span className="flex-1 text-sm text-muted-foreground">Lädt …</span>
      )}
      {lag !== 0 ? (
        <Badge variant="outline" className="text-[10px]">
          {lag > 0 ? `+${lag}` : lag} min
        </Badge>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={onDelete}
        aria-label="Dependency entfernen"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </li>
  );
}

function AddDependencyForm({
  task,
  onClose,
  onCreated,
}: {
  task: Row<TaskJsonld>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [direction, setDirection] = useState<'incoming' | 'outgoing'>('incoming');
  const [otherTaskId, setOtherTaskId] = useState<string>('');
  const [type, setType] = useState<TaskDependencyJsonldTypeEnum>('finish_to_start');
  const [lag, setLag] = useState<string>('0');
  const [saving, setSaving] = useState(false);

  // Project-scoped task picker — dependencies are intentionally
  // project-local so we don't have to think about cross-project
  // scheduling effects on the Gantt yet.
  const { result: tasks } = useList<Row<TaskJsonld>>({
    resource: 'tasks',
    pagination: { mode: 'off' },
    filters: task.project
      ? [{ field: 'project', operator: 'eq', value: task.project }]
      : [],
    sorters: [{ field: 'identifier', order: 'asc' }],
    queryOptions: { enabled: Boolean(task.project) },
  });
  const candidates = (tasks?.data ?? []).filter((t) => t['@id'] !== task['@id']);

  const { result: project } = useOne<Row<ProjectJsonld>>({
    resource: 'projects',
    id: task.project?.split('/').pop() ?? '',
    queryOptions: { enabled: Boolean(task.project) },
  });

  const submit = async () => {
    if (!otherTaskId) return;
    const workspaceId =
      typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    const lagInt = Number.parseInt(lag, 10);
    const payload = {
      predecessor: direction === 'incoming' ? otherTaskId : task['@id'],
      successor: direction === 'incoming' ? task['@id'] : otherTaskId,
      type,
      lagMinutes: Number.isFinite(lagInt) ? lagInt : 0,
      workspace: workspaceId ? `/v1/workspaces/${workspaceId}` : undefined,
    };
    setSaving(true);
    try {
      await api.post('/task_dependencies', payload);
      onCreated();
      onClose();
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? 'Konnte Dependency nicht anlegen.');
    } finally {
      setSaving(false);
    }
  };

  if (!task.project) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        Dependencies sind nur innerhalb eines Projekts möglich. Diese
        Aufgabe ist privat — füge sie erst einem Projekt hinzu.
        <div className="mt-2 text-right">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Schließen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Richtung</Label>
          <Select value={direction} onValueChange={(v) => setDirection(v as 'incoming' | 'outgoing')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="incoming">Wird blockiert von …</SelectItem>
              <SelectItem value="outgoing">Blockiert …</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Typ</Label>
          <Select value={type} onValueChange={(v) => setType(v as TaskDependencyJsonldTypeEnum)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="finish_to_start">Finish → Start</SelectItem>
              <SelectItem value="start_to_start">Start → Start</SelectItem>
              <SelectItem value="finish_to_finish">Finish → Finish</SelectItem>
              <SelectItem value="start_to_finish">Start → Finish</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">
          Aufgabe {project ? `aus „${project.name}"` : ''}
        </Label>
        <Select value={otherTaskId} onValueChange={setOtherTaskId}>
          <SelectTrigger>
            <SelectValue placeholder="Andere Aufgabe wählen…" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((t) => (
              <SelectItem key={t['@id']} value={t['@id'] ?? ''}>
                <span className="inline-flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {t.identifier}
                  </span>
                  {t.title}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Lag (Minuten — negativ = lead)</Label>
        <Input
          type="number"
          value={lag}
          onChange={(e) => setLag(e.target.value)}
          className="max-w-32"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
          Abbrechen
        </Button>
        <Button size="sm" onClick={submit} disabled={saving || !otherTaskId}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Hinzufügen
        </Button>
      </div>
    </div>
  );
}
