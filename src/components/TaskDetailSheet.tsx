import { useGetIdentity, useInvalidate, useList, useOne } from '@refinedev/core';
import i18n from '@/i18n';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  CheckSquare,
  GitBranch,
  Link2,
  ListTree,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { TaskDependencyJsonld, TaskDependencyJsonldTypeEnum } from '@/api/types/taskDependency/Jsonld';
import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { AiTriagePanel } from '@/components/AiTriagePanel';
import { AiEstimatePanel } from '@/components/AiEstimatePanel';
import { TagPicker } from '@/components/TagPicker';
import { EntitySyncBadgeStack } from '@/components/EntitySyncBadgeStack';
import { PriorityScoreBadge, scoreEntryFromTask } from '@/components/PriorityScoreBadge';
import { TrackerChip } from '@/components/TrackerChip';
import { UserAvatarStack } from '@/components/UserAvatarStack';
import { userDisplayName, useUserDirectory } from '@/hooks/useUserDirectory';
import { VersionBadge } from '@/components/VersionBadge';
import { useProjectVersions } from '@/hooks/useProjectVersions';
import { useTrackers } from '@/hooks/useTrackers';
import { useWorkflowTransitions } from '@/hooks/useWorkflowTransitions';
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
  finish_to_start: 'dep_type.finish_to_start',
  start_to_start: 'dep_type.start_to_start',
  finish_to_finish: 'dep_type.finish_to_finish',
  start_to_finish: 'dep_type.start_to_finish',
  blocks: 'dep_type.blocks',
  precedes: 'dep_type.precedes',
  duplicates: 'dep_type.duplicates',
  relates: 'dep_type.relates',
  follows: 'dep_type.follows',
};
const TYPE_SHORT: Record<TaskDependencyJsonldTypeEnum, string> = {
  finish_to_start: 'FS',
  start_to_start: 'SS',
  finish_to_finish: 'FF',
  start_to_finish: 'SF',
  blocks: 'BLK',
  precedes: 'PRE',
  duplicates: 'DUP',
  relates: 'REL',
  follows: 'FOL',
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
          <TaskDetailBody task={task} />
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Editable schedule/effort block (Beginn / Fällig / Geschätzter Aufwand) plus
 * read-only Erstellt/Aktualisiert. Saves each field on change via merge-patch,
 * mirroring the tags/version sections. Effort is edited in hours (Redmine's
 * unit) and stored as minutes.
 */
function ScheduleSection({ task }: { task: Row<TaskJsonld> }) {
  const { t: translate } = useTranslation();
  const invalidate = useInvalidate();

  const save = async (body: Record<string, unknown>) => {
    if (!task.id) return;
    try {
      await api.patch(`/tasks/${task.id}`, body, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
      });
      void invalidate({ resource: 'tasks', invalidates: ['list', 'detail'], id: task.id });
    } catch {
      toast.error(translate('toast.could_not_save'));
    }
  };

  const dateInput = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
  const estHours = task.estimatedMinutes != null ? String(task.estimatedMinutes / 60) : '';

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border bg-muted/20 p-3 text-sm sm:grid-cols-3">
      <div className="space-y-1">
        <dt className="text-xs text-muted-foreground">{translate('task_detail.start')}</dt>
        <dd>
          <Input
            type="date"
            defaultValue={dateInput(task.startOn)}
            onChange={(e) => void save({ startOn: e.target.value || null })}
            className="h-8"
          />
        </dd>
      </div>
      <div className="space-y-1">
        <dt className="text-xs text-muted-foreground">{translate('task_detail.due')}</dt>
        <dd>
          <Input
            type="date"
            defaultValue={dateInput(task.dueOn)}
            onChange={(e) => void save({ dueOn: e.target.value || null })}
            className="h-8"
          />
        </dd>
      </div>
      <div className="space-y-1">
        <dt className="text-xs text-muted-foreground">{translate('task_detail.estimated_effort')}</dt>
        <dd className="flex items-center gap-1.5">
          <Input
            type="number"
            min={0}
            step={0.25}
            defaultValue={estHours}
            onBlur={(e) => {
              const h = Number.parseFloat(e.target.value);
              void save({ estimatedMinutes: Number.isFinite(h) && h > 0 ? Math.round(h * 60) : null });
            }}
            className="h-8 w-20"
          />
          <span className="text-xs text-muted-foreground">{translate('task_detail.hours_short')}</span>
        </dd>
      </div>
      {task.createdAt ? (
        <div className="space-y-1">
          <dt className="text-xs text-muted-foreground">{translate('task_detail.created')}</dt>
          <dd className="pt-1.5">{new Date(task.createdAt).toLocaleDateString()}</dd>
        </div>
      ) : null}
      {task.updatedAt ? (
        <div className="space-y-1">
          <dt className="text-xs text-muted-foreground">{translate('task_detail.updated')}</dt>
          <dd className="pt-1.5">{new Date(task.updatedAt).toLocaleDateString()}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** Shared merge-patch helper for the inline field editors. */
async function patchTaskField(
  id: string,
  body: Record<string, unknown>,
  invalidate: ReturnType<typeof useInvalidate>,
): Promise<void> {
  try {
    await api.patch(`/tasks/${id}`, body, {
      headers: { 'Content-Type': 'application/merge-patch+json' },
    });
    void invalidate({ resource: 'tasks', invalidates: ['list', 'detail'], id });
  } catch {
    toast.error(i18n.t('toast.could_not_save'));
  }
}

/** Inline-editable task title (saves on blur / Enter). */
function TitleEditor({ task }: { task: Row<TaskJsonld> }) {
  const { t: translate } = useTranslation();
  const invalidate = useInvalidate();
  return (
    <input
      key={task.id}
      defaultValue={task.title ?? ''}
      aria-label={translate('task_detail.title')}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (task.id && v !== '' && v !== (task.title ?? '')) {
          void patchTaskField(task.id, { title: v }, invalidate);
        }
      }}
      className="-mx-1 min-w-0 flex-1 rounded bg-transparent px-1 font-semibold outline-none hover:bg-muted/50 focus:bg-background focus:ring-1 focus:ring-ring"
    />
  );
}

/** Assignee editor: avatars open a checklist of workspace users. */
function AssigneeEditor({ task }: { task: Row<TaskJsonld> }) {
  const { t: translate } = useTranslation();
  const invalidate = useInvalidate();
  const { users } = useUserDirectory();
  const current = task.assignees ?? [];

  // `assignees` is a read-only derived field — user assignment goes through a
  // dedicated action endpoint that takes bare user UUIDs.
  const toggle = (iri: string) => {
    if (!task.id) return;
    const nextIris = current.includes(iri) ? current.filter((a) => a !== iri) : [...current, iri];
    const userIds = nextIris.map((i) => i.split('/').pop()).filter(Boolean);
    void (async () => {
      try {
        await api.post(`/tasks/${task.id}/set-assignees`, { userIds });
        void invalidate({ resource: 'tasks', invalidates: ['list', 'detail'], id: task.id });
      } catch {
        toast.error(translate('toast.could_not_save'));
      }
    })();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={translate('task_detail.edit_assignees')}
          className="inline-flex items-center gap-1 rounded px-1 hover:bg-muted/50"
        >
          {current.length > 0 ? (
            <UserAvatarStack iris={current} size="sm" max={3} />
          ) : (
            <span className="text-xs text-muted-foreground">{translate('task_detail.assign')}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-1">
        <div className="max-h-64 overflow-y-auto">
          {users.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">{translate('task_detail.no_users')}</p>
          ) : (
            users.map((u) => {
              const iri = u['@id'];
              if (!iri) return null;
              return (
                <label
                  key={iri}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox checked={current.includes(iri)} onCheckedChange={() => toggle(iri)} />
                  {userDisplayName(u)}
                </label>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Inline-editable description (saves on blur). */
function DescriptionEditor({ task }: { task: Row<TaskJsonld> }) {
  const { t: translate } = useTranslation();
  const invalidate = useInvalidate();
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{translate('task_detail.description')}</div>
      <Textarea
        key={task.id}
        defaultValue={task.description ?? ''}
        placeholder={translate('task_detail.description_placeholder')}
        onBlur={(e) => {
          const v = e.target.value;
          const next = v.trim() === '' ? null : v;
          if (task.id && next !== (task.description ?? null)) {
            void patchTaskField(task.id, { description: next }, invalidate);
          }
        }}
        className="min-h-24 text-sm"
      />
    </div>
  );
}

const PRIORITY_LABEL: Record<string, string> = {
  low: 'priority.low',
  normal: 'priority.normal',
  high: 'priority.high',
  urgent: 'priority.urgent',
};

/** Priority dropdown for the header (no workflow gate — free to change). */
function PriorityEditor({ task }: { task: Row<TaskJsonld> }) {
  const { t: translate } = useTranslation();
  const invalidate = useInvalidate();
  const change = (p: string) => {
    if (!task.id || p === task.priority) return;
    void patchTaskField(task.id, { priority: p }, invalidate);
  };
  return (
    <Select value={task.priority ?? 'normal'} onValueChange={change}>
      <SelectTrigger className="h-7 w-auto gap-1.5 px-2 text-xs">
        <SelectValue placeholder={translate('task_detail.priority')} />
      </SelectTrigger>
      <SelectContent>
        {(['urgent', 'high', 'normal', 'low'] as const).map((p) => (
          <SelectItem key={p} value={p}>
            {translate(PRIORITY_LABEL[p])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Internal priority-score badge — a computed signal, complements the manual priority. */
function TaskScoreBadge({ task }: { task: Row<TaskJsonld> }) {
  return <PriorityScoreBadge entry={scoreEntryFromTask(task)} />;
}

/** Workflow-gated status dropdown for the header. */
function StatusEditor({ task }: { task: Row<TaskJsonld> }) {
  const { t: translate } = useTranslation();
  const invalidate = useInvalidate();
  const { result: statuses } = useList<Row<TaskStatusJsonld>>({
    resource: 'task_statuses',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });
  const { allowedToStatuses } = useWorkflowTransitions();
  const list = statuses?.data ?? [];
  if (list.length === 0) return null;

  const change = (iri: string) => {
    if (!task.id || iri === task.status) return;
    const allowed = allowedToStatuses(task.tracker ?? null, task.status ?? null);
    if (allowed && !allowed.has(iri)) {
      toast.error(translate('toast.status_change_not_allowed'));
      return;
    }
    void patchTaskField(task.id, { status: iri }, invalidate);
  };

  return (
    <Select value={task.status ?? ''} onValueChange={change}>
      <SelectTrigger className="h-7 w-auto gap-1.5 px-2 text-xs">
        <SelectValue placeholder={translate('task_detail.status')} />
      </SelectTrigger>
      <SelectContent>
        {list.map((s) => (
          <SelectItem key={s['@id']} value={s['@id'] ?? ''}>
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: s.color ?? '#94a3b8' }}
              />
              {s.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TaskDetailBody({ task }: { task: Row<TaskJsonld> }) {
  const { t: translate } = useTranslation();
  const invalidate = useInvalidate();
  const { byIri: trackerByIri } = useTrackers();
  const tracker = task.tracker ? trackerByIri[task.tracker] : null;
  const { byIri: versionByIri } = useProjectVersions(task.project ?? null);
  const fixedVersion = task.fixedVersion ? versionByIri[task.fixedVersion] : null;

  return (
    <div className="space-y-5">
      <SheetHeader className="space-y-2">
        <SheetTitle className="text-lg leading-tight pr-9 flex items-baseline gap-2">
          <TrackerChip tracker={tracker} variant="icon" />
          <span className="font-mono text-xs text-muted-foreground">
            {task.identifier}
          </span>
          <TitleEditor task={task} />
        </SheetTitle>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <StatusEditor task={task} />
          <PriorityEditor task={task} />
          <TaskScoreBadge task={task} />
          {task.dueOn ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" />
              {new Date(task.dueOn).toLocaleDateString()}
            </span>
          ) : null}
          <AssigneeEditor task={task} />
          <VersionBadge version={fixedVersion} />
          <EntitySyncBadgeStack entityId={task.id} variant="full" />
          {task.project && task.id ? (
            <Button
              variant="ghost"
              size="sm"
              title={translate('task_detail.copy_deeplink')}
              onClick={() => {
                const link = `${window.location.origin}/projects/${task.project!.split('/').pop()}?task=${task.id}`;
                void navigator.clipboard
                  .writeText(link)
                  .then(() => toast.success(translate('toast.ticket_link_copied')))
                  .catch(() => toast.error(translate('toast.could_not_copy_link')));
              }}
              className="ml-auto h-6 gap-1 px-2 text-xs"
            >
              <Link2 className="size-3.5" /> {translate('task_detail.copy_link')}
            </Button>
          ) : null}
        </div>
      </SheetHeader>

      <div className="px-4 pb-6 space-y-5">
        <ScheduleSection task={task} />

        <DescriptionEditor task={task} />

        <div className="space-y-2">
          <AiTriagePanel
            target="task"
            targetId={task.id}
            onApplied={() => void invalidate({ resource: 'tasks', invalidates: ['list', 'detail'], id: task.id })}
          />
          <AiEstimatePanel
            taskId={task.id}
            onApplied={() => void invalidate({ resource: 'tasks', invalidates: ['list', 'detail'], id: task.id })}
          />
        </div>

        <TagsSection task={task} />
        <VersionSection task={task} />
        <SubtasksSection parent={task} />
        <DependenciesSection task={task} />
      </div>
    </div>
  );
}

// ----- Tags --------------------------------------------------------------

function TagsSection({ task }: { task: Row<TaskJsonld> }) {
  const { t: translate } = useTranslation();
  const invalidate = useInvalidate();
  const [saving, setSaving] = useState(false);

  const handle = async (next: string[]) => {
    if (!task.id) return;
    setSaving(true);
    try {
      await api.patch(
        `/tasks/${task.id}`,
        { tags: next },
        { headers: { 'Content-Type': 'application/merge-patch+json' } },
      );
      void invalidate({ resource: 'tasks', invalidates: ['list', 'detail'], id: task.id });
    } catch {
      toast.error(translate('toast.could_not_save_tags'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Tags</h3>
      <TagPicker
        value={task.tags ?? []}
        onChange={handle}
        scope="task"
        className={saving ? 'opacity-60' : undefined}
      />
    </section>
  );
}

// ----- Version (Release-Target) -----------------------------------------

function VersionSection({ task }: { task: Row<TaskJsonld> }) {
  const { t: translate } = useTranslation();
  const invalidate = useInvalidate();
  const { forProject } = useProjectVersions(task.project ?? null);
  const current = task.fixedVersion ?? '';

  // No project context → no versions can be set; hide the section.
  if (!task.project) return null;

  const updateVersion = async (iri: string) => {
    if (!task.id) return;
    try {
      await api.patch(
        `/tasks/${task.id}`,
        { fixedVersion: iri === '__none__' ? null : iri },
        { headers: { 'Content-Type': 'application/merge-patch+json' } },
      );
      void invalidate({ resource: 'tasks', invalidates: ['list', 'detail'], id: task.id });
      toast.success(translate('toast.release_updated'));
    } catch {
      toast.error(translate('toast.could_not_change_release'));
    }
  };

  return (
    <section className="space-y-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        Release / Version
      </Label>
      {forProject.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {translate('task_detail.no_releases')}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={current || '__none__'} onValueChange={updateVersion}>
            <SelectTrigger className="w-60">
              <SelectValue placeholder={translate('task_detail.no_release_assigned')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{translate('task_detail.no_release_option')}</SelectItem>
              {forProject.map((v) => (
                <SelectItem key={v['@id']} value={v['@id'] ?? ''}>
                  {v.name}
                  {v.effectiveDate ? ` · ${new Date(v.effectiveDate).toLocaleDateString()}` : ''}
                  {v.status && v.status !== 'open' ? ` (${v.status})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </section>
  );
}

// ----- Subtasks ----------------------------------------------------------

function SubtasksSection({ parent }: { parent: Row<TaskJsonld> }) {
  const { t: translate } = useTranslation();
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
      toast.error(translate('toast.could_not_create_subtask'));
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
        <p className="text-xs text-muted-foreground">{translate('task_detail.no_subtasks')}</p>
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
          placeholder={translate('task_detail.new_subtask_placeholder')}
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
  const { t: translate } = useTranslation();
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
    if (!window.confirm(translate('task_detail.confirm_remove_dependency'))) return;
    try {
      await api.delete(`/task_dependencies/${id}`);
      void invalidate({ resource: 'task_dependencies', invalidates: ['list'] });
    } catch {
      toast.error(translate('toast.could_not_remove_dependency'));
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <GitBranch className="size-4 text-muted-foreground" />
          {translate('task_detail.dependencies')}
        </h3>
        <Button size="sm" variant="outline" onClick={() => setShowAdd((v) => !v)}>
          <Plus className="size-3.5" />
          {translate('action.add')}
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
          <ArrowDown className="size-3" /> {translate('task_detail.blocked_by')}
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
          <ArrowUp className="size-3" /> {translate('task_detail.blocks')}
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
  const { t: translate } = useTranslation();
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
        title={translate(TYPE_LABEL[type])}
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
        <span className="flex-1 text-sm text-muted-foreground">{translate('task_detail.loading')}</span>
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
        aria-label={translate('task_detail.remove_dependency')}
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
  const { t: translate } = useTranslation();
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
      toast.error(msg ?? translate('toast.could_not_create_dependency'));
    } finally {
      setSaving(false);
    }
  };

  if (!task.project) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        {translate('task_detail.dependencies_project_only')}
        <div className="mt-2 text-right">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {translate('task_detail.close')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{translate('task_detail.direction')}</Label>
          <Select value={direction} onValueChange={(v) => setDirection(v as 'incoming' | 'outgoing')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="incoming">{translate('task_detail.direction_blocked_by')}</SelectItem>
              <SelectItem value="outgoing">{translate('task_detail.direction_blocks')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{translate('task_detail.type')}</Label>
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
          {translate('task_detail.task')}{project ? ` ${translate('task_detail.from_project', { name: project.name })}` : ''}
        </Label>
        <Select value={otherTaskId} onValueChange={setOtherTaskId}>
          <SelectTrigger>
            <SelectValue placeholder={translate('task_detail.select_other_task')} />
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
        <Label className="text-xs">{translate('task_detail.lag_label')}</Label>
        <Input
          type="number"
          value={lag}
          onChange={(e) => setLag(e.target.value)}
          className="max-w-32"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
          {translate('action.cancel')}
        </Button>
        <Button size="sm" onClick={submit} disabled={saving || !otherTaskId}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {translate('action.add')}
        </Button>
      </div>
    </div>
  );
}
