import { useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ConciergeBell, Loader2, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import {
  SERVICE_ASSIGNMENT_STATUS_BADGE,
  SERVICE_BILLING_LABEL,
  toDateInput,
  type ServiceAssignmentJsonld,
  type ServiceAssignmentStatus,
  type ServiceJsonld,
  type ServiceVersionJsonld,
} from '@/lib/services';
import type { Row } from '@/lib/refine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

type EditState = {
  existing?: Row<ServiceAssignmentJsonld>;
  serviceIri: string;
  serviceVersionIri: string;
  status: ServiceAssignmentStatus;
  startedOn: string;
  endedOn: string;
  notes: string;
  /** Net price in cents — prefilled from the picked version, editable as an override. */
  priceCents: number;
};

/**
 * Services assigned to a customer, each pinned to a specific ServiceVersion.
 * Assign a catalogue service (picking one of its versions), optionally
 * overriding the version's net price. Writes go straight through axios to
 * `service_assignments` (POST / merge-patch).
 */
export function CustomerServicesTab({ customerIri }: { customerIri: string }) {
  const { t } = useTranslation();
  const { result: assignments, query: assignmentsQuery } = useList<Row<ServiceAssignmentJsonld>>({
    resource: 'service_assignments',
    filters: [{ field: 'customer', operator: 'eq', value: customerIri }],
    pagination: { mode: 'off' },
    queryOptions: { enabled: Boolean(customerIri) },
  });
  const { result: services } = useList<Row<ServiceJsonld>>({
    resource: 'services',
    pagination: { mode: 'off' },
  });
  const { result: versions } = useList<Row<ServiceVersionJsonld>>({
    resource: 'service_versions',
    pagination: { mode: 'off' },
  });

  const serviceByIri = useMemo(() => {
    const m: Record<string, Row<ServiceJsonld>> = {};
    for (const s of services?.data ?? []) if (s['@id']) m[s['@id']] = s;
    return m;
  }, [services]);
  const versionByIri = useMemo(() => {
    const m: Record<string, Row<ServiceVersionJsonld>> = {};
    for (const v of versions?.data ?? []) if (v['@id']) m[v['@id']] = v;
    return m;
  }, [versions]);
  const versionsByService = useMemo(() => {
    const m: Record<string, Row<ServiceVersionJsonld>[]> = {};
    for (const v of versions?.data ?? []) {
      if (v.service) (m[v.service] ??= []).push(v);
    }
    return m;
  }, [versions]);

  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const workspaceIri = (() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    return id ? `/v1/workspaces/${id}` : undefined;
  })();

  const openAssign = () =>
    setEdit({
      serviceIri: '',
      serviceVersionIri: '',
      status: 'active',
      startedOn: new Date().toISOString().slice(0, 10),
      endedOn: '',
      notes: '',
      priceCents: 0,
    });

  const openEdit = (sa: Row<ServiceAssignmentJsonld>) => {
    const version = sa.serviceVersion ? versionByIri[sa.serviceVersion] : undefined;
    setEdit({
      existing: sa,
      serviceIri: version?.service ?? '',
      serviceVersionIri: sa.serviceVersion ?? '',
      status: (sa.status ?? 'active') as ServiceAssignmentStatus,
      startedOn: toDateInput(sa.startedOn),
      endedOn: toDateInput(sa.endedOn),
      notes: sa.notes ?? '',
      priceCents: sa.netPriceOverrideCents ?? version?.netPriceCents ?? 0,
    });
  };

  const editVersion = edit ? versionByIri[edit.serviceVersionIri] : undefined;
  const editCurrency = editVersion?.currency ?? 'eur';

  // Major-unit binding for the price-override input.
  const priceMajor = edit ? (edit.priceCents / 100).toFixed(2) : '0.00';
  const handlePriceChange = (raw: string) => {
    if (!edit) return;
    const n = Number.parseFloat(raw.replace(',', '.'));
    if (Number.isFinite(n)) setEdit({ ...edit, priceCents: Math.round(n * 100) });
    else if (raw === '') setEdit({ ...edit, priceCents: 0 });
  };

  const save = async () => {
    if (!edit) return;
    if (!edit.serviceIri) {
      toast.error(t('toast.select_product'));
      return;
    }
    if (!edit.serviceVersionIri) {
      toast.error(t('toast.select_version'));
      return;
    }
    setSaving(true);
    try {
      const versionPrice = editVersion?.netPriceCents ?? 0;
      const overrideCents = edit.priceCents === versionPrice ? null : edit.priceCents;
      const body = {
        serviceVersion: edit.serviceVersionIri,
        status: edit.status,
        startedOn: edit.startedOn || null,
        endedOn: edit.endedOn || null,
        notes: edit.notes || null,
        netPriceOverrideCents: overrideCents,
      };
      if (edit.existing?.id) {
        await api.patch(`/service_assignments/${edit.existing.id}`, body, {
          headers: { 'Content-Type': 'application/merge-patch+json' },
        });
      } else {
        await api.post('/service_assignments', {
          customer: customerIri,
          workspace: workspaceIri,
          ...body,
        });
      }
      toast.success(t('toast.saved'));
      setEdit(null);
      await assignmentsQuery.refetch();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { detail?: string; description?: string } } })?.response?.data
          ?.detail ?? t('customer_services.err_save');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const rows = assignments?.data ?? [];
  const isLoading = assignmentsQuery.isLoading;
  const catalog = services?.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <ConciergeBell className="size-4 text-muted-foreground" /> {t('customer_services.heading')}
        </CardTitle>
        <Button type="button" size="sm" onClick={openAssign} disabled={catalog.length === 0}>
          <Plus className="size-4" /> {t('customer_services.assign')}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('customer_services.empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('customer_services.col_service')}</TableHead>
                <TableHead className="w-28">{t('customer_services.col_version')}</TableHead>
                <TableHead className="w-28">{t('customer_services.col_status')}</TableHead>
                <TableHead className="w-28 text-right">{t('customer_services.col_price')}</TableHead>
                <TableHead className="w-32">{t('customer_services.col_started')}</TableHead>
                <TableHead className="w-28">{t('customer_services.col_next')}</TableHead>
                <TableHead className="w-24 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((sa) => {
                const version = sa.serviceVersion ? versionByIri[sa.serviceVersion] : undefined;
                const service = version?.service ? serviceByIri[version.service] : undefined;
                const badge =
                  SERVICE_ASSIGNMENT_STATUS_BADGE[(sa.status ?? 'active') as ServiceAssignmentStatus];
                return (
                  <TableRow key={sa['@id']}>
                    <TableCell className="font-medium">{service?.name ?? '—'}</TableCell>
                    <TableCell className="text-sm">
                      {version ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-mono">v{version.versionNo}</span>
                          <span className="text-xs text-muted-foreground">
                            {t(SERVICE_BILLING_LABEL[version.billingCycle ?? 'monthly'])}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badge.variant} className="text-[10px]">
                        {t(badge.label)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatMoney(sa.effectivePriceCents ?? 0, version?.currency ?? 'eur')}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {sa.startedOn ? new Date(sa.startedOn).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {sa.nextBillingOn ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <CalendarDays className="size-3" />
                          {new Date(sa.nextBillingOn).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7"
                        onClick={() => openEdit(sa)}
                      >
                        <Pencil className="size-3" /> {t('action.edit')}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={edit !== null} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {edit?.existing
                ? t('customer_services.dialog_edit_title')
                : t('customer_services.dialog_assign_title')}
            </DialogTitle>
            <DialogDescription>{t('customer_services.dialog_description')}</DialogDescription>
          </DialogHeader>

          {edit ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('customer_services.select_service')}</Label>
                <Select
                  value={edit.serviceIri}
                  disabled={!!edit.existing}
                  onValueChange={(v) => setEdit({ ...edit, serviceIri: v, serviceVersionIri: '' })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('customer_services.select_service')} />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.map((s) => (
                      <SelectItem key={s['@id']} value={s['@id'] ?? ''}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t('customer_services.select_version')}</Label>
                <Select
                  value={edit.serviceVersionIri}
                  onValueChange={(v) => {
                    const version = versionByIri[v];
                    setEdit({
                      ...edit,
                      serviceVersionIri: v,
                      // Prefill the price with the picked version's net price.
                      priceCents: version?.netPriceCents ?? 0,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('customer_services.select_version')} />
                  </SelectTrigger>
                  <SelectContent>
                    {(versionsByService[edit.serviceIri] ?? [])
                      .slice()
                      .sort((a, b) => (b.versionNo ?? 0) - (a.versionNo ?? 0))
                      .map((v) => (
                        <SelectItem key={v['@id']} value={v['@id'] ?? ''}>
                          v{v.versionNo}
                          {v.label ? ` · ${v.label}` : ''} —{' '}
                          {formatMoney(v.netPriceCents ?? 0, v.currency ?? 'eur')}
                          {v.isCurrent ? ` ${t('customer_services.current_suffix')}` : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sa-price">{t('customer_services.price_override')}</Label>
                <Input
                  id="sa-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceMajor}
                  onChange={(e) => handlePriceChange(e.target.value)}
                  className="font-mono tabular-nums"
                  disabled={!edit.serviceVersionIri}
                />
                <p className="text-xs text-muted-foreground">
                  {t('customer_services.price_override_hint')} {formatMoney(edit.priceCents, editCurrency)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('customer_services.status')}</Label>
                  <Select
                    value={edit.status}
                    onValueChange={(v) => setEdit({ ...edit, status: v as ServiceAssignmentStatus })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">{t('customer_services.status_trial')}</SelectItem>
                      <SelectItem value="active">{t('customer_services.status_active')}</SelectItem>
                      <SelectItem value="paused">{t('customer_services.status_paused')}</SelectItem>
                      <SelectItem value="cancelled">
                        {t('customer_services.status_cancelled')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sa-started">{t('customer_services.started_on')}</Label>
                  <Input
                    id="sa-started"
                    type="date"
                    value={edit.startedOn}
                    onChange={(e) => setEdit({ ...edit, startedOn: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sa-ended">{t('customer_services.ended_on')}</Label>
                <Input
                  id="sa-ended"
                  type="date"
                  value={edit.endedOn}
                  onChange={(e) => setEdit({ ...edit, endedOn: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sa-notes">{t('customer_services.notes')}</Label>
                <Input
                  id="sa-notes"
                  value={edit.notes}
                  onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEdit(null)} disabled={saving}>
              {t('action.cancel')}
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
