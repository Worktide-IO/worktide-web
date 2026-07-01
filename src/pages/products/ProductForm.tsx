import { useList, useInvalidate } from '@refinedev/core';
import { useForm } from '@refinedev/react-hook-form';
import { ArrowLeft, Loader2, Plus, Save, Tag } from 'lucide-react';
import { useState } from 'react';
import { Controller, type FieldValues } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { WORKSPACE_STORAGE_KEY } from '@/lib/api';
import {
  releaseVersion,
  VERSION_STATUS_BADGE,
  type ProductJsonld,
  type ProductType,
  type ProductVersionJsonld,
  type ProductVersionStatus,
} from '@/lib/catalog';
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
import { Textarea } from '@/components/ui/textarea';

type Mode = { action: 'create' } | { action: 'edit'; id: string };

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function ProductForm(props: Mode) {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const isEdit = props.action === 'edit';

  const {
    refineCore: { onFinish, formLoading, query },
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<Row<ProductJsonld>>({
    refineCoreProps: {
      resource: 'products',
      action: props.action,
      id: isEdit ? props.id : undefined,
      redirect: 'list',
    },
    defaultValues: { type: 'product', status: 'active' } as Partial<Row<ProductJsonld>> & FieldValues,
  });

  const current = query?.data?.data as Row<ProductJsonld> | undefined;
  const type = (watch('type') as ProductType | undefined) ?? 'product';
  const productIri = current?.['@id'];

  const workspaceIri = (() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    return id ? `/v1/workspaces/${id}` : undefined;
  })();

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleSubmit((values) => {
          const slug = (values.slug as string)?.trim() || slugify((values.name as string) ?? '');
          return onFinish({ ...values, slug, workspace: workspaceIri });
        })}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" size="icon" onClick={() => navigate('/produkte')}>
              <ArrowLeft className="size-4" />
            </Button>
            <h2 className="text-2xl">
              {isEdit ? (current?.name ?? 'Bearbeiten') : 'Neu im Katalog'}
            </h2>
          </div>
          <Button type="submit" disabled={isSubmitting || formLoading}>
            <Save className="size-4" /> Speichern
          </Button>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  {...register('name', { required: true })}
                  onBlur={(e) => {
                    if (!watch('slug')) setValue('slug', slugify(e.target.value));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slug">Schlüssel (slug)</Label>
                <Input id="slug" placeholder="z. B. worktide-cms" {...register('slug')} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Typ</Label>
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <Select value={field.value ?? 'product'} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="product">Produkt (versioniert)</SelectItem>
                        <SelectItem value="service">Service (versionslos)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value ?? 'active'} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Aktiv</SelectItem>
                        <SelectItem value="deprecated">Abgekündigt</SelectItem>
                        <SelectItem value="eol">EOL</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="category">Kategorie</Label>
                <Input id="category" {...register('category')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Beschreibung</Label>
              <Textarea id="description" rows={3} {...register('description')} />
            </div>
          </CardContent>
        </Card>
      </form>

      {isEdit && type === 'product' && productIri ? (
        <ProductVersionsCard productId={props.id} productIri={productIri} onChange={() => invalidate({ resource: 'products', invalidates: ['detail'], id: props.id })} />
      ) : null}
      {isEdit && type === 'service' ? (
        <p className="text-sm text-muted-foreground">Services sind versionslos.</p>
      ) : null}
    </div>
  );
}

/** Versions list + release dialog for a product (edit mode). */
function ProductVersionsCard({
  productId,
  productIri,
  onChange,
}: {
  productId: string;
  productIri: string;
  onChange: () => void;
}) {
  const { result: versions, query } = useList<Row<ProductVersionJsonld>>({
    resource: 'product_versions',
    filters: [{ field: 'product', operator: 'eq', value: productIri }],
    sorters: [{ field: 'releaseDate', order: 'desc' }],
    pagination: { mode: 'off' },
  });

  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!version.trim()) {
      toast.error('Versionsnummer angeben.');
      return;
    }
    setSaving(true);
    try {
      await releaseVersion(productId, {
        version: version.trim(),
        releaseDate: releaseDate || null,
        releaseNotes: releaseNotes || null,
      });
      toast.success(`Version ${version} veröffentlicht.`);
      setOpen(false);
      setVersion('');
      setReleaseDate('');
      setReleaseNotes('');
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
          <Tag className="size-4 text-muted-foreground" /> Versionen
        </CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Release
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Noch keine Version veröffentlicht.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((v) => {
              const badge = VERSION_STATUS_BADGE[(v.status ?? 'supported') as ProductVersionStatus];
              return (
                <li key={v['@id']} className="flex items-center justify-between py-2">
                  <span className="flex items-center gap-2 text-sm">
                    <span className="font-mono">{v.version}</span>
                    {v.isLatest ? (
                      <Badge variant="default" className="text-[10px]">
                        latest
                      </Badge>
                    ) : null}
                    <Badge variant={badge.variant} className="text-[10px]">
                      {badge.label}
                    </Badge>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {v.releaseDate ? new Date(v.releaseDate).toLocaleDateString('de-DE') : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neue Version veröffentlichen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ver">Version</Label>
              <Input
                id="ver"
                placeholder="z. B. 2.4.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reldate">Release-Datum</Label>
              <Input
                id="reldate"
                type="date"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="relnotes">Release Notes</Label>
              <Textarea
                id="relnotes"
                rows={3}
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Wird automatisch als „aktuell" markiert; die bisherige aktuelle Version
              wird auf „unterstützt" gesetzt.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="button" onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Veröffentlichen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
