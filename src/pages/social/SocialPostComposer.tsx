import { useInvalidate, useList, useOne } from '@refinedev/core';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Eye,
  ExternalLink,
  Loader2,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { ChannelJsonld } from '@/api/types/channel/Jsonld';
import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';
import {
  isSocialAdapter,
  networkFor,
  POST_STATUS_BADGE,
  type PreviewResult,
  type SocialPostJsonld,
  type SocialPostStatus,
  type SocialPostTargetJsonld,
  socialActions,
  TARGET_STATUS_BADGE,
} from '@/lib/social';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type Mode = { action: 'create' } | { action: 'edit'; id: string };

type TargetState = {
  enabled: boolean;
  useOverride: boolean;
  override: string;
  // present only for already-persisted targets (edit mode):
  targetId?: string;
  targetIri?: string;
  status?: SocialPostTargetJsonld['status'];
  permalink?: string | null;
  errorReason?: string | null;
};

/** ISO datetime → value for <input type="datetime-local"> in local time. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * The Composer — "einmal verfassen → in mehrere Netzwerke veröffentlichen".
 *
 * Create mode lets you write the shared text, pick target networks (each with
 * an optional per-network variant), set a schedule, and save a draft. Publishing
 * is human-in-the-loop: after saving you land in edit mode, where the lifecycle
 * actions (einreichen → freigeben → planen/veröffentlichen) and the per-network
 * delivery state + AI suggestions + preview live. External sending stays gated
 * behind the backend's EgressGuard (social_publish) regardless of what's clicked.
 */
export function SocialPostComposer(props: Mode) {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const isEdit = props.action === 'edit';

  const { result: channels } = useList<Row<ChannelJsonld>>({
    resource: 'channels',
    pagination: { mode: 'off' },
  });
  const socialChannels = useMemo(
    () =>
      (channels?.data ?? []).filter(
        (c) => isSocialAdapter(c.adapterCode) && c.isEnabled !== false,
      ),
    [channels],
  );

  const { result: post, query: postQuery } = useOne<Row<SocialPostJsonld>>({
    resource: 'social_posts',
    id: isEdit ? props.id : '',
    queryOptions: { enabled: isEdit },
  });
  const postIri = post?.['@id'];

  const { result: targetRows, query: targetsQuery } = useList<Row<SocialPostTargetJsonld>>({
    resource: 'social_post_targets',
    filters: postIri ? [{ field: 'socialPost', operator: 'eq', value: postIri }] : [],
    pagination: { mode: 'off' },
    queryOptions: { enabled: Boolean(postIri) },
  });

  const [body, setBody] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [targets, setTargets] = useState<Record<string, TargetState>>({});
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  // Hydrate the form once the post loads (edit mode).
  useEffect(() => {
    if (post) {
      setBody(post.body ?? '');
      setScheduledAt(toLocalInput(post.scheduledAt));
    }
  }, [post]);

  // Hydrate target toggles from persisted targets (edit mode).
  useEffect(() => {
    const rows = targetRows?.data;
    if (!rows) return;
    setTargets((prev) => {
      const next = { ...prev };
      for (const t of rows) {
        if (!t.channel) continue;
        next[t.channel] = {
          enabled: true,
          useOverride: t.bodyOverride != null && t.bodyOverride !== '',
          override: t.bodyOverride ?? '',
          targetId: t.id,
          targetIri: t['@id'],
          status: t.status,
          permalink: t.permalink,
          errorReason: t.errorReason,
        };
      }
      return next;
    });
  }, [targetRows]);

  const status = (post?.status ?? 'draft') as SocialPostStatus;
  const locked = isEdit && ['publishing', 'published'].includes(status);

  const toggleNetwork = (iri: string, enabled: boolean) => {
    setTargets((prev) => ({
      ...prev,
      [iri]: {
        ...(prev[iri] ?? { useOverride: false, override: '' }),
        enabled,
      },
    }));
  };

  const setOverride = (iri: string, value: string) => {
    setTargets((prev) => ({ ...prev, [iri]: { ...prev[iri], override: value } }));
  };

  const setUseOverride = (iri: string, use: boolean) => {
    setTargets((prev) => ({ ...prev, [iri]: { ...prev[iri], useOverride: use } }));
  };

  const enabledChannels = socialChannels.filter((c) => c['@id'] && targets[c['@id']]?.enabled);

  // Most restrictive char limit among networks that use the shared body
  // (no per-network override). Used to warn while typing the base text.
  const sharedLimit = useMemo(() => {
    const limits = enabledChannels
      .filter((c) => !(c['@id'] && targets[c['@id']!]?.useOverride))
      .map((c) => networkFor(c.adapterCode).charLimit);
    return limits.length ? Math.min(...limits) : Infinity;
  }, [enabledChannels, targets]);

  const workspaceIri = (() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    return id ? `/v1/workspaces/${id}` : undefined;
  })();

  async function handleSave() {
    if (!body.trim()) {
      toast.error('Der Beitragstext darf nicht leer sein.');
      return;
    }
    if (enabledChannels.length === 0) {
      toast.error('Wähle mindestens ein Netzwerk aus.');
      return;
    }
    setSaving(true);
    try {
      if (!isEdit) {
        const { data: created } = await api.post<Row<SocialPostJsonld>>('/social_posts', {
          body,
          mediaRefs: [],
          scheduledAt: toIso(scheduledAt),
          workspace: workspaceIri,
        });
        const createdIri = created['@id'];
        for (const c of enabledChannels) {
          const t = targets[c['@id']!];
          await api.post('/social_post_targets', {
            socialPost: createdIri,
            channel: c['@id'],
            bodyOverride: t.useOverride && t.override.trim() ? t.override : null,
          });
        }
        toast.success('Entwurf gespeichert.');
        if (created.id) navigate(`/social/${created.id}`);
        return;
      }

      // edit: reconcile targets with the only ops the API exposes. There is
      // no PATCH/DELETE on social_post_targets — instead SocialPost.targets is
      // a writable IRI list with orphanRemoval, so the supported moves are:
      //  · add a network        → POST a new target
      //  · change an override    → POST a fresh target, drop the old one
      //  · remove a network      → omit its IRI from the parent PATCH
      // Published / in-flight targets are immutable history — always kept.
      const persisted = targetRows?.data ?? [];
      const byChannel = new Map(persisted.map((t) => [t.channel ?? '', t]));
      const keptIris: string[] = [];
      let failures = 0;

      for (const c of socialChannels) {
        const iri = c['@id'];
        if (!iri) continue;
        const existing = byChannel.get(iri);
        const t = targets[iri];
        const desired = t?.useOverride && t.override.trim() ? t.override : null;

        if (existing && (existing.status === 'published' || existing.status === 'publishing')) {
          if (existing['@id']) keptIris.push(existing['@id']);
          continue;
        }
        if (!t?.enabled) continue; // dropped → orphan-removed by the parent PATCH

        const overrideChanged = (existing?.bodyOverride ?? null) !== desired;
        if (existing && !overrideChanged) {
          if (existing['@id']) keptIris.push(existing['@id']);
          continue;
        }
        try {
          const { data } = await api.post<Row<SocialPostTargetJsonld>>('/social_post_targets', {
            socialPost: postIri,
            channel: iri,
            bodyOverride: desired,
          });
          if (data['@id']) keptIris.push(data['@id']);
        } catch {
          failures += 1;
          if (existing?.['@id']) keptIris.push(existing['@id']); // keep old on failure
        }
      }

      await api.patch(
        `/social_posts/${props.id}`,
        { body, scheduledAt: toIso(scheduledAt), targets: keptIris },
        { headers: { 'Content-Type': 'application/merge-patch+json' } },
      );

      if (failures) {
        toast.error(`Gespeichert, aber ${failures} Netzwerk(e) fehlerhaft.`);
      } else {
        toast.success('Gespeichert.');
      }
      await Promise.all([postQuery.refetch(), targetsQuery.refetch()]);
      invalidate({ resource: 'social_posts', invalidates: ['detail', 'list'], id: props.id });
    } catch {
      toast.error('Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(name: string, fn: () => Promise<unknown>, okMsg: string) {
    setBusyAction(name);
    try {
      await fn();
      toast.success(okMsg);
      await Promise.all([postQuery.refetch(), targetsQuery.refetch()]);
      invalidate({ resource: 'social_posts', invalidates: ['detail', 'list'], id: (props as { id?: string }).id });
    } catch (e) {
      const msg =
        (e as { response?: { data?: { detail?: string; 'hydra:description'?: string } } })?.response
          ?.data?.detail ??
        (e as { response?: { data?: { 'hydra:description'?: string } } })?.response?.data?.[
          'hydra:description'
        ] ??
        'Aktion fehlgeschlagen.';
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  }

  async function runActionWithPreview() {
    if (!isEdit) return;
    setBusyAction('preview');
    try {
      const result = await socialActions.preview(props.id);
      setPreview(result);
    } catch {
      toast.error('Vorschau fehlgeschlagen.');
    } finally {
      setBusyAction(null);
    }
  }

  async function aiSuggestAll() {
    if (!isEdit) return;
    setBusyAction('ai');
    try {
      const suggestions = await socialActions.aiSuggest(props.id);
      setTargets((prev) => {
        const next = { ...prev };
        for (const s of suggestions) {
          const ch = socialChannels.find((c) => c.adapterCode === s.adapterCode);
          const iri = ch?.['@id'];
          if (iri && next[iri]) {
            next[iri] = { ...next[iri], useOverride: true, override: s.suggestion };
          }
        }
        return next;
      });
      toast.success(`${suggestions.length} KI-Vorschlag/Vorschläge übernommen — bitte prüfen & speichern.`);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'KI-Vorschlag nicht verfügbar (ANTHROPIC_API_KEY?).';
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  }

  if (isEdit && postQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const badge = POST_STATUS_BADGE[status];
  const canEditContent = !locked;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" onClick={() => navigate('/social')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h2 className="text-2xl">{isEdit ? 'Beitrag bearbeiten' : 'Neuer Beitrag'}</h2>
            <p className="text-sm text-muted-foreground">
              Einmal verfassen, in mehrere Netzwerke veröffentlichen.
            </p>
          </div>
          {isEdit && badge ? (
            <Badge variant={badge.variant} className="ml-2">
              {badge.label}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {canEditContent ? (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isEdit ? 'Speichern' : 'Entwurf speichern'}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ---- Shared content ------------------------------------------- */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Inhalt</CardTitle>
            {isEdit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={aiSuggestAll}
                disabled={busyAction === 'ai' || enabledChannels.length === 0}
              >
                {busyAction === 'ai' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                KI-Vorschläge
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="body">Beitragstext</Label>
              <Textarea
                id="body"
                rows={6}
                value={body}
                disabled={!canEditContent}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Was möchtest du teilen?"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Geteilter Text — pro Netzwerk unten anpassbar.</span>
                {sharedLimit !== Infinity ? (
                  <span className={body.length > sharedLimit ? 'font-medium text-destructive' : ''}>
                    {body.length} / {sharedLimit}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="rounded-md border border-dashed border-input p-3 text-xs text-muted-foreground">
              Medien-Upload (Bilder/Video) folgt — der Beitrag wird vorerst als
              Text veröffentlicht.
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="scheduledAt" className="flex items-center gap-1.5">
                <CalendarClock className="size-4" /> Planen (optional)
              </Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={scheduledAt}
                disabled={!canEditContent}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-64"
              />
              <p className="text-xs text-muted-foreground">
                Leer = nicht zeitgesteuert; Veröffentlichung erfolgt manuell nach Freigabe.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ---- Networks ------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Netzwerke</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {socialChannels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine Social-Kanäle verbunden. Lege unter <strong>Quellen</strong> einen
                <code className="mx-1">social_*</code>-Kanal an.
              </p>
            ) : (
              socialChannels.map((c) => {
                const iri = c['@id']!;
                const meta = networkFor(c.adapterCode);
                const t = targets[iri];
                const enabled = !!t?.enabled;
                const text = t?.useOverride ? t.override : body;
                const over = text.length > meta.charLimit;
                const targetBadge = t?.status ? TARGET_STATUS_BADGE[t.status] : null;
                return (
                  <div key={iri} className="rounded-md border border-input p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${meta.accent}`}
                      >
                        {meta.short}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{meta.label}</div>
                        <div className="truncate text-xs text-muted-foreground">{c.name}</div>
                      </div>
                      {targetBadge ? (
                        <Badge variant={targetBadge.variant} className="text-[10px]">
                          {targetBadge.label}
                        </Badge>
                      ) : null}
                      <Switch
                        checked={enabled}
                        disabled={
                          !canEditContent ||
                          t?.status === 'published' ||
                          t?.status === 'publishing'
                        }
                        onCheckedChange={(v) => toggleNetwork(iri, v)}
                      />
                    </div>

                    {enabled ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Eigene Variante</Label>
                          <Switch
                            checked={!!t?.useOverride}
                            disabled={!canEditContent}
                            onCheckedChange={(v) => setUseOverride(iri, v)}
                          />
                        </div>
                        {t?.useOverride ? (
                          <Textarea
                            rows={3}
                            value={t.override}
                            disabled={!canEditContent}
                            onChange={(e) => setOverride(iri, e.target.value)}
                            placeholder={`Variante für ${meta.label}…`}
                          />
                        ) : null}
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>{t?.useOverride ? 'Variante' : 'geteilter Text'}</span>
                          <span className={over ? 'font-medium text-destructive' : ''}>
                            {text.length} / {meta.charLimit}
                          </span>
                        </div>
                        {t?.status === 'failed' && t.errorReason ? (
                          <p className="text-[11px] text-destructive">{t.errorReason}</p>
                        ) : null}
                        {t?.permalink ? (
                          <a
                            href={t.permalink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                          >
                            <ExternalLink className="size-3" /> Beitrag ansehen
                          </a>
                        ) : null}
                        {isEdit && t?.status === 'failed' && t.targetId ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={busyAction === `retry-${t.targetId}`}
                            onClick={() =>
                              runAction(
                                `retry-${t.targetId}`,
                                () => socialActions.retryTarget(t.targetId!),
                                'Erneuter Versuch eingereiht.',
                              )
                            }
                          >
                            <RefreshCw className="size-3" /> Erneut versuchen
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- Lifecycle actions (edit only) ------------------------------ */}
      {isEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Veröffentlichung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busyAction === 'preview'}
                onClick={() =>
                  runActionWithPreview()
                }
              >
                {busyAction === 'preview' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Eye className="size-4" />
                )}
                Vorschau prüfen
              </Button>

              {status === 'draft' ? (
                <Button
                  type="button"
                  disabled={busyAction === 'submit'}
                  onClick={() =>
                    runAction('submit', () => socialActions.submit(props.id), 'Zur Freigabe eingereicht.')
                  }
                >
                  <Send className="size-4" /> Zur Freigabe einreichen
                </Button>
              ) : null}

              {status === 'pending_approval' ? (
                <Button
                  type="button"
                  disabled={busyAction === 'approve'}
                  onClick={() =>
                    runAction('approve', () => socialActions.approve(props.id), 'Freigegeben.')
                  }
                >
                  <CheckCircle2 className="size-4" /> Freigeben
                </Button>
              ) : null}

              {['pending_approval', 'scheduled', 'partially_failed', 'failed'].includes(status) ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busyAction === 'publish'}
                  onClick={() =>
                    runAction('publish', () => socialActions.publish(props.id), 'Veröffentlichung angestoßen.')
                  }
                >
                  <Send className="size-4" /> Jetzt veröffentlichen
                </Button>
              ) : null}

              {scheduledAt && ['pending_approval', 'scheduled'].includes(status) ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busyAction === 'schedule'}
                  onClick={() =>
                    runAction(
                      'schedule',
                      () => socialActions.schedule(props.id, toIso(scheduledAt)),
                      'Geplant.',
                    )
                  }
                >
                  <CalendarClock className="size-4" /> Für {new Date(scheduledAt).toLocaleString()} planen
                </Button>
              ) : null}

              {!['published', 'canceled'].includes(status) ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  disabled={busyAction === 'cancel'}
                  onClick={() =>
                    runAction('cancel', () => socialActions.cancel(props.id), 'Abgebrochen.')
                  }
                >
                  <XCircle className="size-4" /> Abbrechen
                </Button>
              ) : null}
            </div>

            <p className="text-xs text-muted-foreground">
              Externes Senden ist serverseitig durch die Egress-Freigabe
              (<code>social_publish</code>) geschützt — ohne Freigabe verlässt nichts das System.
            </p>

            {preview ? (
              <div className="space-y-1 rounded-md border border-input p-3 text-sm">
                <div className="font-medium">
                  {preview.valid ? 'Vorschau gültig ✓' : 'Vorschau: Probleme gefunden'}
                </div>
                {(preview.targets ?? []).map((pt, i) => (
                  <div key={pt.targetId ?? i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {networkFor(pt.adapterCode).label} · {pt.length ?? '?'}/{pt.maxLength ?? '?'}
                    </span>
                    {pt.problems && pt.problems.length ? (
                      <span className="text-destructive">{pt.problems.join('; ')}</span>
                    ) : (
                      <span className="text-emerald-600">ok</span>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
