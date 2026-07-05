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

type Leg = 'response' | 'resolution';

// priority key · label · built-in defaults (mirror PortalSlaCalculator::DEFAULTS).
const PRIORITIES: { key: string; label: string; response: number; resolution: number }[] = [
  { key: 'urgent', label: 'Dringend', response: 1, resolution: 4 },
  { key: 'high', label: 'Hoch', response: 2, resolution: 8 },
  { key: 'normal', label: 'Mittel', response: 8, resolution: 48 },
  { key: 'low', label: 'Niedrig', response: 24, resolution: 120 },
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
        onSuccess: () => toast.success('SLA-Richtlinie gespeichert.'),
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
        <CardTitle>SLA-Reaktionszeiten</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Ziel-Zeiten je Ticket-Priorität, in Stunden ab Ticket-Erstellung: <b>Reaktion</b> (erste
          Agentur-Antwort) und <b>Lösung</b> (Ticket erledigt). Bestimmt die SLA-Anzeige im Portal.{' '}
          <span className="text-foreground">Leer</span> = Standardwert,{' '}
          <span className="text-foreground">0</span> = keine SLA. Kunden mit eigenem SLA übersteuern das.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {PRIORITIES.map((p) => (
            <div key={p.key} className="space-y-2 rounded-md border p-3">
              <div className="text-sm font-medium">{p.label}</div>
              <div className="flex items-center gap-4">
                {(['response', 'resolution'] as Leg[]).map((leg) => (
                  <div key={leg} className="flex-1 space-y-1">
                    <Label htmlFor={`sla-${p.key}-${leg}`} className="text-xs text-muted-foreground">
                      {leg === 'response' ? 'Reaktion' : 'Lösung'}
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
                      <span className="text-xs text-muted-foreground">Std.</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {invalid ? <p className="text-sm text-destructive">Bitte nur ganze Zahlen ≥ 0 eingeben.</p> : null}
        <div>
          <Button type="button" onClick={handleSave} disabled={saving || !dirty || invalid}>
            {saving ? 'Speichere…' : 'Speichern'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
