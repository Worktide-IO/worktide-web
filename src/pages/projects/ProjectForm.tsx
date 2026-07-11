import { useForm } from '@refinedev/react-hook-form';
import { useTranslation } from 'react-i18next';
import { useInvalidate, useList, useNavigation } from '@refinedev/core';
import { ArrowLeft, FolderKanban, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useState } from 'react';
import { Controller, type FieldValues } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { WORKSPACE_STORAGE_KEY } from '@/lib/api';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { ProjectStatusJsonld } from '@/api/types/projectStatus/Jsonld';
import type { ProjectTypeJsonld } from '@/api/types/projectType/Jsonld';
import type { Row } from '@/lib/refine';
import { CustomerCombobox } from '@/components/CustomerCombobox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { TagPicker } from '@/components/TagPicker';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

/**
 * Shared create + edit form for Project. Pattern follows CustomerForm:
 * `@refinedev/react-hook-form` bridges react-hook-form and the Refine
 * data provider so `action: 'create' | 'edit'` decides POST vs PATCH.
 *
 * Lookup data (customers / statuses / project-types) loads in parallel
 * and feeds the corresponding Select dropdowns. Form fields:
 *
 *   Pflicht: name, key, status
 *   Optional: number (Auto-Fill via workspace pattern), customer,
 *             projectType, color, description, startsOn/dueOn,
 *             isPrivate, isExternal, isRetainer
 *
 * Delete lives on the edit-mode form (Trash button → AlertDialog), not
 * on create. After save/delete we redirect back to /projects.
 */
type Mode = { action: 'create' } | { action: 'edit'; id: string };

export function ProjectForm(props: Mode) {
  const { t: translate } = useTranslation();
  const navigate = useNavigate();
  const { list } = useNavigation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);

  const {
    refineCore: { onFinish, formLoading, query },
    register,
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting },
  } = useForm<Row<ProjectJsonld>>({
    refineCoreProps: {
      resource: 'projects',
      action: props.action,
      id: props.action === 'edit' ? props.id : undefined,
      redirect: 'list',
    },
    defaultValues: {
      color: '#6366f1',
      isPrivate: false,
      isExternal: false,
      isRetainer: false,
      isBillableByDefault: true,
    } as Partial<Row<ProjectJsonld>> as FieldValues,
  });

  const { result: statuses } = useList<Row<ProjectStatusJsonld>>({
    resource: 'project_statuses',
    pagination: { mode: 'off' },
  });
  const { result: projectTypes } = useList<Row<ProjectTypeJsonld>>({
    resource: 'project_types',
    pagination: { mode: 'off' },
  });

  const isLoading = props.action === 'edit' && query?.isLoading;
  const current = query?.data?.data;

  const doDelete = async () => {
    if (props.action !== 'edit') return;
    setDeleting(true);
    try {
      await api.delete(`/projects/${props.id}`);
      toast.success(translate('toast.project_deleted'));
      list('projects');
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 403
          ? translate('toast.project_delete_forbidden')
          : translate('toast.project_delete_failed'),
      );
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit((values) => onFinish(values))}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => navigate('/projects')}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h2 className="text-2xl">
            {props.action === 'create'
              ? translate('project_form.new_title')
              : current?.name ?? translate('project_form.edit_title')}
          </h2>
          {props.action === 'edit' && (current as { number?: string | null } | undefined)?.number ? (
            <span className="font-mono text-xs text-muted-foreground">
              {translate('project_form.number_prefix', { number: (current as { number?: string | null }).number })}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {props.action === 'edit' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
            >
              <Trash2 className="size-4" /> {translate('action.delete')}
            </Button>
          ) : null}
          <Button type="submit" disabled={isSubmitting || formLoading}>
            <Save className="size-4" />
            {isSubmitting ? translate('project_form.saving') : translate('action.save')}
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
              <CardTitle>{translate('project_form.master_data')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field
                id="name"
                label={translate('project_form.name')}
                required
                {...register('name', { required: 'Pflichtfeld' })}
              />
              <div className="grid grid-cols-2 gap-4">
                <Field
                  id="key"
                  label={translate('project_form.key_label')}
                  required
                  className="font-mono uppercase"
                  {...register('key', { required: 'Pflichtfeld' })}
                />
                <Field
                  id="number"
                  label={translate('project_form.number_label')}
                  className="font-mono"
                  {...register('number' as keyof Row<ProjectJsonld>)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">{translate('project_form.description')}</Label>
                <Textarea id="description" rows={3} {...register('description')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  id="startsOn"
                  label={translate('project_form.start')}
                  type="date"
                  {...register('startsOn')}
                />
                <Field
                  id="dueOn"
                  label={translate('project_form.due')}
                  type="date"
                  {...register('dueOn')}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{translate('project_form.classification')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>{translate('project_form.status')}</Label>
                <Controller
                  name="status"
                  control={control}
                  rules={{ required: 'Pflichtfeld' }}
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={translate('project_form.status_placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {(statuses?.data ?? []).map((s) => (
                          <SelectItem key={s['@id']} value={s['@id'] ?? ''}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>{translate('project_form.customer')}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCustomerDialogOpen(true)}
                    className="h-6 gap-1 px-2 text-xs"
                  >
                    <Plus className="size-3" /> {translate('project_form.new_customer')}
                  </Button>
                </div>
                <Controller
                  name="customer"
                  control={control}
                  render={({ field }) => (
                    <CustomerCombobox value={field.value} onChange={field.onChange} />
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{translate('project_form.project_type')}</Label>
                <Controller
                  name="projectType"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? '__none__'}
                      onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={translate('project_form.type_placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{translate('project_form.no_type')}</SelectItem>
                        {(projectTypes?.data ?? []).map((t) => (
                          <SelectItem key={t['@id']} value={t['@id'] ?? ''}>
                            <span className="inline-flex items-center gap-2">
                              <ProjectTypeIcon name={t.icon} />
                              {t.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="color">{translate('project_form.color')}</Label>
                <Controller
                  name="color"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="color"
                      type="color"
                      value={field.value ?? '#6366f1'}
                      onChange={field.onChange}
                      className="h-9 w-24 cursor-pointer"
                    />
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tags</Label>
                <Controller
                  name="tags"
                  control={control}
                  render={({ field }) => (
                    <TagPicker
                      value={(field.value as string[] | undefined) ?? []}
                      onChange={field.onChange}
                      scope="project"
                    />
                  )}
                />
              </div>

              <div className="space-y-3 rounded-md border border-input p-3">
                <SwitchRow
                  control={control}
                  name="isPrivate"
                  label={translate('project_form.private')}
                  hint={translate('project_form.private_hint')}
                />
                <SwitchRow
                  control={control}
                  name="isRetainer"
                  label={translate('project_form.retainer')}
                  hint={translate('project_form.retainer_hint')}
                />
                <SwitchRow
                  control={control}
                  name="isExternal"
                  label={translate('project_form.connect_project')}
                  hint={translate('project_form.connect_project_hint')}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{translate('project_form.delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {translate('project_form.delete_desc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{translate('action.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={doDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? translate('project_form.deleting') : translate('project_form.delete_confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NewCustomerInlineDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        onCreated={(iri) => setValue('customer', iri, { shouldDirty: true })}
      />
    </form>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
};

const Field = ({ id, label, ...rest }: FieldProps) => (
  <div className="space-y-1.5">
    <Label htmlFor={id}>
      {label}
      {rest.required ? <span className="text-destructive"> *</span> : null}
    </Label>
    <Input id={id} {...rest} />
  </div>
);

type SwitchRowProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  name: string;
  label: string;
  hint: string;
};

const SwitchRow = ({ control, name, label, hint }: SwitchRowProps) => (
  <div className="flex items-start justify-between gap-3">
    <div className="space-y-0.5">
      <Label htmlFor={name}>{label}</Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Switch
          id={name}
          checked={!!field.value}
          onCheckedChange={field.onChange}
        />
      )}
    />
  </div>
);

/**
 * Resolves a Lucide icon by name (the `icon` field on ProjectType is a
 * string like "FolderKanban", "Leaf", "Settings"). Falls back to a
 * generic folder when missing or unknown so the row layout stays
 * stable.
 */
function ProjectTypeIcon({ name }: { name?: string | null }) {
  const Resolved = name
    ? (Icons[name as keyof typeof Icons] as React.ElementType | undefined)
    : undefined;
  const Icon = Resolved ?? FolderKanban;
  return <Icon className="size-3.5 text-muted-foreground" />;
}

/**
 * Mini-form for "+ Neuer Kunde" — name only. Mirrors awork's
 * inline-create flow so users don't lose form context. On success
 * the customer cache is invalidated AND the new IRI is handed back so
 * the parent can auto-select it.
 */
function NewCustomerInlineDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (customerIri: string) => void;
}) {
  const { t: translate } = useTranslation();
  const invalidate = useInvalidate();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const workspaceId =
        typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
      const { data } = await api.post<{ '@id'?: string }>('/customers', {
        name: trimmed,
        status: 'active',
        isCompany: true,
        country: 'DE',
        workspace: workspaceId ? `/v1/workspaces/${workspaceId}` : undefined,
      });
      void invalidate({ resource: 'customers', invalidates: ['list'] });
      if (data['@id']) onCreated(data['@id']);
      onOpenChange(false);
      setName('');
      toast.success(translate('toast.customer_created_hint', { name: trimmed }));
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? translate('toast.could_not_create_customer'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !saving && name.trim()) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{translate('project_form.new_customer')}</DialogTitle>
          <DialogDescription>
            {translate('project_form.new_customer_desc')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="quick-customer-name">{translate('project_form.name')}</Label>
          <Input
            id="quick-customer-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder={translate('project_form.company_name_placeholder')}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {translate('action.cancel')}
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {translate('project_form.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
