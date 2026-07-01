import { useList, useNavigation } from '@refinedev/core';
import { useForm } from '@refinedev/react-hook-form';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { Controller, type FieldValues } from 'react-hook-form';
import { useNavigate } from 'react-router';

import type { CustomerSystemJsonld } from '@/api/types/customerSystem/Jsonld';
import type { ServiceSubscriptionJsonld } from '@/api/types/serviceSubscription/Jsonld';
import { formatMoney } from '@/lib/money';
import { CustomerCombobox } from '@/components/CustomerCombobox';
import type { Row } from '@/lib/refine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

const BILLING_CYCLES = [
  { value: 'monthly', label: 'Monatlich' },
  { value: 'quarterly', label: 'Quartalsweise' },
  { value: 'half_yearly', label: 'Halbjährlich' },
  { value: 'yearly', label: 'Jährlich' },
  { value: 'once', label: 'Einmalig' },
];

const STATUSES = [
  { value: 'trial', label: 'Trial' },
  { value: 'active', label: 'Aktiv' },
  { value: 'paused', label: 'Pausiert' },
  { value: 'cancelled', label: 'Gekündigt' },
];

const CURRENCIES = [
  { value: 'eur', label: 'EUR' },
  { value: 'chf', label: 'CHF' },
  { value: 'usd', label: 'USD' },
  { value: 'gbp', label: 'GBP' },
];

type Mode = { action: 'create' } | { action: 'edit'; id: string };

/**
 * Shared create + edit form for ServiceSubscription.
 *
 * The Customer picker is required; the CustomerSystem picker cascades —
 * only shows systems whose `customer` matches the picked customer (so
 * an Acme retainer can't accidentally be attached to a Globex system).
 * Leaving the system blank is fine — that's how customer-wide
 * subscriptions (e.g. "Premium Retainer 10h") are modelled.
 *
 * Price input is a plain number field in EUR (or selected currency)
 * with two decimals — converted to integer cents on submit so the
 * backend's `priceCents` validator stays happy and rounding never
 * accumulates float drift.
 */
export function SubscriptionForm(props: Mode) {
  const navigate = useNavigate();
  const { show } = useNavigation();
  void show;

  const {
    refineCore: { onFinish, formLoading, query },
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<Row<ServiceSubscriptionJsonld>>({
    refineCoreProps: {
      resource: 'service_subscriptions',
      action: props.action,
      id: props.action === 'edit' ? props.id : undefined,
      redirect: 'list',
    },
    defaultValues: {
      currency: 'eur',
      billingCycle: 'monthly',
      status: 'active',
      autoRenew: true,
      priceCents: 0,
      startedOn: new Date().toISOString().slice(0, 10),
    } as Partial<Row<ServiceSubscriptionJsonld>> as FieldValues,
  });

  const { result: systems } = useList<Row<CustomerSystemJsonld>>({
    resource: 'customer_systems',
    pagination: { mode: 'off' },
  });

  const selectedCustomer = watch('customer') as string | undefined;
  const filteredSystems = useMemo(
    () => (systems?.data ?? []).filter((s) => !selectedCustomer || s.customer === selectedCustomer),
    [systems, selectedCustomer],
  );

  const priceCents = watch('priceCents') as number | undefined;
  const currency = (watch('currency') as string | undefined) ?? 'eur';

  const isLoading = props.action === 'edit' && query?.isLoading;
  const current = query?.data?.data;

  // The backend keeps cents; the form binds a human-friendly EUR-string.
  // We mediate via a virtual `priceMajor` so the user types "280,00" and
  // we persist 28000.
  const priceMajor = ((priceCents ?? 0) / 100).toFixed(2);
  const handlePriceChange = (raw: string) => {
    const normalised = raw.replace(',', '.');
    const n = Number.parseFloat(normalised);
    if (Number.isFinite(n)) {
      setValue('priceCents', Math.round(n * 100), { shouldDirty: true });
    } else if (raw === '') {
      setValue('priceCents', 0, { shouldDirty: true });
    }
  };

  return (
    <form
      onSubmit={handleSubmit((values) => {
        // When the user emptied the system select, the form value lands as
        // an empty string — the API expects null for "no system".
        const cleaned = {
          ...values,
          system: values.system === '' ? null : values.system,
          endedOn: values.endedOn ? values.endedOn : null,
        };
        return onFinish(cleaned);
      })}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => navigate('/subscriptions')}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h2 className="text-2xl">
              {props.action === 'create' ? 'Neues Abo' : current?.name ?? 'Abo bearbeiten'}
            </h2>
            {props.action === 'edit' && current?.nextBillingOn ? (
              <p className="text-sm text-muted-foreground">
                Nächste Abrechnung am {new Date(current.nextBillingOn).toLocaleDateString()}
              </p>
            ) : null}
          </div>
          {props.action === 'edit' && current?.status ? (
            <Badge variant="secondary" className="ml-3">
              {current.status}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {props.action === 'edit' ? (
            <Button type="button" variant="outline" size="sm" disabled>
              <Trash2 className="size-4" /> Löschen
            </Button>
          ) : null}
          <Button type="submit" disabled={isSubmitting || formLoading}>
            <Save className="size-4" />
            {isSubmitting ? 'Speichern …' : 'Speichern'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Leistung</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field
                id="name"
                label="Name"
                required
                placeholder="z. B. TYPO3 Hosting + Maintenance"
                {...register('name', { required: 'Pflichtfeld' })}
              />
              <div className="space-y-1.5">
                <Label htmlFor="description">Beschreibung</Label>
                <Textarea id="description" rows={3} {...register('description')} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="priceMajor">
                    Preis <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="priceMajor"
                    type="number"
                    step="0.01"
                    min="0"
                    value={priceMajor}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                  <p className="text-xs text-muted-foreground tabular-nums">
                    = {formatMoney(priceCents ?? 0, currency)}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="currency">Währung</Label>
                  <Controller
                    name="currency"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value ?? 'eur'} onValueChange={field.onChange}>
                        <SelectTrigger id="currency">
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
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="billingCycle">
                    Zyklus <span className="text-destructive">*</span>
                  </Label>
                  <Controller
                    name="billingCycle"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value ?? 'monthly'} onValueChange={field.onChange}>
                        <SelectTrigger id="billingCycle">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BILLING_CYCLES.map((b) => (
                            <SelectItem key={b.value} value={b.value}>
                              {b.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field
                  id="startedOn"
                  label="Startet am"
                  type="date"
                  required
                  {...register('startedOn', { required: 'Pflichtfeld' })}
                />
                <Field id="endedOn" label="Endet am (optional)" type="date" {...register('endedOn')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notizen</Label>
                <Textarea id="notes" rows={3} {...register('notes')} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Zuordnung & Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="customer">
                  Kunde <span className="text-destructive">*</span>
                </Label>
                <Controller
                  name="customer"
                  control={control}
                  rules={{ required: 'Pflichtfeld' }}
                  render={({ field, fieldState }) => (
                    <>
                      <CustomerCombobox
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          // Customer change invalidates the system FK.
                          setValue('system', null);
                        }}
                      />
                      {fieldState.error ? (
                        <p className="text-xs text-destructive">{fieldState.error.message}</p>
                      ) : null}
                    </>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="system">System (optional)</Label>
                <Controller
                  name="system"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? 'none'}
                      onValueChange={(v) => field.onChange(v === 'none' ? null : v)}
                      disabled={!selectedCustomer}
                    >
                      <SelectTrigger id="system">
                        <SelectValue
                          placeholder={selectedCustomer ? '— Kundenweit —' : 'Erst Kunde wählen'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Kundenweit (kein System) —</SelectItem>
                        {filteredSystems.map((s) => (
                          <SelectItem key={s['@id']} value={s['@id'] ?? ''}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Leer lassen für Leistungen, die sich auf den gesamten Kunden beziehen
                  (z. B. Retainer).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? 'active'} onValueChange={field.onChange}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border border-input p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="autoRenew">Auto-Verlängerung</Label>
                  <p className="text-xs text-muted-foreground">
                    Beeinflusst, wann "Nächste Abrechnung" automatisch fortgeschrieben wird.
                  </p>
                </div>
                <Controller
                  name="autoRenew"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="autoRenew"
                      checked={!!field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </form>
  );
}

function Field({
  id,
  label,
  required,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label htmlFor={id}>
        {label} {required ? <span className="text-destructive">*</span> : null}
      </Label>
      <Input id={id} {...rest} />
    </div>
  );
}
