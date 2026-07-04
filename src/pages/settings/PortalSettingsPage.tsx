import { useList, useOne, useUpdate } from '@refinedev/core';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { WorkspaceJsonld } from '@/api/types/workspace/Jsonld';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  return (
    <SettingsLayout>
      <div>
        <h2 className="text-2xl">Kundenportal</h2>
        <p className="text-sm text-muted-foreground">
          Konfiguration des Kundenportals für diesen Mandanten — nur Workspace-Admins können speichern.
        </p>
      </div>
      <PortalSlaCard />
    </SettingsLayout>
  );
}

// priority key · label · built-in default hours (mirrors PortalSlaCalculator::DEFAULT_HOURS).
const PRIORITIES: { key: string; label: string; fallback: number }[] = [
  { key: 'urgent', label: 'Dringend', fallback: 2 },
  { key: 'high', label: 'Hoch', fallback: 4 },
  { key: 'normal', label: 'Mittel', fallback: 24 },
  { key: 'low', label: 'Niedrig', fallback: 72 },
];

type SlaMap = Record<string, unknown>;

function readSla(workspace: { settings?: Record<string, unknown> | null } | undefined): Record<string, string> {
  const portal = (workspace?.settings as { portal?: { sla?: SlaMap } } | null | undefined)?.portal;
  const sla = portal?.sla ?? {};
  const out: Record<string, string> = {};
  for (const { key } of PRIORITIES) {
    const v = sla[key];
    out[key] = typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
  }
  return out;
}

function PortalSlaCard() {
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
  const [hours, setHours] = useState<Record<string, string>>({});

  useEffect(() => {
    setHours(readSla(workspace));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  if (!id || query.isLoading || !workspace) {
    return null;
  }

  const dirty = PRIORITIES.some(({ key }) => (hours[key] ?? '') !== (initial[key] ?? ''));
  const invalid = PRIORITIES.some(({ key }) => {
    const raw = (hours[key] ?? '').trim();
    if (raw === '') return false;
    const n = Number(raw);
    return !Number.isInteger(n) || n < 0;
  });

  const handleSave = () => {
    // Build the override map: only non-empty, valid entries are written.
    const sla: Record<string, number> = {};
    for (const { key } of PRIORITIES) {
      const raw = (hours[key] ?? '').trim();
      if (raw === '') continue;
      const n = Number(raw);
      if (Number.isInteger(n) && n >= 0) sla[key] = n;
    }

    const prev = (workspace.settings as Record<string, unknown> | null | undefined) ?? {};
    const prevPortal = (prev['portal'] as Record<string, unknown> | undefined) ?? {};
    const nextSettings = {
      ...prev,
      portal: { ...prevPortal, sla },
    };

    update(
      { resource: 'workspaces', id, values: { settings: nextSettings }, successNotification: false },
      {
        onSuccess: () => toast.success('SLA-Richtlinie gespeichert.'),
        onError: (err) => {
          const status = (err as { response?: { status?: number } })?.response?.status;
          toast.error(
            status === 403
              ? 'Keine Berechtigung — nur Admins können die SLA-Richtlinie ändern.'
              : 'Konnte nicht speichern.',
          );
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>SLA-Reaktionszeiten</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Ziel-Reaktionszeit je Ticket-Priorität, in Stunden ab Ticket-Erstellung. Bestimmt die
          SLA-Spalte im Portal. <span className="text-foreground">Leer</span> = Standardwert,{' '}
          <span className="text-foreground">0</span> = keine SLA für diese Priorität.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PRIORITIES.map(({ key, label, fallback }) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`sla-${key}`}>{label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`sla-${key}`}
                  type="number"
                  min={0}
                  step={1}
                  value={hours[key] ?? ''}
                  onChange={(e) => setHours((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={`Standard: ${fallback}`}
                  className="min-w-0 flex-1"
                />
                <span className="text-sm text-muted-foreground">Std.</span>
              </div>
            </div>
          ))}
        </div>
        {invalid ? (
          <p className="text-sm text-destructive">Bitte nur ganze Zahlen ≥ 0 eingeben.</p>
        ) : null}
        <div>
          <Button type="button" onClick={handleSave} disabled={saving || !dirty || invalid}>
            {saving ? 'Speichere…' : 'Speichern'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
