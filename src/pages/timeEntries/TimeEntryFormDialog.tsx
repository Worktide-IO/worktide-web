import { useInvalidate } from '@refinedev/core';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { TimeEntryJsonld } from '@/api/types/timeEntry/Jsonld';
import type { TypeOfWorkJsonld } from '@/api/types/typeOfWork/Jsonld';
import type { UserJsonld } from '@/api/types/user/Jsonld';
import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

/**
 * Create / edit dialog for a manual time entry.
 *
 * Two input modes (awork parity), toggled at the top:
 *  - "duration": date + start time + a duration (h/m). endsAt is derived so
 *    the entry never lands in the running state (isRunning === endsAt null).
 *  - "range": date + start + end time. durationMinutes is derived.
 *
 * Both modes always send startsAt AND endsAt — a manual entry with a null
 * endsAt would show as "läuft…" forever and skew reports.
 *
 * Person defaults to the current user; picking someone else requires the
 * time_entry.update_others capability, which the backend voter enforces
 * (securityPostDenormalize on Post, EDIT voter on Patch) — a 403 surfaces as
 * a toast here.
 */

const NONE = '__none__';

type Mode = 'duration' | 'range';

type FormState = {
  mode: Mode;
  personIri: string;
  date: string;
  startTime: string;
  endTime: string;
  durH: number;
  durM: number;
  projectIri: string;
  taskIri: string;
  typeIri: string;
  note: string;
  isBillable: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit mode, absent → create mode. */
  entry?: Row<TimeEntryJsonld> | null;
  defaultUserIri: string | null;
  projects: Row<ProjectJsonld>[];
  tasks: Row<TaskJsonld>[];
  typesOfWork: Row<TypeOfWorkJsonld>[];
  users: Row<UserJsonld>[];
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Format a Date as a local wall-clock ISO string WITHOUT a timezone
 * designator (e.g. `2026-07-13T09:00:00`). The backend stores datetimes as
 * server-local naive values (Doctrine datetime_immutable), so sending a UTC
 * `Z` timestamp would shift the instant by the server offset. Every other
 * datetime the app writes uses this same local-wall-clock convention.
 */
function toLocalISO(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** Split an ISO datetime into local date (YYYY-MM-DD) + time (HH:MM). */
function splitLocal(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: todayISO(), time: '09:00' };
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function userLabel(u: Row<UserJsonld>): string {
  return u.fullName || u.email || (u['@id']?.split('/').pop() ?? '');
}

function buildState(entry: Row<TimeEntryJsonld> | null, defaultUserIri: string | null): FormState {
  if (entry) {
    const { date, time } = splitLocal(entry.startsAt);
    const mins = entry.durationMinutes ?? 0;
    return {
      mode: 'duration',
      personIri: entry.user ?? defaultUserIri ?? '',
      date,
      startTime: time,
      endTime: splitLocal(entry.endsAt ?? entry.startsAt).time,
      durH: Math.floor(mins / 60),
      durM: mins % 60,
      projectIri: entry.project ?? NONE,
      taskIri: entry.task ?? NONE,
      typeIri: entry.typeOfWork ?? NONE,
      note: entry.note ?? '',
      isBillable: entry.isBillable ?? true,
    };
  }
  return {
    mode: 'duration',
    personIri: defaultUserIri ?? '',
    date: todayISO(),
    startTime: '09:00',
    endTime: '10:00',
    durH: 1,
    durM: 0,
    projectIri: NONE,
    taskIri: NONE,
    typeIri: NONE,
    note: '',
    isBillable: true,
  };
}

export function TimeEntryFormDialog({
  open,
  onOpenChange,
  entry,
  defaultUserIri,
  projects,
  tasks,
  typesOfWork,
  users,
}: Props) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const isEdit = !!entry;

  const [form, setForm] = useState<FormState>(() => buildState(entry ?? null, defaultUserIri));
  const [busy, setBusy] = useState(false);

  // Re-seed the form whenever the dialog opens (for create or for a specific
  // entry). This is a deliberate external→React sync on open, hence the rule
  // opt-out — the same pattern CustomerFilesTab / GlobalSearchDialog use.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset form fields when the dialog opens
    setForm(buildState(entry ?? null, defaultUserIri));
  }, [open, entry, defaultUserIri]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // Tasks selectable for the chosen project (project-less tasks stay hidden
  // unless "kein Projekt" is selected, matching how the list joins them).
  const taskOptions = useMemo(() => {
    if (form.projectIri === NONE) return tasks.filter((tk) => !tk.project);
    return tasks.filter((tk) => tk.project === form.projectIri);
  }, [tasks, form.projectIri]);

  const changeProject = (v: string) => {
    // Drop a task pin that no longer belongs to the newly selected project.
    const stillValid =
      form.taskIri !== NONE &&
      (v === NONE
        ? tasks.some((tk) => tk['@id'] === form.taskIri && !tk.project)
        : tasks.some((tk) => tk['@id'] === form.taskIri && tk.project === v));
    set({ projectIri: v, taskIri: stillValid ? form.taskIri : NONE });
  };

  const submit = async () => {
    const start = new Date(`${form.date}T${form.startTime}`);
    if (Number.isNaN(start.getTime())) {
      toast.error(t('time_entries.invalid_start'));
      return;
    }

    let durationMinutes: number;
    let end: Date;
    if (form.mode === 'range') {
      end = new Date(`${form.date}T${form.endTime}`);
      if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
        toast.error(t('time_entries.end_before_start'));
        return;
      }
      durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    } else {
      durationMinutes = Math.max(0, form.durH) * 60 + Math.max(0, form.durM);
      if (durationMinutes <= 0) {
        toast.error(t('time_entries.duration_required'));
        return;
      }
      end = new Date(start.getTime() + durationMinutes * 60000);
    }

    if (!form.personIri) {
      toast.error(t('time_entries.person_required'));
      return;
    }

    const body: Record<string, unknown> = {
      user: form.personIri,
      startsAt: toLocalISO(start),
      endsAt: toLocalISO(end),
      durationMinutes,
      project: form.projectIri === NONE ? null : form.projectIri,
      task: form.taskIri === NONE ? null : form.taskIri,
      typeOfWork: form.typeIri === NONE ? null : form.typeIri,
      note: form.note.trim() || null,
      isBillable: form.isBillable,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    setBusy(true);
    try {
      if (isEdit && entry) {
        await api.patch(`/time_entries/${entry.id}`, body, {
          headers: { 'Content-Type': 'application/merge-patch+json' },
        });
      } else {
        const wsId =
          typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
        if (!wsId) {
          toast.error(t('time_entries.no_workspace'));
          return;
        }
        await api.post('/time_entries', { ...body, workspace: `/v1/workspaces/${wsId}` });
      }
      void invalidate({ resource: 'time_entries', invalidates: ['list'] });
      toast.success(isEdit ? t('time_entries.saved') : t('time_entries.created'));
      onOpenChange(false);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(status === 403 ? t('time_entries.forbidden') : t('time_entries.save_failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('time_entries.form_title_edit') : t('time_entries.form_title_create')}
          </DialogTitle>
          <DialogDescription>{t('time_entries.form_hint')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('time_entries.field_person')}</Label>
            <Select value={form.personIri} onValueChange={(v) => set({ personIri: v })}>
              <SelectTrigger>
                <SelectValue placeholder={t('time_entries.field_person')} />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u['@id']} value={u['@id'] ?? ''}>
                    {userLabel(u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={form.mode} onValueChange={(v) => set({ mode: v as Mode })}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="duration">{t('time_entries.mode_duration')}</TabsTrigger>
              <TabsTrigger value="range">{t('time_entries.mode_range')}</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('time_entries.field_date')}</Label>
              <Input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('time_entries.field_start')}</Label>
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) => set({ startTime: e.target.value })}
              />
            </div>
          </div>

          {form.mode === 'range' ? (
            <div className="space-y-1.5">
              <Label>{t('time_entries.field_end')}</Label>
              <Input
                type="time"
                value={form.endTime}
                onChange={(e) => set({ endTime: e.target.value })}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{t('time_entries.field_duration')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={form.durH}
                  onChange={(e) => set({ durH: Number(e.target.value) })}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">{t('time_entries.hours')}</span>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={form.durM}
                  onChange={(e) => set({ durM: Number(e.target.value) })}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">{t('time_entries.minutes')}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('time_entries.project')}</Label>
              <Select value={form.projectIri} onValueChange={changeProject}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('time_entries.no_project')}</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p['@id']} value={p['@id'] ?? ''}>
                      {p.key} · {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('time_entries.col_task')}</Label>
              <Select value={form.taskIri} onValueChange={(v) => set({ taskIri: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('time_entries.no_task')}</SelectItem>
                  {taskOptions.map((tk) => (
                    <SelectItem key={tk['@id']} value={tk['@id'] ?? ''}>
                      {tk.identifier} · {tk.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('time_entries.col_activity')}</Label>
            <Select value={form.typeIri} onValueChange={(v) => set({ typeIri: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('time_entries.no_activity')}</SelectItem>
                {typesOfWork.map((tw) => (
                  <SelectItem key={tw['@id']} value={tw['@id'] ?? ''}>
                    {tw.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('time_entries.col_note')}</Label>
            <Textarea value={form.note} onChange={(e) => set({ note: e.target.value })} rows={3} />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="te-billable">{t('time_entries.billable')}</Label>
            <Switch
              id="te-billable"
              checked={form.isBillable}
              onCheckedChange={(v) => set({ isBillable: v })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('time_entries.cancel')}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {t('time_entries.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
