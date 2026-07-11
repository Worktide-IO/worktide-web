import { useNavigation } from '@refinedev/core';
import { useForm } from '@refinedev/react-hook-form';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ExternalLink, Save, Trash2 } from 'lucide-react';
import { Controller, type FieldValues } from 'react-hook-form';
import { useNavigate } from 'react-router';

import type { CustomerSystemJsonld } from '@/api/types/customerSystem/Jsonld';
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
  const { t: translate } = useTranslation();
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
              {props.action === 'create'
                ? translate('customer_system_form.heading_new')
                : current?.name ?? translate('customer_system_form.heading_edit')}
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
              <Trash2 className="size-4" /> {translate('action.delete')}
            </Button>
          ) : null}
          <Button type="submit" disabled={isSubmitting || formLoading}>
            <Save className="size-4" />
            {isSubmitting ? translate('action.saving') : translate('action.save')}
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
              <CardTitle>{translate('customer_system_form.card_master_data')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field
                id="name"
                label={translate('customer_system_form.field_name')}
                required
                {...register('name', { required: translate('validation.required') })}
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="type">
                    {translate('customer_system_form.field_type')} <span className="text-destructive">*</span>
                  </Label>
                  <Controller
                    name="type"
                    control={control}
                    rules={{ required: translate('validation.required') }}
                    render={({ field }) => (
                      <Select value={field.value ?? 'other'} onValueChange={field.onChange}>
                        <SelectTrigger id="type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SYSTEM_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.value === 'other'
                                ? translate('customer_system_form.type_other')
                                : t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <Field
                  id="systemVersion"
                  label={translate('customer_system_form.field_version')}
                  placeholder={translate('customer_system_form.ph_version')}
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
                  placeholder={translate('customer_system_form.ph_admin_login')}
                  {...register('adminLoginUrl')}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  id="hostingProvider"
                  label={translate('customer_system_form.field_hosting')}
                  placeholder={translate('customer_system_form.ph_hosting')}
                  {...register('hostingProvider')}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="environment">{translate('customer_system_form.field_environment')}</Label>
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
                <Label htmlFor="notes">{translate('customer_system_form.field_notes')}</Label>
                <Textarea id="notes" rows={3} {...register('notes')} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{translate('customer_system_form.card_assignment')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="customer">
                  {translate('customer_system_form.field_customer')} <span className="text-destructive">*</span>
                </Label>
                <Controller
                  name="customer"
                  control={control}
                  rules={{ required: translate('validation.required') }}
                  render={({ field, fieldState }) => (
                    <>
                      <CustomerCombobox value={field.value} onChange={field.onChange} />
                      {fieldState.error ? (
                        <p className="text-xs text-destructive">{fieldState.error.message}</p>
                      ) : null}
                    </>
                  )}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border border-input p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="isActive">{translate('customer_system_form.field_active')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {translate('customer_system_form.active_hint')}
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
                  {translate('customer_system_form.credentials_warning')}
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
