import { useList, useInvalidate } from '@refinedev/core';
import { intlLocale } from '@/lib/intl';
import { useTranslation } from 'react-i18next';
import { useForm } from '@refinedev/react-hook-form';
import { ArrowLeft, Loader2, Plus, Save, Tag } from 'lucide-react';
import { useState } from 'react';
import { Controller, type FieldValues } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import {
  releaseServiceVersion,
  SERVICE_BILLING_CYCLES,
  SERVICE_BILLING_LABEL,
  type ServiceBillingCycle,
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
import { Textarea } from '@/components/ui/textarea';

const CURRENCIES = [
  { value: 'eur', label: 'EUR' },
  { value: 'chf', label: 'CHF' },
  { value: 'usd', label: 'USD' },
  { value: 'gbp', label: 'GBP' },
];

type Mode = { action: 'create' } | { action: 'edit'; id: string };

/**
 * Shared create + edit form for a catalogue Service. Deliberately simple —
 * only name/description/category/active. Prices live on ServiceVersions,
 * published through the versions card below (edit mode only).
 */
export function ServiceForm(props: Mode) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const isEdit = props.action === 'edit';

  const {
    refineCore: { onFinish, formLoading, query },
    register,
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<Row<ServiceJsonld>>({
    refineCoreProps: {
      resource: 'services',
      action: props.action,
      id: isEdit ? props.id : undefined,
      redirect: 'list',
    },
    defaultValues: { active: true } as Partial<Row<ServiceJsonld>> & FieldValues,
  });

  const current = query?.data?.data as Row<ServiceJsonld> | undefined;
  const serviceIri = current?.['@id'];

  const workspaceIri = (() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    return id ? `/v1/workspaces/${id}` : undefined;
  })();

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleSubmit((values) => onFinish({ ...values, workspace: workspaceIri }))}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" size="icon" onClick={() => navigate('/services')}>
              <ArrowLeft className="size-4" />
            </Button>
            <h2 className="text-2xl">
              {isEdit ? (current?.name ?? t('action.edit')) : t('service_form.new_in_catalog')}
            </h2>
          </div>
          <Button type="submit" disabled={isSubmitting || formLoading}>
            <Save className="size-4" /> {t('action.save')}
          </Button>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-1.5">
              <Label htmlFor="name">{t('service_form.name')}</Label>
              <Input id="name" {...register('name', { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">{t('service_form.description')}</Label>
              <Textarea id="description" rows={3} {...register('description')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="category">{t('service_form.category')}</Label>
                <Input id="category" {...register('category')} />
              </div>
              <div className="flex items-center justify-between rounded-md border border-input p-3">
                <Label htmlFor="active">{t('service_form.active')}</Label>
                <Controller
                  name="active"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="active"
                      checked={field.value !== false}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </form>

      {isEdit && serviceIri ? (
        <ServiceVersionsCard
          serviceId={props.id}
          serviceIri={serviceIri}
          onChange={() => invalidate({ resource: 'services', invalidates: ['detail'], id: props.id })}
        />
      ) : null}
    </div>
  );
}

/** Versions list + release dialog for a service (edit mode). */
function ServiceVersionsCard({
  serviceId,
  serviceIri,
  onChange,
}: {
  serviceId: string;
  serviceIri: string;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const { result: versions, query } = useList<Row<ServiceVersionJsonld>>({
    resource: 'service_versions',
    filters: [{ field: 'service', operator: 'eq', value: serviceIri }],
    sorters: [{ field: 'versionNo', order: 'desc' }],
    pagination: { mode: 'off' },
  });

  const [open, setOpen] = useState(false);
  const [priceCents, setPriceCents] = useState(0);
  const [currency, setCurrency] = useState('eur');
  const [billingCycle, setBillingCycle] = useState<ServiceBillingCycle>('monthly');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  // The backend keeps cents; the dialog binds a human-friendly major-unit
  // string via a virtual `priceMajor` (type "280,00" → persist 28000).
  const priceMajor = (priceCents / 100).toFixed(2);
  const handlePriceChange = (raw: string) => {
    const n = Number.parseFloat(raw.replace(',', '.'));
    if (Number.isFinite(n)) setPriceCents(Math.round(n * 100));
    else if (raw === '') setPriceCents(0);
  };

  const submit = async () => {
    setSaving(true);
    try {
      await releaseServiceVersion(serviceId, {
        netPriceCents: priceCents,
        currency,
        billingCycle,
        label: label.trim() || null,
      });
      toast.success(t('toast.saved'));
      setOpen(false);
      setPriceCents(0);
      setCurrency('eur');
      setBillingCycle('monthly');
      setLabel('');
      await query.refetch();
      onChange();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Release fehlgeschlagen.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const rows = versions?.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Tag className="size-4 text-muted-foreground" /> {t('service_form.versions')}
        </CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> {t('service_form.release')}
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('service_form.no_versions')}
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((v) => (
              <li key={v['@id']} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2 text-sm">
                  <span className="font-mono">v{v.versionNo}</span>
                  {v.label ? <span className="text-muted-foreground">{v.label}</span> : null}
                  {v.isCurrent ? (
                    <Badge variant="default" className="text-[10px]">
                      {t('service_form.current_suffix')}
                    </Badge>
                  ) : null}
                  <Badge variant="secondary" className="text-[10px]">
                    {t(SERVICE_BILLING_LABEL[v.billingCycle ?? 'monthly'])}
                  </Badge>
                </span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">
                    {formatMoney(v.netPriceCents ?? 0, v.currency ?? 'eur')}
                  </span>
                  <span>
                    {v.effectiveFrom
                      ? new Date(v.effectiveFrom).toLocaleDateString(intlLocale())
                      : '—'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('service_form.publish_new_version')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sv-price">{t('service_form.net_price')}</Label>
                <Input
                  id="sv-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceMajor}
                  onChange={(e) => handlePriceChange(e.target.value)}
                  className="font-mono tabular-nums"
                />
                <p className="text-xs text-muted-foreground tabular-nums">
                  = {formatMoney(priceCents, currency)}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sv-currency">{t('service_form.currency')}</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="sv-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sv-cycle">{t('service_form.billing_cycle')}</Label>
                <Select
                  value={billingCycle}
                  onValueChange={(v) => setBillingCycle(v as ServiceBillingCycle)}
                >
                  <SelectTrigger id="sv-cycle">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_BILLING_CYCLES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(SERVICE_BILLING_LABEL[c])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sv-label">{t('service_form.label')}</Label>
              <Input id="sv-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">{t('service_form.release_hint')}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              {t('action.cancel')}
            </Button>
            <Button type="button" onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('service_form.publish_new_version')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
