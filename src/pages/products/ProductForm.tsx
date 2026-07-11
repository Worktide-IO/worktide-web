import { useList, useInvalidate } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { useForm } from '@refinedev/react-hook-form';
import { ArrowLeft, Check, Loader2, Plus, Save, Sparkles, Tag, X } from 'lucide-react';
import { useState } from 'react';
import { Controller, type FieldValues } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { aiMarketing, aiTriage, type AiRecommendation } from '@/lib/ai';
import { readAuth, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { useMercureTopic } from '@/lib/mercure';
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
import { TranslationsFields, type TranslationsMap } from '@/components/TranslationsFields';
import { useSupportedLanguages } from '@/lib/languages';

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

  const { languages } = useSupportedLanguages();
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

            <Controller
              control={control}
              name="translations"
              render={({ field }) => (
                <TranslationsFields
                  fields={[
                    { key: 'name', label: 'Name' },
                    { key: 'description', label: 'Beschreibung' },
                  ]}
                  locales={languages}
                  value={(field.value as TranslationsMap | undefined) ?? {}}
                  onChange={field.onChange}
                />
              )}
            />
          </CardContent>
        </Card>
      </form>

      {isEdit && type === 'product' && productIri ? (
        <ProductVersionsCard productId={props.id} productIri={productIri} onChange={() => invalidate({ resource: 'products', invalidates: ['detail'], id: props.id })} />
      ) : null}
      {isEdit && type === 'service' ? (
        <p className="text-sm text-muted-foreground">Services sind versionslos.</p>
      ) : null}
      {isEdit ? <ProductMarketingCard productId={props.id} /> : null}
    </div>
  );
}

/**
 * Marketing agent for one product/service: trigger a social-copy draft and
 * review the resulting recommendations in place (accept → a Draft SocialPost).
 * Mirrors AiTriagePanel; the full cross-workspace view lives under /ki-agenten.
 */
function ProductMarketingCard({ productId }: { productId: string }) {
  const navigate = useNavigate();
  const [requesting, setRequesting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { result, query } = useList<AiRecommendation>({
    resource: 'ai_recommendations',
    filters: [
      { field: 'target', operator: 'eq', value: 'product' },
      { field: 'targetId', operator: 'eq', value: productId },
      { field: 'kind', operator: 'eq', value: 'marketing_social_draft' },
    ],
    sorters: [{ field: 'createdAt', order: 'desc' }],
    pagination: { currentPage: 1, pageSize: 20 },
  });
  const recs = result?.data ?? [];

  const workspaceId = readAuth(WORKSPACE_STORAGE_KEY);
  const topic = workspaceId ? `worktide:workspace:${workspaceId}:ai-recommendations` : null;
  useMercureTopic(topic, {
    enabled: Boolean(topic),
    onMessage: () => {
      void query.refetch();
    },
  });

  const request = async () => {
    setRequesting(true);
    try {
      await aiMarketing.request(productId);
      toast.success('Marketing-Entwurf angefordert – erscheint gleich als Empfehlung.');
    } catch {
      toast.error('Anfrage fehlgeschlagen (LLM/Egress prüfen).');
    } finally {
      setRequesting(false);
    }
  };

  const accept = async (rec: AiRecommendation) => {
    setBusyId(rec.id);
    try {
      await aiTriage.accept(rec.id);
      toast.success('Entwurf übernommen – Social-Post-Draft erstellt.');
      await query.refetch();
      navigate('/social');
    } catch {
      toast.error('Übernehmen fehlgeschlagen.');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (rec: AiRecommendation) => {
    setBusyId(rec.id);
    try {
      await aiTriage.reject(rec.id);
      toast.success('Empfehlung verworfen.');
      await query.refetch();
    } catch {
      toast.error('Verwerfen fehlgeschlagen.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" /> Marketing-Agent
        </CardTitle>
        <Button type="button" size="sm" onClick={() => void request()} disabled={requesting}>
          {requesting ? <Loader2 className="size-4 animate-spin" /> : 'Marketing-Entwurf erzeugen'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {recs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Empfehlungen. Erzeuge einen Entwurf – der Agent schlägt pro Kanal einen Post
            vor (Freigabe bleibt bei dir).
          </p>
        ) : (
          recs.map((rec) => (
            <div key={rec.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={rec.status === 'pending' ? 'default' : 'outline'} className="text-xs">
                    {rec.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground line-clamp-1">
                    {rec.suggestion?.summary ?? '(keine Zusammenfassung)'}
                  </span>
                </div>
                {rec.status === 'pending' ? (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" onClick={() => void accept(rec)} disabled={busyId === rec.id}>
                      <Check className="size-4" /> Übernehmen
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void reject(rec)}
                      disabled={busyId === rec.id}
                    >
                      <X className="size-4" /> Verwerfen
                    </Button>
                  </div>
                ) : null}
              </div>
              {(rec.suggestion?.variants ?? []).length > 0 ? (
                <ul className="space-y-1">
                  {(rec.suggestion?.variants ?? []).map((v, i) => (
                    <li key={`${rec.id}-${i}`} className="text-sm">
                      <span className="font-medium">{v.network ?? v.adapterCode}:</span>{' '}
                      <span className="text-muted-foreground">{v.body}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
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
  const { t } = useTranslation();
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
                      {t(badge.label)}
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
