import { useNavigation } from '@refinedev/core';
import { useForm } from '@refinedev/react-hook-form';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { Controller, type FieldValues } from 'react-hook-form';
import { useNavigate } from 'react-router';

import type { ContactJsonld } from '@/api/types/contact/Jsonld';
import { CustomerCombobox } from '@/components/CustomerCombobox';
import { TagPicker } from '@/components/TagPicker';
import { TagSuggestButton } from '@/components/TagSuggestButton';
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

const SALUTATIONS = [
  { value: 'none', label: '— Keine —' },
  { value: 'Frau', label: 'Frau' },
  { value: 'Herr', label: 'Herr' },
  { value: 'Mx', label: 'Mx' },
];

type Mode = { action: 'create' } | { action: 'edit'; id: string };

/**
 * Shared create + edit form for Contact. Same useForm bridge as
 * CustomerForm; the Contact resource auto-sends a Workspace via the
 * X-Workspace-Id header so the form doesn't need a workspace picker.
 *
 * The Customer FK is required — backend enforces it (nullable=false).
 * Refine's `useList` for customers caches across the app, so opening
 * this form is cheap whenever the customers list page was visited.
 */
export function ContactForm(props: Mode) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { show } = useNavigation();
  void show;

  const {
    refineCore: { onFinish, formLoading, query },
    register,
    control,
    watch,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<Row<ContactJsonld>>({
    refineCoreProps: {
      resource: 'contacts',
      action: props.action,
      id: props.action === 'edit' ? props.id : undefined,
      redirect: 'list',
    },
    defaultValues: {
      isActive: true,
      isPrimary: false,
    } as Partial<Row<ContactJsonld>> as FieldValues,
  });


  const isLoading = props.action === 'edit' && query?.isLoading;
  const current = query?.data?.data;

  return (
    <form onSubmit={handleSubmit((values) => onFinish(values))} className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" onClick={() => navigate('/contacts')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h2 className="text-2xl">
              {props.action === 'create'
                ? t('contact_form.heading_new')
                : `${current?.firstName ?? ''} ${current?.lastName ?? ''}`.trim() ||
                  t('contact_form.heading_edit')}
            </h2>
            {props.action === 'edit' && current?.position ? (
              <p className="text-sm text-muted-foreground">{current.position}</p>
            ) : null}
          </div>
          {props.action === 'edit' && current?.isPrimary ? (
            <Badge variant="secondary" className="ml-3">
              {t('contact_form.primary_badge')}
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
            {isSubmitting ? t('action.saving') : t('action.save')}
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
              <CardTitle>{t('contact_form.card_person')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_2fr] gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="salutation">{t('contact_form.field_salutation')}</Label>
                  <Controller
                    name="salutation"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value ?? 'none'}
                        onValueChange={(v) => field.onChange(v === 'none' ? null : v)}
                      >
                        <SelectTrigger id="salutation">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SALUTATIONS.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.value === 'none' ? t('contact_form.salutation_none') : s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <Field
                  id="firstName"
                  label={t('contact_form.field_firstname')}
                  required
                  {...register('firstName', { required: t('validation.required') })}
                />
                <Field
                  id="lastName"
                  label={t('contact_form.field_lastname')}
                  required
                  {...register('lastName', { required: t('validation.required') })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field id="title" label={t('contact_form.field_title')} {...register('title')} />
                <Field id="position" label={t('contact_form.field_position')} {...register('position')} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field id="email" label="Email" type="email" {...register('email')} />
                <Field id="phone" label={t('contact_form.field_phone')} {...register('phone')} />
                <Field id="mobile" label={t('contact_form.field_mobile')} {...register('mobile')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">{t('contact_form.field_notes')}</Label>
                <Textarea id="notes" rows={4} {...register('notes')} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('contact_form.card_assignment')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="customer">
                  {t('contact_form.field_customer')} <span className="text-destructive">*</span>
                </Label>
                <Controller
                  name="customer"
                  control={control}
                  rules={{ required: 'Pflichtfeld' }}
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
                  <Label htmlFor="isPrimary">{t('contact_form.field_primary')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('contact_form.primary_hint')}
                  </p>
                </div>
                <Controller
                  name="isPrimary"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="isPrimary"
                      checked={!!field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border border-input p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="isActive">{t('contact_form.field_active')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('contact_form.active_hint')}
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
                <Label>{t('contact_form.field_tags')}</Label>
                <Controller
                  name="tags"
                  control={control}
                  render={({ field }) => {
                    const val = (field.value as string[] | undefined) ?? [];
                    return (
                      <div className="space-y-2">
                        <TagPicker value={val} onChange={field.onChange} scope="contact" />
                        <TagSuggestButton
                          scope="contact"
                          value={val}
                          onChange={field.onChange}
                          getText={() =>
                            [
                              watch('firstName'),
                              watch('lastName'),
                              watch('position'),
                              watch('title'),
                              watch('email'),
                              watch('notes'),
                            ]
                              .filter(Boolean)
                              .join(' • ')
                          }
                        />
                      </div>
                    );
                  }}
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
