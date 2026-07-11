import { useList } from '@refinedev/core';
import { Pause, Play, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import {
  formatElapsed,
  useActiveTimer,
  useTick,
  type ActiveTimerSnapshot,
} from '@/hooks/useActiveTimer';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Floating stopwatch pill anchored at bottom-right of every authenticated
 * page (rendered once at AppLayout-level so it survives route changes).
 *
 * States:
 *  - **idle**     small circular button with a ▶ icon. Clicking opens a
 *                 popover with optional project / task / description
 *                 fields and a Start button.
 *  - **running**  expanded pill showing the live `H:MM:SS` clock, the
 *                 project name (or "Freie Zeit"), and a Stop button.
 *                 Click on the timer area opens the popover again for
 *                 editing the description / Cancel.
 *
 * Mercure-driven: another tab starting a timer (for the same user) will
 * cause this widget to flip into running mode without polling.
 */
export function FloatingTimer() {
  const { timer, start, stop, cancel } = useActiveTimer();
  useTick();

  if (timer) {
    return <RunningPill timer={timer} onStop={stop} onCancel={cancel} />;
  }
  return <IdleButton onStart={start} />;
}

function RunningPill({
  timer,
  onStop,
  onCancel,
}: {
  timer: ActiveTimerSnapshot;
  onStop: () => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const started = new Date(timer.startedAt).getTime();
  const seconds = Math.max(0, Math.round((Date.now() - started) / 1000));

  // Resolve project name from cache without re-fetching.
  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
    queryOptions: { enabled: Boolean(timer.projectId) },
  });
  const projectName = useMemo(() => {
    if (!timer.projectId) return null;
    const p = (projects?.data ?? []).find((x) => x.id === timer.projectId);
    return p?.name ?? null;
  }, [timer.projectId, projects]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border bg-background px-3 py-2 shadow-lg">
      <div
        className="size-2 animate-pulse rounded-full bg-green-500"
        aria-hidden
        title={t('floating_timer.running_title')}
      />
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-sm font-medium tabular-nums">
          {formatElapsed(seconds)}
        </span>
        <span className="max-w-40 truncate text-[10px] text-muted-foreground">
          {projectName ?? timer.description ?? t('floating_timer.free_time')}
        </span>
      </div>
      <Button
        type="button"
        size="icon"
        variant="default"
        className="size-7 rounded-full"
        onClick={() => void onStop()}
        aria-label={t('floating_timer.stop')}
        title={t('floating_timer.stop')}
      >
        <Pause className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7 rounded-full"
        onClick={() => void onCancel()}
        aria-label={t('floating_timer.discard_aria')}
        title={t('floating_timer.discard_title')}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

function IdleButton({
  onStart,
}: {
  onStart: (input: { projectId?: string | null; taskId?: string | null; description?: string | null }) => Promise<unknown>;
}) {
  const { t: translate } = useTranslation();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
    sorters: [{ field: 'updatedAt', order: 'desc' }],
    filters: [{ field: 'isArchived', operator: 'eq', value: 'false' }],
    queryOptions: { enabled: open },
  });

  const projectIri = projectId ? `/v1/projects/${projectId}` : null;
  const { result: tasks } = useList<Row<TaskJsonld>>({
    resource: 'tasks',
    pagination: { mode: 'off' },
    filters: projectIri ? [{ field: 'project', operator: 'eq', value: projectIri }] : [],
    sorters: [{ field: 'updatedAt', order: 'desc' }],
    queryOptions: { enabled: open && Boolean(projectIri) },
  });

  const handleStart = async () => {
    setSubmitting(true);
    try {
      await onStart({
        projectId: projectId ?? null,
        taskId: taskId ?? null,
        description: description.trim() ? description.trim() : null,
      });
      setOpen(false);
      // Reset form for the next start. The pill takes over the UI now.
      setProjectId(null);
      setTaskId(null);
      setDescription('');
    } catch (err) {
      console.warn('Floating timer: start failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          className={cn(
            'fixed bottom-4 right-4 z-50 size-12 rounded-full shadow-lg',
            'transition-transform hover:scale-105',
          )}
          aria-label={translate('floating_timer.start')}
          title={translate('floating_timer.start')}
        >
          <Play className="size-5 fill-current" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-80 space-y-3">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">{translate('floating_timer.start')}</h4>
          <p className="text-xs text-muted-foreground">
            {translate('floating_timer.optional_hint')}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="timer-description" className="text-xs">
            {translate('floating_timer.note_label')}
          </Label>
          <Input
            id="timer-description"
            placeholder={translate('floating_timer.note_placeholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{translate('floating_timer.project_label')}</Label>
          <Select
            value={projectId ?? 'none'}
            onValueChange={(v) => {
              const next = v === 'none' ? null : v;
              setProjectId(next);
              // Drop the task when switching project — old task no longer valid.
              setTaskId(null);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={translate('floating_timer.no_project')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{translate('floating_timer.no_project_option')}</SelectItem>
              {(projects?.data ?? []).map((p) => (
                <SelectItem key={p['@id']} value={p.id ?? ''}>
                  <span className="font-mono text-xs text-muted-foreground">{p.key}</span>{' '}
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Task</Label>
          <Select
            value={taskId ?? 'none'}
            onValueChange={(v) => setTaskId(v === 'none' ? null : v)}
            disabled={!projectId}
          >
            <SelectTrigger>
              <SelectValue placeholder={projectId ? translate('floating_timer.no_task') : translate('floating_timer.pick_project_first')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{translate('floating_timer.no_task_option')}</SelectItem>
              {(tasks?.data ?? []).map((t) => (
                <SelectItem key={t['@id']} value={t.id ?? ''}>
                  <span className="font-mono text-xs text-muted-foreground">
                    {t.identifier}
                  </span>{' '}
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          className="w-full"
          onClick={() => void handleStart()}
          disabled={submitting}
        >
          <Play className="size-4 fill-current" /> Start
        </Button>
      </PopoverContent>
    </Popover>
  );
}
