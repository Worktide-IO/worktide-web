import { useList, useOne, useUpdate } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import type { WorkspaceJsonld } from '@/api/types/workspace/Jsonld';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';

import { SettingsLayout } from './SettingsLayout';

/**
 * `/settings/portal` — customer-portal configuration for the active tenant.
 * Today: the response-time SLA policy per ticket priority, stored under
 * `settings.portal.sla` ({priority: hours}) which the portal's
 * PortalSlaCalculator reads. Save hits PATCH /v1/workspaces/{id}
 * (WorkspaceVoter EDIT — Owner/Admin), same as the other workspace cards.
 */
export function PortalSettingsPage() {
  const { t } = useTranslation();
  return (
    <SettingsLayout>
      <div>
        <h2 className="text-2xl">{t('portal_settings.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('portal_settings.subtitle')}
        </p>
      </div>
      <PortalWelcomeTextCard />
      <PortalSlaCard />
      <PortalWaitingStatusesCard />
    </SettingsLayout>
  );
}

/**
 * Editable greeting included in the portal invitation email (set-password link).
 * Stored under settings.portal.welcomeText and saved via PATCH /v1/workspaces/{id}.
 */
function PortalWelcomeTextCard() {
  const { t } = useTranslation();
  const stored = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
  const { result: workspaces } = useList<Row<WorkspaceJsonld>>({
    resource: 'workspaces',
    pagination: { mode: 'off' },
    queryOptions: { enabled: !stored },
  });
  const id = stored ?? workspaces?.data?.[0]?.id ?? null;
  const { result: workspace, query } = useOne<
    Row<WorkspaceJsonld> & { settings?: Record<string, unknown> | null }
  >({
    resource: 'workspaces',
    id: id ?? '',
    queryOptions: { enabled: Boolean(id) },
  });
  const { mutate: update, mutation } = useUpdate<Row<WorkspaceJsonld>>();

  const initial =
    (
      workspace?.settings as { portal?: { welcomeText?: string } } | null | undefined
    )?.portal?.welcomeText ?? '';
  const [text, setText] = useState('');

  useEffect(() => {
    setText(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  if (!id || query.isLoading || !workspace) return null;

  const dirty = text.trim() !== initial.trim();

  const save = () => {
    const prev = (workspace.settings as Record<string, unknown> | null | undefined) ?? {};
    const prevPortal = (prev['portal'] as Record<string, unknown> | undefined) ?? {};
    update(
      {
        resource: 'workspaces',
        id,
        values: { settings: { ...prev, portal: { ...prevPortal, welcomeText: text.trim() } } },
        successNotification: false,
      },
      {
        onSuccess: () => toast.success(t('toast.welcome_text_saved')),
        onError: (err) => {
          const status = (err as { response?: { status?: number } })?.response?.status;
          toast.error(status === 403 ? t('toast.no_permission') : t('toast.could_not_save'));
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('portal_settings.welcome_title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t('portal_settings.welcome_hint')}
        </p>
        <Textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('portal_settings.welcome_placeholder')}
        />
        <div className="flex justify-end">
          <Button onClick={save} disabled={!dirty || mutation.isPending}>
            {t('action.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// The serializer strips the `is` prefix, so the API exposes `waitingForCustomer`/`completed`.
type TaskStatusRow = Row<TaskStatusJsonld> & { waitingForCustomer?: boolean; completed?: boolean };

/**
 * Marks which task statuses mean "waiting on the customer". Tickets in such a
 * status pause their portal SLA and surface under the "Wartet auf mich" filter.
 * Toggles TaskStatus.isWaitingForCustomer via PATCH /v1/task_statuses/{id}.
 */
function PortalWaitingStatusesCard() {
  const { t } = useTranslation();
  const { result, query } = useList<TaskStatusRow>({
    resource: 'task_statuses',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });
  const { mutate: update } = useUpdate<TaskStatusRow>();
  const [pending, setPending] = useState<Record<string, boolean>>({});

  if (query.isLoading) return null;
  const statuses = (result?.data ?? []).filter((s) => !s.completed);
  const isOn = (s: TaskStatusRow) => pending[String(s.id)] ?? Boolean(s.waitingForCustomer);

  const toggle = (s: TaskStatusRow, v: boolean) => {
    const sid = String(s.id);
    setPending((p) => ({ ...p, [sid]: v }));
    update(
      { resource: 'task_statuses', id: sid, values: { waitingForCustomer: v }, successNotification: false },
      {
        onSuccess: () => toast.success(t('toast.status_updated')),
        onError: (err) => {
          setPending((p) => {
            const n = { ...p };
            delete n[sid];
            return n;
          });
          const code = (err as { response?: { status?: number } })?.response?.status;
          toast.error(code === 403 ? t('toast.no_permission') : t('toast.could_not_save'));
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('portal_settings.waiting_title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t('portal_settings.waiting_hint')}
        </p>
        {statuses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('portal_settings.no_statuses')}</p>
        ) : (
          <div className="divide-y">
            {statuses.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2">
                <span className="text-sm">{s.name}</span>
                <Switch checked={isOn(s)} onCheckedChange={(v) => toggle(s, v)} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type Leg = 'response' | 'resolution';

// priority key · label · built-in defaults (mirror PortalSlaCalculator::DEFAULTS).
const PRIORITIES: { key: string; label: string; response: number; resolution: number }[] = [
  { key: 'urgent', label: 'priority.urgent', response: 1, resolution: 4 },
  { key: 'high', label: 'priority.high', response: 2, resolution: 8 },
  { key: 'normal', label: 'portal_settings.priority_normal', response: 8, resolution: 48 },
  { key: 'low', label: 'priority.low', response: 24, resolution: 120 },
];

type Vals = Record<string, { response: string; resolution: string }>;

function readSla(workspace: { settings?: Record<string, unknown> | null } | undefined): Vals {
  const sla = (workspace?.settings as { portal?: { sla?: Record<string, unknown> } } | null | undefined)?.portal?.sla ?? {};
  const out: Vals = {};
  for (const { key } of PRIORITIES) {
    const v = sla[key];
    // Structured {response, resolution}; a bare number is legacy = resolution.
    const asNum = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? String(x) : '');
    if (typeof v === 'number') {
      out[key] = { response: '', resolution: asNum(v) };
    } else {
      const o = (v ?? {}) as { response?: unknown; resolution?: unknown };
      out[key] = { response: asNum(o.response), resolution: asNum(o.resolution) };
    }
  }
  return out;
}

function PortalSlaCard() {
  const { t } = useTranslation();
  const stored = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
  const { result: workspaces } = useList<Row<WorkspaceJsonld>>({
    resource: 'workspaces',
    pagination: { mode: 'off' },
    queryOptions: { enabled: !stored },
  });
  const id = stored ?? workspaces?.data?.[0]?.id ?? null;
  const { result: workspace, query } = useOne<Row<WorkspaceJsonld> & { settings?: Record<string, unknown> | null }>({
    resource: 'workspaces',
    id: id ?? '',
    queryOptions: { enabled: Boolean(id) },
  });
  const { mutate: update, mutation } = useUpdate<Row<WorkspaceJsonld>>();
  const saving = mutation.isPending;

  const initial = readSla(workspace);
  const [vals, setVals] = useState<Vals>({});

  useEffect(() => {
    setVals(readSla(workspace));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  if (!id || query.isLoading || !workspace) {
    return null;
  }

  const get = (key: string, leg: Leg) => vals[key]?.[leg] ?? '';
  const set = (key: string, leg: Leg, v: string) =>
    setVals((p) => ({ ...p, [key]: { ...(p[key] ?? { response: '', resolution: '' }), [leg]: v } }));

  const dirty = PRIORITIES.some(({ key }) =>
    (['response', 'resolution'] as Leg[]).some((leg) => get(key, leg) !== (initial[key]?.[leg] ?? '')),
  );
  const invalid = PRIORITIES.some(({ key }) =>
    (['response', 'resolution'] as Leg[]).some((leg) => {
      const raw = get(key, leg).trim();
      if (raw === '') return false;
      const n = Number(raw);
      return !Number.isInteger(n) || n < 0;
    }),
  );

  const handleSave = () => {
    const sla: Record<string, { response?: number; resolution?: number }> = {};
    for (const { key } of PRIORITIES) {
      const entry: { response?: number; resolution?: number } = {};
      for (const leg of ['response', 'resolution'] as Leg[]) {
        const raw = get(key, leg).trim();
        if (raw === '') continue;
        const n = Number(raw);
        if (Number.isInteger(n) && n >= 0) entry[leg] = n;
      }
      if (Object.keys(entry).length > 0) sla[key] = entry;
    }

    const prev = (workspace.settings as Record<string, unknown> | null | undefined) ?? {};
    const prevPortal = (prev['portal'] as Record<string, unknown> | undefined) ?? {};
    update(
      { resource: 'workspaces', id, values: { settings: { ...prev, portal: { ...prevPortal, sla } } }, successNotification: false },
      {
        onSuccess: () => toast.success(t('toast.sla_policy_saved')),
        onError: (err) => {
          const status = (err as { response?: { status?: number } })?.response?.status;
          toast.error(
            status === 403 ? 'Keine Berechtigung — nur Admins können die SLA-Richtlinie ändern.' : 'Konnte nicht speichern.',
          );
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('portal_settings.sla_title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('portal_settings.sla_desc_1')} <b>{t('portal_settings.sla_response')}</b> {t('portal_settings.sla_desc_2')} <b>{t('portal_settings.sla_resolution')}</b> {t('portal_settings.sla_desc_3')}{' '}
          <span className="text-foreground">{t('portal_settings.sla_empty')}</span> {t('portal_settings.sla_desc_4')}{' '}
          <span className="text-foreground">0</span> {t('portal_settings.sla_desc_5')}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {PRIORITIES.map((p) => (
            <div key={p.key} className="space-y-2 rounded-md border p-3">
              <div className="text-sm font-medium">{t(p.label)}</div>
              <div className="flex items-center gap-4">
                {(['response', 'resolution'] as Leg[]).map((leg) => (
                  <div key={leg} className="flex-1 space-y-1">
                    <Label htmlFor={`sla-${p.key}-${leg}`} className="text-xs text-muted-foreground">
                      {leg === 'response' ? t('portal_settings.sla_response') : t('portal_settings.sla_resolution')}
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        id={`sla-${p.key}-${leg}`}
                        type="number"
                        min={0}
                        step={1}
                        value={get(p.key, leg)}
                        onChange={(e) => set(p.key, leg, e.target.value)}
                        placeholder={String(p[leg])}
                        className="min-w-0 flex-1"
                      />
                      <span className="text-xs text-muted-foreground">{t('portal_settings.hours_short')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {invalid ? <p className="text-sm text-destructive">{t('portal_settings.invalid_int')}</p> : null}
        <div>
          <Button type="button" onClick={handleSave} disabled={saving || !dirty || invalid}>
            {saving ? t('portal_settings.saving') : t('action.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
