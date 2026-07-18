import { useForm } from '@refinedev/react-hook-form';
import { useNavigation } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { Controller, type FieldValues } from 'react-hook-form';
import { useNavigate } from 'react-router';

import type { CustomerJsonld } from '@/api/types/customer/Jsonld';
import type { Row } from '@/lib/refine';
import { IndustryCombobox } from '@/components/IndustryCombobox';
import { SocialProfilesCard } from '@/components/SocialProfilesCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';

/**
 * Shared create + edit form for Customer.
 *
 * `useForm` from @refinedev/react-hook-form bridges react-hook-form and
 * the Refine data provider — `action: 'create' | 'edit'` decides whether
 * the eventual submit fires a POST or PATCH; `redirect: 'list'` sends the
 * user back to the listing after a successful save.
 *
 * Validation is intentionally light here — the API already enforces the
 * hard rules (email format, required name, status enum). We just keep the
 * HTML5 `required` on the must-not-be-empty fields so the browser stops
 * an obviously broken submit before it hits the network.
 *
 * Schema choices: API Platform allows POST without a workspace IRI when
 * the resource is workspace-scoped via the X-Workspace-Id header — that's
 * stamped by the axios interceptor in lib/api.ts, so the create form
 * doesn't need a workspace picker.
 */
type Mode = { action: 'create' } | { action: 'edit'; id: string };

/** Form values widen the (stale) generated Customer type with person + type fields. */
type CustomerFormValues = Row<CustomerJsonld> & {
  firstName?: string | null;
  lastName?: string | null;
  isCustomer?: boolean | null;
  isVendor?: boolean | null;
};

type Props = Mode & {
  /**
   * Drop the form's title/back-arrow header so the form can be embedded
   * inside a detail page that already shows the customer name. Save +
   * Delete buttons stay (right-aligned) so the user can still commit
   * changes without scrolling.
   */
  embedded?: boolean;
};

export function CustomerForm(props: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { show } = useNavigation();
  const {
    refineCore: { onFinish, formLoading, query },
    register,
    control,
    watch,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<CustomerFormValues>({
    refineCoreProps: {
      resource: 'customers',
      action: props.action,
      id: props.action === 'edit' ? props.id : undefined,
      redirect: 'list',
    },
    defaultValues: {
      isCompany: true,
      isCustomer: true,
      isVendor: false,
      status: 'active',
      country: 'DE',
    } as Partial<Row<CustomerJsonld>> as FieldValues,
  });

  const isLoading = props.action === 'edit' && query?.isLoading;
  const current = query?.data?.data;
  const isCompany = watch('isCompany') ?? true;

  return (
    <form
      onSubmit={handleSubmit((values) => {
        const v = { ...values };
        if (!v.isCompany) {
          // Persons: derive the display name from Vor-/Nachname; drop company-only fields.
          const fn = (v.firstName ?? '').trim();
          const ln = (v.lastName ?? '').trim();
          v.name = [ln, fn].filter(Boolean).join(', ') || fn || ln;
          v.legalName = null;
          v.vatId = null;
        } else {
          v.firstName = null;
          v.lastName = null;
        }
        return onFinish(v);
      })}
      className="space-y-4"
    >
      {props.embedded ? (
        <div className="flex items-center justify-end gap-2">
          {props.action === 'edit' ? (
            <Button type="button" variant="outline" size="sm" disabled>
              <Trash2 className="size-4" /> {t('action.delete')}
            </Button>
          ) : null}
          <Button type="submit" disabled={isSubmitting || formLoading}>
            <Save className="size-4" />
            {isSubmitting ? t('customer_form.saving') : t('action.save')}
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" size="icon" onClick={() => navigate('/customers')}>
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h2 className="text-2xl">
                {props.action === 'create' ? t('customer_form.title_new') : current?.name ?? t('customer_form.title_edit')}
              </h2>
              {props.action === 'edit' && current?.legalName ? (
                <p className="text-sm text-muted-foreground">{current.legalName}</p>
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
                <Trash2 className="size-4" /> {t('action.delete')}
              </Button>
            ) : null}
            <Button type="submit" disabled={isSubmitting || formLoading}>
              <Save className="size-4" />
              {isSubmitting ? 'Speichern …' : 'Speichern'}
            </Button>
          </div>
        </div>
      )}

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
              <CardTitle>{t('customer_form.section_master')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Controller
                name="isCompany"
                control={control}
                render={({ field }) => (
                  <div className="inline-flex rounded-md border border-input p-0.5 text-sm">
                    <button
                      type="button"
                      onClick={() => field.onChange(true)}
                      className={cn(
                        'rounded px-4 py-1.5 transition-colors',
                        field.value
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t('customer_form.type_company')}
                    </button>
                    <button
                      type="button"
                      onClick={() => field.onChange(false)}
                      className={cn(
                        'rounded px-4 py-1.5 transition-colors',
                        !field.value
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t('customer_form.type_person')}
                    </button>
                  </div>
                )}
              />

              {isCompany ? (
                <>
                  <Field
                    id="name"
                    label={t('customer_form.field_company_name')}
                    required
                    {...register('name', { required: t('customer_form.required') })}
                  />
                  <Field id="legalName" label={t('customer_form.field_legal_name')} {...register('legalName')} />
                  <Field id="vatId" label={t('customer_form.field_vat_id')} {...register('vatId')} />
                </>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <Field id="firstName" label={t('customer_form.field_first_name')} {...register('firstName')} />
                  <Field
                    id="lastName"
                    label={t('customer_form.field_last_name')}
                    required
                    {...register('lastName', { required: t('customer_form.required') })}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="industry">{t('customer_form.field_industry')}</Label>
                <Controller
                  control={control}
                  name="industry"
                  render={({ field }) => (
                    <IndustryCombobox
                      value={(field.value as string | null | undefined) ?? null}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field id="email" label="Email" type="email" {...register('email')} />
                <Field id="phone" label={t('customer_form.field_phone')} {...register('phone')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  id="invoiceEmail"
                  label={t('customer_form.field_invoice_email')}
                  type="email"
                  {...register('invoiceEmail')}
                />
                <Field id="website" label="Website" type="url" {...register('website')} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('customer_form.section_status')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="status">{t('customer_form.field_lifecycle')}</Label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? 'active'} onValueChange={field.onChange}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="prospect">Prospect</SelectItem>
                        <SelectItem value="active">{t('customer_form.status_active')}</SelectItem>
                        <SelectItem value="inactive">{t('customer_form.status_inactive')}</SelectItem>
                        <SelectItem value="churned">Churned</SelectItem>
                        <SelectItem value="archived">{t('customer_form.status_archived')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('customer_form.field_type')}</Label>
                <div className="flex flex-col gap-2 pt-1">
                  <Controller
                    name="isCustomer"
                    control={control}
                    render={({ field }) => (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={(v) => field.onChange(v === true)}
                        />
                        {t('customer_form.type_customer')}
                      </label>
                    )}
                  />
                  <Controller
                    name="isVendor"
                    control={control}
                    render={({ field }) => (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={(v) => field.onChange(v === true)}
                        />
                        {t('customer_form.type_vendor')}
                      </label>
                    )}
                  />
                </div>
              </div>

              {props.action === 'edit' && current?.id ? (
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>
                    {t('customer_form.created_label')}{' '}
                    {current.createdAt ? new Date(current.createdAt).toLocaleString() : '—'}
                  </div>
                  <div>
                    {t('customer_form.updated_label')}{' '}
                    {current.updatedAt ? new Date(current.updatedAt).toLocaleString() : '—'}
                  </div>
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    onClick={() => show('customers', current.id ?? '')}
                  >
                    {t('customer_form.detail_link')}
                  </button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t('customer_form.section_address')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field id="addressLine1" label={t('customer_form.field_address')} {...register('addressLine1')} />
              <Field id="addressLine2" label={t('customer_form.field_address2')} {...register('addressLine2')} />
              <div className="grid grid-cols-3 gap-4">
                <Field id="zip" label={t('customer_form.field_zip')} {...register('zip')} />
                <Field id="city" label={t('customer_form.field_city')} className="col-span-2" {...register('city')} />
              </div>
              <Field
                id="country"
                label={t('customer_form.field_country')}
                maxLength={2}
                {...register('country')}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('customer_form.section_notes')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={8}
                placeholder={t('customer_form.notes_placeholder')}
                {...register('notes')}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {props.action === 'edit' && current?.['@id'] ? (
        <SocialProfilesCard owner="customer" ownerIri={current['@id']} />
      ) : null}
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
