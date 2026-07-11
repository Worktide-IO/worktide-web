import { useOne, useUpdate } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { CustomerJsonld } from '@/api/types/customer/Jsonld';
import type { WorkspaceJsonld } from '@/api/types/workspace/Jsonld';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';

type Leg = 'response' | 'resolution';

// Built-in defaults, mirroring PortalSlaCalculator::DEFAULTS.
const PRIORITIES: { key: string; label: string; response: number; resolution: number }[] = [
  { key: 'urgent', label: 'Dringend', response: 1, resolution: 4 },
  { key: 'high', label: 'Hoch', response: 2, resolution: 8 },
  { key: 'normal', label: 'Mittel', response: 8, resolution: 48 },
  { key: 'low', label: 'Niedrig', response: 24, resolution: 120 },
];

type Vals = Record<string, { response: string; resolution: string }>;
type CustomerRow = Row<CustomerJsonld> & { slaPolicy?: Record<string, unknown> | null };

const asNum = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? String(x) : '');

function readPolicy(customer: CustomerRow | undefined): Vals {
  const sla = customer?.slaPolicy ?? {};
  const out: Vals = {};
  for (const { key } of PRIORITIES) {
    const v = sla[key];
    if (typeof v === 'number') {
      out[key] = { response: '', resolution: asNum(v) }; // legacy bare = resolution
    } else {
      const o = (v ?? {}) as { response?: unknown; resolution?: unknown };
      out[key] = { response: asNum(o.response), resolution: asNum(o.resolution) };
    }
  }
  return out;
}

/**
 * Per-customer portal SLA override (Reaktion/Lösung hours per priority),
 * layered over the workspace default (see PortalSlaCalculator). Empty = inherit;
 * the placeholder shows what would be inherited. Writes Customer.slaPolicy via
 * PATCH /v1/customers/{id} (workspace EDIT).
 */
export function CustomerSlaCard({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { result: customer, query } = useOne<CustomerRow>({ resource: 'customers', id: customerId });

  const stored = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
  const { result: workspace } = useOne<Row<WorkspaceJsonld> & { settings?: Record<string, unknown> | null }>({
    resource: 'workspaces',
    id: stored ?? '',
    queryOptions: { enabled: Boolean(stored) },
  });

  const { mutate: update, mutation } = useUpdate<CustomerRow>();
  const saving = mutation.isPending;

  const initial = readPolicy(customer);
  const [vals, setVals] = useState<Vals>({});

  useEffect(() => {
    setVals(readPolicy(customer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  if (query.isLoading || !customer) return null;

  // What this customer inherits (workspace override, else built-in default) — for the placeholder.
  const wsSla = (workspace?.settings as { portal?: { sla?: Record<string, unknown> } } | null | undefined)?.portal?.sla ?? {};
  const inherited = (key: string, leg: Leg, fallback: number): number => {
    const v = wsSla[key];
    if (typeof v === 'number') return leg === 'resolution' ? v : fallback;
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o[leg] === 'number') return o[leg] as number;
    }
    return fallback;
  };

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

    update(
      { resource: 'customers', id: customerId, values: { slaPolicy: Object.keys(sla).length ? sla : null }, successNotification: false },
      {
        onSuccess: () => toast.success(t('toast.customer_sla_saved')),
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
        <CardTitle className="text-base">{t('customer_sla.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('customer_sla.desc_before')}{' '}
          <span className="text-foreground">{t('customer_sla.desc_empty')}</span> {t('customer_sla.desc_after')}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {PRIORITIES.map((p) => (
            <div key={p.key} className="space-y-2 rounded-md border p-3">
              <div className="text-sm font-medium">{t(`customer_sla.priority_${p.key}`)}</div>
              <div className="flex items-center gap-4">
                {(['response', 'resolution'] as Leg[]).map((leg) => (
                  <div key={leg} className="flex-1 space-y-1">
                    <Label htmlFor={`cust-sla-${p.key}-${leg}`} className="text-xs text-muted-foreground">
                      {leg === 'response' ? t('customer_sla.leg_response') : t('customer_sla.leg_resolution')}
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        id={`cust-sla-${p.key}-${leg}`}
                        type="number"
                        min={0}
                        step={1}
                        value={get(p.key, leg)}
                        onChange={(e) => set(p.key, leg, e.target.value)}
                        placeholder={t('customer_sla.inherits_placeholder', { value: inherited(p.key, leg, p[leg]) })}
                        className="min-w-0 flex-1"
                      />
                      <span className="text-xs text-muted-foreground">{t('customer_sla.unit_hours')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {invalid ? <p className="text-sm text-destructive">{t('customer_sla.invalid')}</p> : null}
        <div>
          <Button type="button" onClick={handleSave} disabled={saving || !dirty || invalid}>
            {saving ? t('customer_sla.saving') : t('action.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
