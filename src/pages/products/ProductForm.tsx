import { useList, useInvalidate, useCreate, useDelete, useUpdate } from '@refinedev/core';
import { intlLocale } from '@/lib/intl';
import { useTranslation } from 'react-i18next';
import { useForm } from '@refinedev/react-hook-form';
import { ArrowLeft, Check, ChevronRight, ChevronsUpDown, GripVertical, Loader2, Plus, Save, Sparkles, Tag, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, type FieldValues } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { aiMarketing, aiTriage, type AiRecommendation } from '@/lib/ai';
import { readAuth, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { useMercureTopic } from '@/lib/mercure';
import {
  releaseVersion,
  VERSION_STATUS_BADGE,
  FEATURE_KIND_BADGE,
  type ProductFeatureJsonld,
  type ProductFeatureKind,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { LocalizedFields, type TranslationsMap } from '@/components/LocalizedFields';
import { TagPicker } from '@/components/TagPicker';
import { TagSuggestButton } from '@/components/TagSuggestButton';
import { useSupportedLanguages } from '@/lib/languages';

type Mode = { action: 'create' } | { action: 'edit'; id: string };

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function ProductForm(props: Mode) {
  const { t } = useTranslation();
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

  // name/description are edited through <LocalizedFields> (a controlled group,
  // not registered inputs), so register them here for required-validation and
  // inclusion in the submit payload.
  useEffect(() => {
    register('name', { required: true });
    register('description');
  }, [register]);
  const nameVal = (watch('name') as string | undefined) ?? '';
  const descVal = (watch('description') as string | undefined) ?? '';

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
              {isEdit ? (current?.name ?? t('action.edit')) : t('product_form.new_in_catalog')}
            </h2>
          </div>
          <Button type="submit" disabled={isSubmitting || formLoading}>
            <Save className="size-4" /> {t('action.save')}
          </Button>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <Controller
              control={control}
              name="translations"
              render={({ field }) => (
                <LocalizedFields
                  fields={[
                    { key: 'name', label: 'Name' },
                    { key: 'description', label: t('product_form.description'), multiline: true },
                  ]}
                  locales={languages}
                  base={{ name: nameVal, description: descVal }}
                  onBaseChange={(k, v) =>
                    setValue(k as 'name' | 'description', v, { shouldDirty: true, shouldValidate: true })
                  }
                  onBaseBlur={(k, v) => {
                    if (k === 'name' && !watch('slug')) setValue('slug', slugify(v));
                  }}
                  translations={(field.value as TranslationsMap | undefined) ?? {}}
                  onTranslationsChange={field.onChange}
                />
              )}
            />
            <div className="space-y-1.5">
              <Label htmlFor="slug">{t('product_form.key_slug')}</Label>
              <Input id="slug" placeholder={t('product_form.slug_placeholder')} {...register('slug')} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('product_form.type')}</Label>
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <Select value={field.value ?? 'product'} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="product">{t('product_form.type_product')}</SelectItem>
                        <SelectItem value="service">{t('product_form.type_service')}</SelectItem>
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
                        <SelectItem value="active">{t('product_form.status_active')}</SelectItem>
                        <SelectItem value="deprecated">{t('product_form.status_deprecated')}</SelectItem>
                        <SelectItem value="eol">EOL</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="category">{t('product_form.category')}</Label>
                <Input id="category" {...register('category')} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('product_form.parent')}</Label>
                <Controller
                  control={control}
                  name="parent"
                  render={({ field }) => (
                    <ParentSelect
                      value={(field.value as string | undefined) ?? undefined}
                      onChange={field.onChange}
                      excludeId={isEdit ? props.id : undefined}
                    />
                  )}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t('product_form.field_tags')}</Label>
              <Controller
                name="tags"
                control={control}
                render={({ field }) => {
                  const val = (field.value as string[] | undefined) ?? [];
                  return (
                    <div className="space-y-2">
                      <TagPicker value={val} onChange={field.onChange} scope="product" />
                      <TagSuggestButton
                        scope="product"
                        value={val}
                        onChange={field.onChange}
                        getText={() =>
                          [watch('name'), watch('category'), watch('description')]
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
      </form>

      {isEdit && type === 'product' && productIri ? (
        <ProductVersionsCard productId={props.id} productIri={productIri} onChange={() => invalidate({ resource: 'products', invalidates: ['detail'], id: props.id })} />
      ) : null}
      {isEdit && type === 'service' ? (
        <p className="text-sm text-muted-foreground">{t('product_form.services_versionless')}</p>
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
  const { t } = useTranslation();
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
      toast.success(t('toast.marketing_draft_requested'));
    } catch {
      toast.error(t('toast.llm_request_failed'));
    } finally {
      setRequesting(false);
    }
  };

  const accept = async (rec: AiRecommendation) => {
    setBusyId(rec.id);
    try {
      await aiTriage.accept(rec.id);
      toast.success(t('toast.draft_adopted_social'));
      await query.refetch();
      navigate('/social');
    } catch {
      toast.error(t('toast.adopt_failed'));
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (rec: AiRecommendation) => {
    setBusyId(rec.id);
    try {
      await aiTriage.reject(rec.id);
      toast.success(t('toast.recommendation_dismissed'));
      await query.refetch();
    } catch {
      toast.error(t('toast.dismiss_failed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" /> {t('product_form.marketing_agent')}
        </CardTitle>
        <Button type="button" size="sm" onClick={() => void request()} disabled={requesting}>
          {requesting ? <Loader2 className="size-4 animate-spin" /> : t('product_form.generate_marketing_draft')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {recs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('product_form.no_recommendations')}
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
                    {rec.suggestion?.summary ?? t('product_form.no_summary')}
                  </span>
                </div>
                {rec.status === 'pending' ? (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" onClick={() => void accept(rec)} disabled={busyId === rec.id}>
                      <Check className="size-4" /> {t('product_form.adopt')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void reject(rec)}
                      disabled={busyId === rec.id}
                    >
                      <X className="size-4" /> {t('product_form.reject')}
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
      toast.error(t('toast.enter_version'));
      return;
    }
    setSaving(true);
    try {
      await releaseVersion(productId, {
        version: version.trim(),
        releaseDate: releaseDate || null,
        releaseNotes: releaseNotes || null,
      });
      toast.success(t('toast.version_published', { version }));
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
          <Tag className="size-4 text-muted-foreground" /> {t('product_form.versions')}
        </CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Release
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('product_form.no_versions')}
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((v) => {
              const badge = VERSION_STATUS_BADGE[(v.status ?? 'supported') as ProductVersionStatus];
              return <VersionRow key={v['@id']} version={v} badge={badge} onChange={onChange} />;
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('product_form.publish_new_version')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ver">Version</Label>
              <Input
                id="ver"
                placeholder={t('product_form.version_placeholder')}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reldate">{t('product_form.release_date')}</Label>
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
              {t('product_form.release_hint')}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              {t('action.cancel')}
            </Button>
            <Button type="button" onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('product_form.publish')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function VersionRow({
  version,
  badge,
  onChange,
}: {
  version: Row<ProductVersionJsonld>;
  badge: { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' };
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const versionIri = version['@id'];

  const { result: featuresResult } = useList<Row<ProductFeatureJsonld>>({
    resource: 'product_features',
    filters: versionIri ? [{ field: 'version', operator: 'eq', value: versionIri }] : [],
    sorters: [{ field: 'position', order: 'asc' }],
    pagination: { mode: 'off' },
    queryOptions: { enabled: featuresOpen },
  });
  const features = featuresResult?.data ?? [];

  return (
    <li>
      <div
        className="flex cursor-pointer items-center justify-between py-2 hover:bg-muted/30"
        onClick={() => setFeaturesOpen((v) => !v)}
      >
        <span className="flex items-center gap-2 text-sm">
          <ChevronRight
            className={`size-3.5 text-muted-foreground transition-transform ${featuresOpen ? 'rotate-90' : ''}`}
          />
          <span className="font-mono">{version.version}</span>
          {version.isLatest ? (
            <Badge variant="default" className="text-[10px]">
              latest
            </Badge>
          ) : null}
          <Badge variant={badge.variant} className="text-[10px]">
            {t(badge.label)}
          </Badge>
          {features.length > 0 && !featuresOpen ? (
            <span className="text-xs text-muted-foreground">
              {t('product_form.feature_count', { count: features.length })}
            </span>
          ) : null}
        </span>
        <span className="text-xs text-muted-foreground">
          {version.releaseDate
            ? new Date(version.releaseDate).toLocaleDateString(intlLocale())
            : '—'}
        </span>
      </div>
      {featuresOpen ? (
        <div className="mb-2 ml-7 space-y-1">
          {features.map((f) => (
            <FeatureRow key={f['@id']} feature={f} onChanged={onChange} />
          ))}
          <AddFeatureForm versionIri={versionIri!} position={features.length} onAdded={onChange} />
        </div>
      ) : null}
    </li>
  );
}

function FeatureRow({
  feature,
  onChanged,
}: {
  feature: Row<ProductFeatureJsonld>;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { mutate: remove } = useDelete();
  const [editOpen, setEditOpen] = useState(false);
  const kindBadge = feature.kind ? FEATURE_KIND_BADGE[feature.kind as ProductFeatureKind] : null;

  return (
    <>
      <div
        className="flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-sm hover:bg-muted/30"
        onClick={() => setEditOpen(true)}
      >
        <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
        {feature.icon ? (
          <span className="shrink-0 text-xs">{feature.icon}</span>
        ) : null}
        <span className="min-w-0 flex-1 truncate font-medium">{feature.name}</span>
        {kindBadge ? (
          <Badge variant={kindBadge.variant} className="text-[10px] shrink-0">
            {t(kindBadge.label)}
          </Badge>
        ) : null}
        {feature.description ? (
          <span className="hidden text-muted-foreground md:inline md:max-w-[150px] md:truncate">
            {feature.description}
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            remove(
              { resource: 'product_features', id: feature.id! },
              { onSuccess: onChanged },
            );
          }}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      <FeatureEditDialog
        feature={feature}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onChanged}
      />
    </>
  );
}

function FeatureEditDialog({
  feature,
  open,
  onOpenChange,
  onSaved,
}: {
  feature: Row<ProductFeatureJsonld>;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(feature.name ?? '');
  const [icon, setIcon] = useState(feature.icon ?? '');
  const [desc, setDesc] = useState(feature.description ?? '');
  const [kind, setKind] = useState<string>(feature.kind ?? 'new');
  const { mutate: update, mutation: updateMut } = useUpdate();

  useEffect(() => {
    if (open) {
      setName(feature.name ?? '');
      setIcon(feature.icon ?? '');
      setDesc(feature.description ?? '');
      setKind(feature.kind ?? 'new');
    }
  }, [open, feature]);

  const submit = () => {
    if (!name.trim()) return;
    update(
      {
        resource: 'product_features',
        id: feature.id!,
        values: { name: name.trim(), icon: icon.trim() || null, description: desc.trim() || null, kind: kind || null },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSaved();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('product_form.edit_feature')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[60px_1fr] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="feat-icon">{t('product_form.feature_icon_placeholder')}</Label>
              <Input
                id="feat-icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={40}
                placeholder="🎯"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="feat-name">Name</Label>
              <Input
                id="feat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                autoFocus
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="feat-desc">{t('product_form.description')}</Label>
            <Textarea id="feat-desc" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Typ</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">{t('product.feature_kind.new')}</SelectItem>
                <SelectItem value="improved">{t('product.feature_kind.improved')}</SelectItem>
                <SelectItem value="fixed">{t('product.feature_kind.fixed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={updateMut.isPending}>
            {t('action.cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={updateMut.isPending || !name.trim()}>
            {t('action.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddFeatureForm({
  versionIri,
  position,
  onAdded,
}: {
  versionIri: string;
  position: number;
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [kind, setKind] = useState<string>('new');
  const { mutate: create, mutation: createMut } = useCreate();
  const creating = createMut.isPending;

  const submit = () => {
    if (!name.trim()) return;
    create(
      {
        resource: 'product_features',
        values: {
          version: versionIri,
          name: name.trim(),
          icon: icon.trim() || null,
          position,
          kind,
        },
      },
      {
        onSuccess: () => {
          setName('');
          setIcon('');
          setKind('new');
          setOpen(false);
          onAdded();
        },
      },
    );
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3" /> {t('product_form.add_feature')}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        className="h-7 w-14 text-xs"
        placeholder={t('product_form.feature_icon_placeholder')}
        value={icon}
        onChange={(e) => setIcon(e.target.value)}
        maxLength={40}
      />
      <Input
        className="h-7 flex-[2] text-xs"
        placeholder={t('product_form.feature_name_placeholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        autoFocus
      />
      <Select value={kind} onValueChange={setKind}>
        <SelectTrigger className="h-7 w-24 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="new">{t('product.feature_kind.new')}</SelectItem>
          <SelectItem value="improved">{t('product.feature_kind.improved')}</SelectItem>
          <SelectItem value="fixed">{t('product.feature_kind.fixed')}</SelectItem>
        </SelectContent>
      </Select>
      <Button type="button" size="sm" className="h-7 text-xs" onClick={submit} disabled={creating || !name.trim()}>
        {t('action.save')}
      </Button>
      <Button type="button" variant="ghost" size="icon" className="size-6" onClick={() => setOpen(false)}>
        <X className="size-3" />
      </Button>
    </div>
  );
}

function ParentSelect({
  value,
  onChange,
  excludeId,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  excludeId?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const { result } = useList<Row<ProductJsonld>>({
    resource: 'products',
    filters: [{ field: 'type', operator: 'eq', value: 'product' }],
    sorters: [{ field: 'name', order: 'asc' }],
    pagination: { mode: 'off' },
  });

  const products = (result?.data ?? []).filter(
    (p: Row<ProductJsonld>) => p['@id'] !== `/v1/products/${excludeId}`,
  );
  const selected = products.find((p: Row<ProductJsonld>) => p['@id'] === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? selected.name : t('product_form.parent_none')}
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={t('product_list.search_name')} />
          <CommandList>
            <CommandEmpty>{t('product_list.no_matches')}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
              >
                <span className={cn(!value && 'font-medium')}>
                  {t('product_form.parent_none')}
                </span>
              </CommandItem>
              {products.map((p: Row<ProductJsonld>) => (
                <CommandItem
                  key={p['@id']}
                  value={p.name ?? ''}
                  onSelect={() => {
                    onChange(p['@id']);
                    setOpen(false);
                  }}
                >
                  <span className={cn(p['@id'] === value && 'font-medium')}>
                    {p.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
