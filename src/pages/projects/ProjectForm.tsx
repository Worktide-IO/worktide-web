import { useForm } from '@refinedev/react-hook-form';
import { useInvalidate, useList, useNavigation } from '@refinedev/core';
import { ArrowLeft, FolderKanban, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useState } from 'react';
import { Controller, type FieldValues } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { WORKSPACE_STORAGE_KEY } from '@/lib/api';

import type { CustomerJsonld } from '@/api/types/customer/Jsonld';
import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { ProjectStatusJsonld } from '@/api/types/projectStatus/Jsonld';
import type { ProjectTypeJsonld } from '@/api/types/projectType/Jsonld';
import type { Row } from '@/lib/refine';
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

  const { result: customers } = useList<Row<CustomerJsonld>>({
    resource: 'customers',
    pagination: { mode: 'off' },
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
      toast.success('Projekt gelöscht.');
      list('projects');
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 403
          ? 'Keine Berechtigung — nur Workspace-Admins können Projekte löschen.'
          : 'Konnte nicht löschen.',
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
              ? 'Neues Projekt'
              : current?.name ?? 'Projekt bearbeiten'}
          </h2>
          {props.action === 'edit' && (current as { number?: string | null } | undefined)?.number ? (
            <span className="font-mono text-xs text-muted-foreground">
              Nr. {(current as { number?: string | null }).number}
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
                <Field
                  id="key"
                  label="Key (Slug für Task-IDs, z. B. WORK)"
                  required
                  className="font-mono uppercase"
                  {...register('key', { required: 'Pflichtfeld' })}
                />
                <Field
                  id="number"
                  label="Projektnummer (leer = Workspace-Pattern)"
                  className="font-mono"
                  {...register('number' as keyof Row<ProjectJsonld>)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Beschreibung</Label>
                <Textarea id="description" rows={3} {...register('description')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  id="startsOn"
                  label="Start"
                  type="date"
                  {...register('startsOn')}
                />
                <Field
                  id="dueOn"
                  label="Fällig am"
                  type="date"
                  {...register('dueOn')}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Einordnung</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Controller
                  name="status"
                  control={control}
                  rules={{ required: 'Pflichtfeld' }}
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Status wählen…" />
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
                  <Label>Kunde</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCustomerDialogOpen(true)}
                    className="h-6 gap-1 px-2 text-xs"
                  >
                    <Plus className="size-3" /> Neuer Kunde
                  </Button>
                </div>
                <Controller
                  name="customer"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? '__none__'}
                      onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Kunde wählen…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Intern (kein Kunde)</SelectItem>
                        {(customers?.data ?? []).map((c) => (
                          <SelectItem key={c['@id']} value={c['@id'] ?? ''}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Projekttyp</Label>
                <Controller
                  name="projectType"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? '__none__'}
                      onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Typ wählen…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Ohne Typ</SelectItem>
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
                <Label htmlFor="color">Farbe</Label>
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
                  label="Privat"
                  hint="Nur Projekt-Mitglieder sehen das Projekt."
                />
                <SwitchRow
                  control={control}
                  name="isRetainer"
                  label="Retainer (Dauerläufer)"
                  hint="Wiederkehrende Service-Stunden, kein Ende-Datum."
                />
                <SwitchRow
                  control={control}
                  name="isExternal"
                  label="Connect-Projekt"
                  hint="Sichtbar für externe Mitglieder und das Customer-Portal."
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Projekt löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Das Projekt wird soft-deleted und ist über die normale
              Projektliste nicht mehr sichtbar. Tasks, Zeiteinträge und
              Dokumente bleiben mit dem Projekt verknüpft erhalten und
              können bei Bedarf wiederhergestellt werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={doDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Lösche …' : 'Endgültig löschen'}
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
      toast.success(`Kunde "${trimmed}" angelegt — Stammdaten kannst du jederzeit unter Kunden ergänzen.`);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Konnte Kunde nicht anlegen.');
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
          <DialogTitle>Neuer Kunde</DialogTitle>
          <DialogDescription>
            Schneller Anlegen — nur der Name reicht. Restliche Stammdaten
            (Email, Adresse, USt-ID …) kannst du später unter Kunden
            nachpflegen.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="quick-customer-name">Name</Label>
          <Input
            id="quick-customer-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="Firmenname"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
