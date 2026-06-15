import { useForm } from '@refinedev/react-hook-form';
import { useNavigation } from '@refinedev/core';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { Controller, type FieldValues } from 'react-hook-form';
import { useNavigate } from 'react-router';

import type { CustomerJsonld } from '@/api/types/customer/Jsonld';
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
  const navigate = useNavigate();
  const { show } = useNavigation();
  const {
    refineCore: { onFinish, formLoading, query },
    register,
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<Row<CustomerJsonld>>({
    refineCoreProps: {
      resource: 'customers',
      action: props.action,
      id: props.action === 'edit' ? props.id : undefined,
      redirect: 'list',
    },
    defaultValues: {
      isCompany: true,
      status: 'active',
      country: 'DE',
    } as Partial<Row<CustomerJsonld>> as FieldValues,
  });

  const isLoading = props.action === 'edit' && query?.isLoading;
  const current = query?.data?.data;

  return (
    <form onSubmit={handleSubmit((values) => onFinish(values))} className="space-y-4">
      {props.embedded ? (
        <div className="flex items-center justify-end gap-2">
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
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" size="icon" onClick={() => navigate('/customers')}>
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h2 className="text-2xl">
                {props.action === 'create' ? 'Neuer Kunde' : current?.name ?? 'Kunde bearbeiten'}
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
                <Trash2 className="size-4" /> Löschen
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
              <CardTitle>Stammdaten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field
                id="name"
                label="Name"
                required
                {...register('name', { required: 'Pflichtfeld' })}
              />
              <Field id="legalName" label="Firmen-Langname (für Rechnungen)" {...register('legalName')} />
              <div className="grid grid-cols-2 gap-4">
                <Field id="vatId" label="USt-ID" {...register('vatId')} />
                <Field id="industry" label="Branche" {...register('industry')} />
              </div>

              <div className="flex items-center justify-between rounded-md border border-input p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="isCompany">Firma</Label>
                  <p className="text-xs text-muted-foreground">
                    Aus für Privatkunden. Beeinflusst die Rechnungs-Adressierung.
                  </p>
                </div>
                <Controller
                  name="isCompany"
                  control={control}
                  render={({ field }) => (
                    <Switch
                      id="isCompany"
                      checked={!!field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field id="email" label="Email" type="email" {...register('email')} />
                <Field id="phone" label="Telefon" {...register('phone')} />
              </div>
              <Field id="website" label="Website" type="url" {...register('website')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="status">Lebenszyklus</Label>
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
                        <SelectItem value="active">Aktiv</SelectItem>
                        <SelectItem value="inactive">Inaktiv</SelectItem>
                        <SelectItem value="churned">Churned</SelectItem>
                        <SelectItem value="archived">Archiviert</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {props.action === 'edit' && current?.id ? (
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>
                    Erstellt: {current.createdAt ? new Date(current.createdAt).toLocaleString() : '—'}
                  </div>
                  <div>
                    Aktualisiert:{' '}
                    {current.updatedAt ? new Date(current.updatedAt).toLocaleString() : '—'}
                  </div>
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    onClick={() => show('customers', current.id ?? '')}
                  >
                    Detail …
                  </button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Adresse</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field id="addressLine1" label="Adresse" {...register('addressLine1')} />
              <Field id="addressLine2" label="Adresszusatz" {...register('addressLine2')} />
              <div className="grid grid-cols-3 gap-4">
                <Field id="zip" label="PLZ" {...register('zip')} />
                <Field id="city" label="Stadt" className="col-span-2" {...register('city')} />
              </div>
              <Field
                id="country"
                label="Land (ISO 3166-1 alpha-2)"
                maxLength={2}
                {...register('country')}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notizen</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={8}
                placeholder="Free-form. Account-Manager-Wechsel, Lieferadressen, Eigenheiten …"
                {...register('notes')}
              />
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
