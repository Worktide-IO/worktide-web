import { useInvalidate, useList } from '@refinedev/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Info, Plus, Users, Workflow as WorkflowIcon } from 'lucide-react';

import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';
import type { WorkflowTransitionJsonld } from '@/api/types/workflowTransition/Jsonld';
import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import type { TrackerJsonld } from '@/api/types/tracker/Jsonld';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

const ROLES = ['owner', 'admin', 'member', 'guest'] as const;
const BASELINE = 'baseline';

type TransitionRow = Row<WorkflowTransitionJsonld>;

/** One matrix cell: fromStatus → toStatus. Empty = create on click; existing = popover to edit roles/label/remove. */
function TransitionCell({
  transition,
  onCreate,
  onUpdate,
  onDelete,
}: {
  transition: TransitionRow | undefined;
  onCreate: () => void;
  onUpdate: (id: string, values: { allowedRoles: string[] | null; label: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [anyRoles, setAnyRoles] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [label, setLabel] = useState('');

  if (!transition) {
    return (
      <button
        type="button"
        onClick={onCreate}
        title={t('workflow.add_transition')}
        className="flex size-8 items-center justify-center rounded border border-dashed border-border text-muted-foreground/40 transition-colors hover:border-primary hover:text-primary"
      >
        <Plus className="size-3.5" />
      </button>
    );
  }

  const id = transition.id ?? transition['@id']?.split('/').pop() ?? '';
  const restricted = transition.allowedRoles != null;

  function openEditor(next: boolean) {
    if (next) {
      setAnyRoles(transition!.allowedRoles == null);
      setRoles(transition!.allowedRoles ?? []);
      setLabel(transition!.label ?? '');
    }
    setOpen(next);
  }

  function toggleRole(role: string, on: boolean) {
    setRoles((prev) => (on ? [...new Set([...prev, role])] : prev.filter((r) => r !== role)));
  }

  function save() {
    onUpdate(id, { allowedRoles: anyRoles ? null : roles, label: label.trim() || null });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={openEditor}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={transition.label ?? t('workflow.edit_transition')}
          className="relative flex size-8 items-center justify-center rounded border border-primary bg-primary/10 text-primary transition-colors hover:bg-primary/20"
        >
          <Check className="size-4" />
          {restricted ? <Users className="absolute -right-1 -top-1 size-3 rounded-full bg-background p-px text-amber-600" /> : null}
          {transition.label ? <span className="absolute -bottom-1 -right-1 size-1.5 rounded-full bg-primary" /> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{t('workflow.label_label')}</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('workflow.label_placeholder')} />
        </div>
        <div className="space-y-2">
          {/* Checkbox + label as SIBLINGS (id/htmlFor). Nesting a Radix checkbox
              inside a <label> double-fires the toggle (button click + label
              forward), which made the role state flip-flop. */}
          <div className="flex items-center gap-2">
            <Checkbox id={`any-${id}`} checked={anyRoles} onCheckedChange={(v) => setAnyRoles(v === true)} />
            <Label htmlFor={`any-${id}`} className="text-sm font-normal">{t('workflow.roles_any')}</Label>
          </div>
          {!anyRoles ? (
            <div className="space-y-1.5 rounded-md border border-border p-2">
              {ROLES.map((role) => (
                <div key={role} className="flex items-center gap-2">
                  <Checkbox
                    id={`role-${id}-${role}`}
                    checked={roles.includes(role)}
                    onCheckedChange={(v) => toggleRole(role, v === true)}
                  />
                  <Label htmlFor={`role-${id}-${role}`} className="text-sm font-normal">{t(`workflow.role_${role}`)}</Label>
                </div>
              ))}
              {roles.length === 0 ? <p className="text-xs text-amber-600">{t('workflow.roles_killswitch')}</p> : null}
              <p className="text-[11px] text-muted-foreground">{t('workflow.roles_admin_bypass')}</p>
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { onDelete(id); setOpen(false); }}>
            {t('workflow.remove_transition')}
          </Button>
          <Button size="sm" onClick={save}>{t('action.save')}</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Visual workflow editor (Phase B, layer 2): a transition matrix for the
 * status state machine. Rows = fromStatus, columns = toStatus; a cell toggles a
 * WorkflowTransition (fromStatus→toStatus) for the selected tracker (baseline =
 * null tracker). Cell popover edits allowed roles + label. Reflects the
 * backend's default-open semantics: a fromStatus with zero outgoing transitions
 * allows every move.
 */
export function WorkflowEditorPage() {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [trackerId, setTrackerId] = useState<string>(BASELINE);

  const workspaceId = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
  const workspaceIri = workspaceId ? `/v1/workspaces/${workspaceId}` : null;

  const { result: statusesR } = useList<Row<TaskStatusJsonld>>({
    resource: 'task_statuses',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });
  const statuses = useMemo(() => statusesR?.data ?? [], [statusesR]);

  const { result: trackersR } = useList<Row<TrackerJsonld>>({
    resource: 'trackers',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });
  const trackers = trackersR?.data ?? [];

  const { result: transR, query } = useList<TransitionRow>({
    resource: 'workflow_transitions',
    pagination: { mode: 'off' },
  });

  // Transitions for the selected tracker (baseline = null tracker), keyed from→to.
  const byKey = useMemo(() => {
    const isBaseline = trackerId === BASELINE;
    const m = new Map<string, TransitionRow>();
    for (const tr of transR?.data ?? []) {
      const matches = isBaseline ? tr.tracker == null : tr.tracker === trackerId;
      if (matches && tr.fromStatus && tr.toStatus) m.set(`${tr.fromStatus}=>${tr.toStatus}`, tr);
    }
    return m;
  }, [transR, trackerId]);

  const outgoing = useMemo(() => {
    const m: Record<string, number> = {};
    for (const tr of byKey.values()) if (tr.fromStatus) m[tr.fromStatus] = (m[tr.fromStatus] ?? 0) + 1;
    return m;
  }, [byKey]);

  const refresh = () => void invalidate({ resource: 'workflow_transitions', invalidates: ['list'] });

  async function create(fromIri: string, toIri: string) {
    try {
      await api.post('/workflow_transitions', {
        workspace: workspaceIri,
        tracker: trackerId === BASELINE ? null : trackerId,
        fromStatus: fromIri,
        toStatus: toIri,
      });
      refresh();
    } catch {
      toast.error(t('toast.action_failed'));
    }
  }
  async function update(id: string, values: { allowedRoles: string[] | null; label: string | null }) {
    try {
      await api.patch(`/workflow_transitions/${id}`, values, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
      });
      refresh();
    } catch {
      toast.error(t('toast.action_failed'));
    }
  }
  async function remove(id: string) {
    try {
      await api.delete(`/workflow_transitions/${id}`);
      refresh();
    } catch {
      toast.error(t('toast.action_failed'));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl">
            <WorkflowIcon className="size-6 text-muted-foreground" /> {t('workflow.page_title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('workflow.page_subtitle')}</p>
        </div>
        <Select value={trackerId} onValueChange={setTrackerId}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={BASELINE}>{t('workflow.tracker_baseline')}</SelectItem>
            {trackers.map((tr) => (
              <SelectItem key={tr['@id']} value={tr['@id'] ?? ''}>
                {tr.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>{t('workflow.default_open_hint')}</p>
      </div>

      {query?.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('app.loading')}</p>
      ) : statuses.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('workflow.no_statuses')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-background p-2 text-left align-bottom">
                  <span className="text-xs font-normal text-muted-foreground">{t('workflow.from_to')}</span>
                </th>
                {statuses.map((s) => (
                  <th key={s['@id']} className="p-2 align-bottom">
                    <div className="flex flex-col items-center gap-1">
                      <span className="size-2 rounded-full" style={{ backgroundColor: s.color ?? '#94a3b8' }} />
                      <span className="max-w-20 truncate text-xs font-medium" title={s.name}>{s.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {statuses.map((from) => {
                const fromIri = from['@id'] ?? '';
                const isOpen = (outgoing[fromIri] ?? 0) === 0;
                return (
                  <tr key={fromIri} className="border-t border-border">
                    <th className="sticky left-0 z-10 bg-background p-2 text-left">
                      <div className="flex items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: from.color ?? '#94a3b8' }} />
                        <span className="max-w-40 truncate font-medium" title={from.name}>{from.name}</span>
                        {isOpen ? <Badge variant="outline" className="text-[10px]">{t('workflow.open_badge')}</Badge> : null}
                      </div>
                    </th>
                    {statuses.map((to) => {
                      const toIri = to['@id'] ?? '';
                      if (fromIri === toIri) {
                        return <td key={toIri} className="p-1.5 text-center text-muted-foreground/40">—</td>;
                      }
                      const transition = byKey.get(`${fromIri}=>${toIri}`);
                      return (
                        <td key={toIri} className="p-1.5 text-center">
                          <div className="flex justify-center">
                            <TransitionCell
                              transition={transition}
                              onCreate={() => create(fromIri, toIri)}
                              onUpdate={update}
                              onDelete={remove}
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
