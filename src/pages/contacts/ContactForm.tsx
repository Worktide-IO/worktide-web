import { useNavigation } from '@refinedev/core';
import { useForm } from '@refinedev/react-hook-form';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { Controller, type FieldValues } from 'react-hook-form';
import { useNavigate } from 'react-router';

import type { ContactJsonld } from '@/api/types/contact/Jsonld';
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
  const { show } = useNavigation();
  void show;

  const {
    refineCore: { onFinish, formLoading, query },
    register,
    control,
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
                ? 'Neuer Kontakt'
                : `${current?.firstName ?? ''} ${current?.lastName ?? ''}`.trim() ||
                  'Kontakt bearbeiten'}
            </h2>
            {props.action === 'edit' && current?.position ? (
              <p className="text-sm text-muted-foreground">{current.position}</p>
            ) : null}
          </div>
          {props.action === 'edit' && current?.isPrimary ? (
            <Badge variant="secondary" className="ml-3">
              primär
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
              <CardTitle>Person</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_2fr] gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="salutation">Anrede</Label>
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
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <Field
                  id="firstName"
                  label="Vorname"
                  required
                  {...register('firstName', { required: 'Pflichtfeld' })}
                />
                <Field
                  id="lastName"
                  label="Nachname"
                  required
                  {...register('lastName', { required: 'Pflichtfeld' })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field id="title" label="Titel (Dr., Prof., …)" {...register('title')} />
                <Field id="position" label="Position / Rolle" {...register('position')} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field id="email" label="Email" type="email" {...register('email')} />
                <Field id="phone" label="Telefon" {...register('phone')} />
                <Field id="mobile" label="Mobil" {...register('mobile')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notizen</Label>
                <Textarea id="notes" rows={4} {...register('notes')} />
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
                  <Label htmlFor="isPrimary">Primärer Ansprechpartner</Label>
                  <p className="text-xs text-muted-foreground">
                    Wird in Listen-Ansichten als ⭐ markiert.
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
                  <Label htmlFor="isActive">Aktiv</Label>
                  <p className="text-xs text-muted-foreground">
                    Inaktive Kontakte bleiben in der Historie, aber tauchen in Vorschlägen nicht auf.
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
