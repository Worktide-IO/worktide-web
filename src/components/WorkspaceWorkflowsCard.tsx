import { useInvalidate, useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2, Pencil, Plus, ShieldCheck, Trash2, Workflow } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import type { TrackerJsonld } from '@/api/types/tracker/Jsonld';
import type { WorkflowTransitionJsonld } from '@/api/types/workflowTransition/Jsonld';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';

const ROLES: { value: string; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'guest', label: 'Guest' },
];

const BASELINE = '__baseline__';

/**
 * Workflow editor — list of (fromStatus → toStatus, allowedRoles[]) per
 * Tracker (or as a tracker-agnostic baseline). The first non-trivial
 * surface where the workspace admin shapes the issue lifecycle.
 *
 * Default-open semantics are spelled out in the card's description:
 * with zero rows for a (tracker, fromStatus) pair, every move is
 * allowed; the first rule for that pair switches into a closed state
 * machine.
 *
 * The tracker selector includes a "Baseline" option (tracker=null) for
 * workspaces that want one workflow across the board without
 * customising per tracker.
 */
export function WorkspaceWorkflowsCard() {
  const { t: translate } = useTranslation();
  const [trackerFilter, setTrackerFilter] = useState<string>(BASELINE);

  const { result: trackers, query: trackersQuery } = useList<Row<TrackerJsonld>>({
    resource: 'trackers',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });
  const { result: statuses } = useList<Row<TaskStatusJsonld>>({
    resource: 'task_statuses',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });
  const { result: transitions, query: txQuery } = useList<Row<WorkflowTransitionJsonld>>({
    resource: 'workflow_transitions',
    pagination: { mode: 'off' },
  });

  const trackerByIri = useMemo(() => {
    const map: Record<string, Row<TrackerJsonld>> = {};
    for (const t of trackers?.data ?? []) if (t['@id']) map[t['@id']] = t;
    return map;
  }, [trackers]);
  const statusByIri = useMemo(() => {
    const map: Record<string, Row<TaskStatusJsonld>> = {};
    for (const s of statuses?.data ?? []) if (s['@id']) map[s['@id']] = s;
    return map;
  }, [statuses]);

  const filteredTransitions = useMemo(() => {
    const all = transitions?.data ?? [];
    if (trackerFilter === BASELINE) return all.filter((t) => !t.tracker);
    return all.filter((t) => t.tracker === trackerFilter);
  }, [transitions, trackerFilter]);

  const [editing, setEditing] = useState<Row<WorkflowTransitionJsonld> | null>(null);
  const [creating, setCreating] = useState(false);

  const isLoading = trackersQuery.isLoading || txQuery.isLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Workflow className="size-5 text-muted-foreground" />
          {translate('ws_workflows.title')}
        </CardTitle>
        <CardDescription>
          {translate('ws_workflows.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Select value={trackerFilter} onValueChange={setTrackerFilter}>
            <SelectTrigger className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={BASELINE}>{translate('ws_workflows.baseline_all')}</SelectItem>
              {(trackers?.data ?? []).map((t) => (
                <SelectItem key={t['@id']} value={t['@id'] ?? ''}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {translate('ws_workflows.new_rule')}
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : filteredTransitions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {translate('ws_workflows.empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{translate('ws_workflows.col_from')}</TableHead>
                <TableHead className="w-8" />
                <TableHead>{translate('ws_workflows.col_to')}</TableHead>
                <TableHead>{translate('ws_workflows.col_roles')}</TableHead>
                <TableHead>{translate('ws_workflows.col_label')}</TableHead>
                <TableHead className="w-20 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransitions.map((t) => (
                <TransitionRow
                  key={t['@id']}
                  transition={t}
                  statusByIri={statusByIri}
                  onEdit={() => setEditing(t)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {creating ? (
        <TransitionDialog
          mode="create"
          tracker={trackerFilter === BASELINE ? null : trackerFilter}
          statuses={statuses?.data ?? []}
          trackers={trackers?.data ?? []}
          trackerByIri={trackerByIri}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {editing ? (
        <TransitionDialog
          mode="edit"
          transition={editing}
          statuses={statuses?.data ?? []}
          trackers={trackers?.data ?? []}
          trackerByIri={trackerByIri}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

function TransitionRow({
  transition,
  statusByIri,
  onEdit,
}: {
  transition: Row<WorkflowTransitionJsonld>;
  statusByIri: Record<string, Row<TaskStatusJsonld>>;
  onEdit: () => void;
}) {
  const { t: translate } = useTranslation();
  const invalidate = useInvalidate();
  const [deleting, setDeleting] = useState(false);

  const from = transition.fromStatus ? statusByIri[transition.fromStatus]?.name : '?';
  const to = transition.toStatus ? statusByIri[transition.toStatus]?.name : '?';
  const roles = transition.allowedRoles;

  const remove = async () => {
    if (!transition.id) return;
    if (!window.confirm(translate('ws_workflows.confirm_delete', { from, to }))) return;
    setDeleting(true);
    try {
      await api.delete(`/workflow_transitions/${transition.id}`);
      void invalidate({ resource: 'workflow_transitions', invalidates: ['list'] });
      toast.success(translate('toast.rule_deleted'));
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? translate('toast.could_not_delete_rule'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{from}</TableCell>
      <TableCell className="text-muted-foreground">
        <ArrowRight className="size-4" />
      </TableCell>
      <TableCell className="font-medium">{to}</TableCell>
      <TableCell className="text-xs">
        {roles === null || roles === undefined ? (
          <span className="text-muted-foreground">{translate('ws_workflows.any_role')}</span>
        ) : roles.length === 0 ? (
          <span className="text-destructive">{translate('ws_workflows.nobody_killswitch')}</span>
        ) : (
          <span className="inline-flex flex-wrap gap-1">
            {roles.map((r) => (
              <span
                key={r}
                className="inline-flex items-center gap-0.5 rounded border bg-muted/30 px-1.5 py-0 text-[0.7rem]"
              >
                <ShieldCheck className="size-3" />
                {ROLES.find((o) => o.value === r)?.label ?? r}
              </span>
            ))}
          </span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {transition.label ?? '—'}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="icon" className="size-7" onClick={onEdit} aria-label={translate('action.edit')}>
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={remove}
          disabled={deleting}
          aria-label={translate('action.delete')}
        >
          {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      </TableCell>
    </TableRow>
  );
}

type DialogProps =
  | {
      mode: 'create';
      tracker: string | null;
      statuses: Row<TaskStatusJsonld>[];
      trackers: Row<TrackerJsonld>[];
      trackerByIri: Record<string, Row<TrackerJsonld>>;
      onClose: () => void;
    }
  | {
      mode: 'edit';
      transition: Row<WorkflowTransitionJsonld>;
      statuses: Row<TaskStatusJsonld>[];
      trackers: Row<TrackerJsonld>[];
      trackerByIri: Record<string, Row<TrackerJsonld>>;
      onClose: () => void;
    };

function TransitionDialog(props: DialogProps) {
  const { t: translate } = useTranslation();
  const invalidate = useInvalidate();
  const isEdit = props.mode === 'edit';
  const initial = isEdit ? props.transition : null;

  const [tracker, setTracker] = useState<string>(
    isEdit ? (initial?.tracker ?? BASELINE) : props.tracker ?? BASELINE,
  );
  const [fromStatus, setFromStatus] = useState<string>(initial?.fromStatus ?? '');
  const [toStatus, setToStatus] = useState<string>(initial?.toStatus ?? '');
  const [roleMode, setRoleMode] = useState<'any' | 'specific' | 'none'>(
    initial?.allowedRoles === undefined || initial?.allowedRoles === null
      ? 'any'
      : initial.allowedRoles.length === 0
        ? 'none'
        : 'specific',
  );
  const [selectedRoles, setSelectedRoles] = useState<string[]>(initial?.allowedRoles ?? []);
  const [label, setLabel] = useState(initial?.label ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit && props.transition) {
      setTracker(props.transition.tracker ?? BASELINE);
      setFromStatus(props.transition.fromStatus ?? '');
      setToStatus(props.transition.toStatus ?? '');
      const ar = props.transition.allowedRoles;
      setRoleMode(ar === undefined || ar === null ? 'any' : ar.length === 0 ? 'none' : 'specific');
      setSelectedRoles(ar ?? []);
      setLabel(props.transition.label ?? '');
    }
  }, [isEdit, props]);

  const submit = async () => {
    if (!fromStatus || !toStatus) {
      toast.error(translate('toast.select_from_to_status'));
      return;
    }
    if (fromStatus === toStatus) {
      toast.error(translate('toast.from_to_status_identical'));
      return;
    }
    setSaving(true);
    try {
      const allowedRoles =
        roleMode === 'any' ? null : roleMode === 'none' ? [] : selectedRoles;
      const body: Record<string, unknown> = {
        tracker: tracker === BASELINE ? null : tracker,
        fromStatus,
        toStatus,
        allowedRoles,
        label: label.trim() || null,
      };
      if (isEdit && props.transition.id) {
        await api.patch(`/workflow_transitions/${props.transition.id}`, body, {
          headers: { 'Content-Type': 'application/merge-patch+json' },
        });
        toast.success(translate('toast.rule_updated'));
      } else {
        const workspaceId =
          typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
        if (!workspaceId) throw new Error('Kein aktiver Workspace.');
        await api.post('/workflow_transitions', {
          ...body,
          workspace: `/v1/workspaces/${workspaceId}`,
        });
        toast.success(translate('toast.rule_created'));
      }
      void invalidate({ resource: 'workflow_transitions', invalidates: ['list'] });
      props.onClose();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? translate('toast.could_not_save_rule'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? translate('ws_workflows.edit_title') : translate('ws_workflows.new_title')}
          </DialogTitle>
          <DialogDescription>
            {translate('ws_workflows.dialog_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="wt-tracker">{translate('ws_workflows.tracker')}</Label>
            <Select value={tracker} onValueChange={setTracker}>
              <SelectTrigger id="wt-tracker">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BASELINE}>{translate('ws_workflows.baseline_all')}</SelectItem>
                {props.trackers.map((t) => (
                  <SelectItem key={t['@id']} value={t['@id'] ?? ''}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wt-from">{translate('ws_workflows.col_from')}</Label>
              <Select value={fromStatus} onValueChange={setFromStatus}>
                <SelectTrigger id="wt-from">
                  <SelectValue placeholder={translate('ws_workflows.status_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {props.statuses.map((s) => (
                    <SelectItem key={s['@id']} value={s['@id'] ?? ''}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wt-to">{translate('ws_workflows.col_to')}</Label>
              <Select value={toStatus} onValueChange={setToStatus}>
                <SelectTrigger id="wt-to">
                  <SelectValue placeholder={translate('ws_workflows.status_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {props.statuses.map((s) => (
                    <SelectItem key={s['@id']} value={s['@id'] ?? ''}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{translate('ws_workflows.allowed_roles')}</Label>
            <Select value={roleMode} onValueChange={(v) => setRoleMode(v as 'any' | 'specific' | 'none')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{translate('ws_workflows.any_role')}</SelectItem>
                <SelectItem value="specific">{translate('ws_workflows.only_selected_roles')}</SelectItem>
                <SelectItem value="none">{translate('ws_workflows.nobody_killswitch')}</SelectItem>
              </SelectContent>
            </Select>
            {roleMode === 'specific' ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {ROLES.map((r) => (
                  <label
                    key={r.value}
                    className="inline-flex items-center gap-1.5 rounded border bg-muted/30 px-2 py-1 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(r.value)}
                      onChange={(e) =>
                        setSelectedRoles((s) =>
                          e.target.checked
                            ? [...s, r.value]
                            : s.filter((x) => x !== r.value),
                        )
                      }
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wt-label">{translate('ws_workflows.label_optional')}</Label>
            <Input
              id="wt-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={translate('ws_workflows.label_placeholder')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={saving}>
            {translate('action.cancel')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : isEdit ? <Pencil className="size-4" /> : <Plus className="size-4" />}
            {isEdit ? translate('action.save') : translate('ws_workflows.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
