import { useList, useNavigation } from '@refinedev/core';
import { useForm } from '@refinedev/react-hook-form';
import { ArrowLeft, ExternalLink, Save, Trash2 } from 'lucide-react';
import { Controller, type FieldValues } from 'react-hook-form';
import { useNavigate } from 'react-router';

import type { CustomerJsonld } from '@/api/types/customer/Jsonld';
import type { CustomerSystemJsonld } from '@/api/types/customerSystem/Jsonld';
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

const SYSTEM_TYPES: { value: string; label: string }[] = [
  { value: 'typo3', label: 'TYPO3' },
  { value: 'wordpress', label: 'WordPress' },
  { value: 'drupal', label: 'Drupal' },
  { value: 'magento', label: 'Magento' },
  { value: 'shopware', label: 'Shopware' },
  { value: 'joomla', label: 'Joomla' },
  { value: 'symfony', label: 'Symfony' },
  { value: 'laravel', label: 'Laravel' },
  { value: 'static', label: 'Static / Headless' },
  { value: 'other', label: 'Sonstiges' },
];

const ENVIRONMENTS = [
  { value: 'production', label: 'Production' },
  { value: 'staging', label: 'Staging' },
  { value: 'development', label: 'Development' },
];

type Mode = { action: 'create' } | { action: 'edit'; id: string };

/**
 * Shared create + edit form for CustomerSystem.
 *
 * Layout follows the established CRM-form pattern: a wide "Stammdaten"
 * card on the left + a narrow "Zuordnung" card on the right. The
 * credentials field is intentionally a plain textarea — proper at-rest
 * encryption is part of the CRM-3 / KMS story that hasn't landed yet
 * (memory: project_worktide), so the field carries a banner reminding
 * users not to paste production passwords until then.
 */
export function CustomerSystemForm(props: Mode) {
  const navigate = useNavigate();
  const { show } = useNavigation();
  void show;

  const {
    refineCore: { onFinish, formLoading, query },
    register,
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<Row<CustomerSystemJsonld>>({
    refineCoreProps: {
      resource: 'customer_systems',
      action: props.action,
      id: props.action === 'edit' ? props.id : undefined,
      redirect: 'list',
    },
    defaultValues: {
      type: 'other',
      environment: 'production',
      isActive: true,
    } as Partial<Row<CustomerSystemJsonld>> as FieldValues,
  });

  const { result: customers } = useList<Row<CustomerJsonld>>({
    resource: 'customers',
    pagination: { mode: 'off' },
  });

  const isLoading = props.action === 'edit' && query?.isLoading;
  const current = query?.data?.data;

  return (
    <form onSubmit={handleSubmit((values) => onFinish(values))} className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => navigate('/customer-systems')}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h2 className="text-2xl">
              {props.action === 'create' ? 'Neues System' : current?.name ?? 'System bearbeiten'}
            </h2>
            {props.action === 'edit' && current?.url ? (
              <a
                href={current.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
              >
                {current.url.replace(/^https?:\/\//, '')}
                <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>
          {props.action === 'edit' && current?.type ? (
            <Badge variant="outline" className="ml-3 font-mono text-[10px] uppercase">
              {current.type}
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
              <CardTitle>Stammdaten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field
                id="name"
                label="Name"
                required
                {...register('name', { required: 'Pflichtfeld' })}
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="type">
                    Typ <span className="text-destructive">*</span>
                  </Label>
                  <Controller
                    name="type"
                    control={control}
                    rules={{ required: 'Pflichtfeld' }}
                    render={({ field }) => (
                      <Select value={field.value ?? 'other'} onValueChange={field.onChange}>
                        <SelectTrigger id="type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SYSTEM_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <Field
                  id="systemVersion"
                  label="Version"
                  placeholder="z. B. 13.4 oder 6.6"
                  {...register('systemVersion')}
                />
              </div>

              <Field
                id="url"
                label="Production URL"
                type="url"
                placeholder="https://…"
                {...register('url')}
              />
              <div className="grid grid-cols-2 gap-4">
                <Field id="stagingUrl" label="Staging URL" type="url" {...register('stagingUrl')} />
                <Field
                  id="adminLoginUrl"
                  label="Admin-Login URL"
                  type="url"
                  placeholder="z. B. /typo3"
                  {...register('adminLoginUrl')}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  id="hostingProvider"
                  label="Hosting-Provider"
                  placeholder="z. B. Hetzner, mittwald, AWS"
                  {...register('hostingProvider')}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="environment">Umgebung</Label>
                  <Controller
                    name="environment"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value ?? 'production'} onValueChange={field.onChange}>
                        <SelectTrigger id="environment">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ENVIRONMENTS.map((e) => (
                            <SelectItem key={e.value} value={e.value}>
                              {e.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notizen</Label>
                <Textarea id="notes" rows={3} {...register('notes')} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Zuordnung</CardTitle>
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
                      <Select value={field.value ?? ''} onValueChange={field.onChange}>
                        <SelectTrigger id="customer">
                          <SelectValue placeholder="Kunde wählen…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(customers?.data ?? []).map((c) => (
                            <SelectItem key={c['@id']} value={c['@id'] ?? ''}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.error ? (
                        <p className="text-xs text-destructive">{fieldState.error.message}</p>
                      ) : null}
                    </>
                  )}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border border-input p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="isActive">Aktiv</Label>
                  <p className="text-xs text-muted-foreground">
                    Inaktive Systeme bleiben in der Historie, lösen aber keine Wartungs-Alerts aus.
                  </p>
                </div>
                <Controller
                  name="isActive"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="isActive"
                      checked={!!field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="credentialsNotes">Credentials / Notes</Label>
                <Textarea
                  id="credentialsNotes"
                  rows={4}
                  placeholder="SSH-User, Admin-Account, Backup-Token, …"
                  {...register('credentialsNotes')}
                />
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  ⚠ Klartext. Echte Passwörter erst mit Verschlüsselung (KMS-Story
                  später) hier ablegen.
                </p>
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
