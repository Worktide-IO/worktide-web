import { useList } from '@refinedev/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Loader2, Mail, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { type DragEvent, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { LocalizedFields, type TranslationsMap } from '@/components/LocalizedFields';
import { useSupportedLanguages, useLocalize } from '@/lib/languages';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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
import { Skeleton } from '@/components/ui/skeleton';
import { NewsletterIssuesDialog } from './NewsletterIssuesDialog';
import { NewsletterTemplatesDialog } from './NewsletterTemplatesDialog';
import { NewsletterSettingsDialog } from './NewsletterSettingsDialog';

/** Minimal shape of a Newsletter node (we call the API directly, like IndustriesPage). */
type NewsletterRow = Row<{
  '@id': string;
  id?: string;
  title: string;
  description?: string | null;
  parent?: string | null; // parent IRI or null for roots
  position?: number;
  estimatedFrequency?: string | null;
  slug?: string | null;
  icon?: string;
  color?: string;
  // Read names: API-Platform strips the "is" prefix from boolean getters
  // (isArchived() → `archived`), while WRITES use `isArchived`/`isSubscribable`
  // (the setter-derived names). This asymmetry matches the rest of the app.
  archived?: boolean;
  subscribable?: boolean;
  mandatory?: boolean;
  translations?: TranslationsMap | null;
}>;

type EditState = {
  id?: string; // set → edit; unset → create
  title: string;
  description: string;
  parentIri: string | null;
  estimatedFrequency: string; // '' = not stated
  slug: string;
  icon: string;
  color: string;
  isArchived: boolean;
  isSubscribable: boolean;
  isMandatory: boolean;
  translations: TranslationsMap;
};

const ROOT = '__root__';

/** Matches the backend NewsletterFrequency enum; '' in the UI = null server-side. */
const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly', 'irregular'] as const;
const FREQ_NONE = '__none__';

type SubscriberCounts = Record<string, { active: number; pending: number; revoked: number }>;

/** Subscriber tallies per newsletter IRI (one grouped aggregate call, react-query-deduped). */
async function fetchSubscriberCounts(): Promise<SubscriberCounts> {
  const { data } = await api.get<{ counts: SubscriberCounts }>('/reports/newsletter-subscriber-counts');
  // Empty result serialises as [] server-side; normalise to an object for lookups.
  return Array.isArray(data.counts) ? {} : data.counts;
}

type DropZone = 'before' | 'after' | 'inside';

/**
 * Newsletter tree management — the per-workspace topic tree customers subscribe
 * to in the portal. Create / rename / move (via a parent picker) / delete, with
 * arbitrary nesting. Ordering is server-assigned via `position`; drag-reorder is
 * a deliberate follow-up (see docs). Customers are then granted individual nodes
 * on the customer's "Newsletter" tab.
 */
export function NewslettersPage() {
  const { t: translate } = useTranslation();
  const { languages } = useSupportedLanguages();
  const { result, query } = useList<NewsletterRow>({
    resource: 'newsletters',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });

  const [rootTitle, setRootTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [sendFor, setSendFor] = useState<{ iri: string; title: string } | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draggingIri, setDraggingIri] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ iri: string; zone: DropZone } | null>(null);

  const rows = useMemo(() => result?.data ?? [], [result]);

  const workspaceIri = (() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    return id ? `/v1/workspaces/${id}` : undefined;
  })();

  const iriOf = (r: NewsletterRow) => r['@id'] ?? (r.id ? `/v1/newsletters/${r.id}` : '');
  const idOf = (r: NewsletterRow) => r.id ?? iriOf(r).split('/').pop() ?? '';

  // children-by-parent-IRI map (root bucket under ROOT)
  const childrenByParent = useMemo(() => {
    const map: Record<string, NewsletterRow[]> = {};
    for (const r of rows) {
      const key = r.parent ?? ROOT;
      (map[key] ??= []).push(r);
    }
    return map;
  }, [rows]);

  // ids reachable under a node (to forbid moving a node into its own subtree)
  const descendantIris = (iri: string, acc = new Set<string>()): Set<string> => {
    for (const child of childrenByParent[iri] ?? []) {
      const ci = iriOf(child);
      acc.add(ci);
      descendantIris(ci, acc);
    }
    return acc;
  };

  const addRoot = async () => {
    const t = rootTitle.trim();
    if (!t) return;
    setBusy(true);
    try {
      await api.post('/newsletters', {
        title: t,
        position: (childrenByParent[ROOT]?.length ?? 0),
        workspace: workspaceIri,
      });
      toast.success(translate('toast.created_named_dq', { name: t }));
      setRootTitle('');
      await query.refetch();
    } catch {
      toast.error(translate('toast.create_failed'));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!edit) return;
    const t = edit.title.trim();
    if (!t) return;
    setBusy(true);
    try {
      const shared = {
        description: edit.description.trim() || null,
        parent: edit.parentIri,
        estimatedFrequency: edit.estimatedFrequency || null,
        slug: edit.slug.trim() || null,
        icon: edit.icon.trim() || 'mail',
        color: edit.color.trim() || '#94a3b8',
        isArchived: edit.isArchived,
        isSubscribable: edit.isSubscribable,
        isMandatory: edit.isMandatory,
        translations: edit.translations,
      };
      if (edit.id) {
        await api.patch(
          `/newsletters/${edit.id}`,
          { title: t, ...shared },
          { headers: { 'Content-Type': 'application/merge-patch+json' } },
        );
        toast.success(translate('toast.saved'));
      } else {
        const siblings = childrenByParent[edit.parentIri ?? ROOT]?.length ?? 0;
        await api.post('/newsletters', {
          title: t,
          ...shared,
          position: siblings,
          // Root needs an explicit workspace; children inherit it server-side.
          ...(edit.parentIri ? {} : { workspace: workspaceIri }),
        });
        toast.success(translate('toast.created'));
      }
      setEdit(null);
      await query.refetch();
    } catch {
      toast.error(translate('toast.save_failed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: NewsletterRow) => {
    const hasChildren = (childrenByParent[iriOf(r)]?.length ?? 0) > 0;
    const msg = hasChildren
      ? translate('newsletters.confirm_delete_with_children', { title: r.title })
      : translate('newsletters.confirm_delete', { title: r.title });
    if (!window.confirm(msg)) return;
    try {
      await api.delete(`/newsletters/${idOf(r)}`);
      toast.success(translate('toast.deleted'));
      await query.refetch();
    } catch {
      toast.error(translate('toast.delete_failed'));
    }
  };

  // Drag-and-drop reorder/nest. Dropping in a row's top/bottom quarter reorders
  // it before/after that node (same parent); the middle nests it as a child.
  // Position is a float so a node slots between two siblings without renumbering.
  const moveNode = async (draggedIri: string, target: NewsletterRow, zone: DropZone) => {
    const dragged = rows.find((r) => iriOf(r) === draggedIri);
    if (!dragged || draggedIri === iriOf(target)) return;
    const forbidden = descendantIris(draggedIri);
    forbidden.add(draggedIri);
    if (forbidden.has(iriOf(target))) {
      toast.error(translate('toast.cannot_move_into_self'));
      return;
    }

    let parent: string | null;
    let position: number;
    if (zone === 'inside') {
      parent = iriOf(target);
      const kids = childrenByParent[iriOf(target)] ?? [];
      position = kids.length ? Math.max(...kids.map((k) => k.position ?? 0)) + 1 : 0;
    } else {
      parent = target.parent ?? null;
      const sibs = (childrenByParent[target.parent ?? ROOT] ?? []).filter(
        (s) => iriOf(s) !== draggedIri,
      );
      const idx = sibs.findIndex((s) => iriOf(s) === iriOf(target));
      const targetPos = target.position ?? 0;
      if (zone === 'before') {
        const prev = sibs[idx - 1];
        position = prev ? ((prev.position ?? 0) + targetPos) / 2 : targetPos - 1;
      } else {
        const next = sibs[idx + 1];
        position = next ? (targetPos + (next.position ?? 0)) / 2 : targetPos + 1;
      }
    }

    try {
      await api.patch(
        `/newsletters/${idOf(dragged)}`,
        { parent, position },
        { headers: { 'Content-Type': 'application/merge-patch+json' } },
      );
      await query.refetch();
    } catch {
      toast.error(translate('toast.move_failed'));
    }
  };

  // Options for the parent picker in the dialog: every node except the one being
  // edited and its descendants (would create a cycle).
  const parentOptions = useMemo(() => {
    const forbidden = new Set<string>();
    if (edit?.id) {
      const selfIri = `/v1/newsletters/${edit.id}`;
      forbidden.add(selfIri);
      descendantIris(selfIri).forEach((i) => forbidden.add(i));
    }
    const opts: { iri: string; label: string }[] = [];
    const walk = (parentKey: string, depth: number) => {
      for (const n of childrenByParent[parentKey] ?? []) {
        const iri = iriOf(n);
        if (!forbidden.has(iri)) {
          opts.push({ iri, label: `${'  '.repeat(depth)}${n.title}` });
        }
        walk(iri, depth + 1);
      }
    };
    walk(ROOT, 0);
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childrenByParent, edit?.id]);

  const rootNodes = childrenByParent[ROOT] ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-2xl">
            <Mail className="size-6 text-muted-foreground" /> Newsletter
          </h2>
          <p className="text-sm text-muted-foreground">
            {translate('newsletters.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)}>
            {translate('newsletters.settings')}
          </Button>
          <Button type="button" variant="outline" onClick={() => setTemplatesOpen(true)}>
            {translate('newsletters.templates')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{translate('newsletters.new_root_topic')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder={translate('newsletters.root_placeholder')}
              value={rootTitle}
              onChange={(e) => setRootTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addRoot();
              }}
              className="max-w-sm"
            />
            <Button type="button" onClick={addRoot} disabled={busy || !rootTitle.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {translate('action.add')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{translate('newsletters.topics_count', { count: rows.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : rootNodes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{translate('newsletters.empty')}</p>
          ) : (
            <div className="divide-y">
              {rootNodes.map((n) => (
                <NewsletterNode
                  key={iriOf(n)}
                  node={n}
                  depth={0}
                  iriOf={iriOf}
                  childrenByParent={childrenByParent}
                  onAddChild={(parentIri) =>
                    setEdit({
                      title: '',
                      description: '',
                      parentIri,
                      estimatedFrequency: '',
                      slug: '',
                      icon: 'mail',
                      color: '#94a3b8',
                      isArchived: false,
                      isSubscribable: true,
                      isMandatory: false,
                      translations: {},
                    })
                  }
                  onEdit={(r) =>
                    setEdit({
                      id: idOf(r),
                      title: r.title,
                      description: r.description ?? '',
                      parentIri: r.parent ?? null,
                      estimatedFrequency: r.estimatedFrequency ?? '',
                      slug: r.slug ?? '',
                      icon: r.icon ?? 'mail',
                      color: r.color ?? '#94a3b8',
                      isArchived: r.archived ?? false,
                      isSubscribable: r.subscribable ?? true,
                      isMandatory: r.mandatory ?? false,
                      translations: r.translations ?? {},
                    })
                  }
                  onSend={(r) => setSendFor({ iri: iriOf(r), title: r.title })}
                  onDelete={remove}
                  draggingIri={draggingIri}
                  dropHint={dropHint}
                  onDragStartNode={setDraggingIri}
                  onDragOverNode={(iri, zone) => setDropHint({ iri, zone })}
                  onDropNode={(t, zone) => {
                    if (draggingIri) void moveNode(draggingIri, t, zone);
                    setDraggingIri(null);
                    setDropHint(null);
                  }}
                  onDragEndNode={() => {
                    setDraggingIri(null);
                    setDropHint(null);
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {sendFor ? (
        <NewsletterIssuesDialog
          nodeIri={sendFor.iri}
          nodeTitle={sendFor.title}
          open={sendFor !== null}
          onOpenChange={(o) => !o && setSendFor(null)}
        />
      ) : null}

      <NewsletterTemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} />
      <NewsletterSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <Dialog open={edit !== null} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? translate('newsletters.edit_topic') : translate('newsletters.new_topic')}</DialogTitle>
          </DialogHeader>
          {edit ? (
            <div className="space-y-3">
              <LocalizedFields
                fields={[
                  { key: 'title', label: translate('newsletters.title_label'), autoFocus: true },
                  { key: 'description', label: translate('newsletters.description_optional'), multiline: true },
                ]}
                locales={languages}
                base={{ title: edit.title, description: edit.description }}
                onBaseChange={(k, v) => setEdit({ ...edit, [k]: v } as EditState)}
                translations={edit.translations}
                onTranslationsChange={(translations) => setEdit({ ...edit, translations })}
              />
              <div className="space-y-1">
                <Label>{translate('newsletters.parent')}</Label>
                <Select
                  value={edit.parentIri ?? ROOT}
                  onValueChange={(v) => setEdit({ ...edit, parentIri: v === ROOT ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROOT}>{translate('newsletters.root_level')}</SelectItem>
                    {parentOptions.map((o) => (
                      <SelectItem key={o.iri} value={o.iri}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{translate('newsletters.frequency_label')}</Label>
                <Select
                  value={edit.estimatedFrequency === '' ? FREQ_NONE : edit.estimatedFrequency}
                  onValueChange={(v) =>
                    setEdit({ ...edit, estimatedFrequency: v === FREQ_NONE ? '' : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FREQ_NONE}>{translate('newsletters.frequency_none')}</SelectItem>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {translate(`newsletters.frequency.${f}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{translate('newsletters.icon_label')}</Label>
                  <div className="flex items-center gap-2">
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded"
                      style={{ color: edit.color, backgroundColor: `${edit.color}1f` }}
                    >
                      <DynamicIcon
                        name={(edit.icon || 'mail') as Parameters<typeof DynamicIcon>[0]['name']}
                        className="size-4"
                      />
                    </span>
                    <Input
                      value={edit.icon}
                      placeholder="mail"
                      onChange={(e) => setEdit({ ...edit, icon: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>{translate('newsletters.color_label')}</Label>
                  <Input
                    type="color"
                    value={edit.color}
                    onChange={(e) => setEdit({ ...edit, color: e.target.value })}
                    className="h-9 w-full p-1"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{translate('newsletters.slug_label')}</Label>
                <Input
                  value={edit.slug}
                  placeholder={translate('newsletters.slug_placeholder')}
                  onChange={(e) => setEdit({ ...edit, slug: e.target.value })}
                />
              </div>
              <label className="flex items-center justify-between gap-2 py-1">
                <span className="text-sm">
                  {translate('newsletters.subscribable_label')}
                  <span className="block text-xs text-muted-foreground">{translate('newsletters.subscribable_hint')}</span>
                </span>
                <Switch
                  checked={edit.isSubscribable}
                  onCheckedChange={(v) => setEdit({ ...edit, isSubscribable: v })}
                />
              </label>
              <label className="flex items-center justify-between gap-2 py-1">
                <span className="text-sm">
                  {translate('newsletters.mandatory_label')}
                  <span className="block text-xs text-muted-foreground">{translate('newsletters.mandatory_hint')}</span>
                </span>
                <Switch
                  checked={edit.isMandatory}
                  onCheckedChange={(v) => setEdit({ ...edit, isMandatory: v })}
                />
              </label>
              <label className="flex items-center justify-between gap-2 py-1">
                <span className="text-sm">
                  {translate('newsletters.archived_label')}
                  <span className="block text-xs text-muted-foreground">{translate('newsletters.archived_hint')}</span>
                </span>
                <Switch
                  checked={edit.isArchived}
                  onCheckedChange={(v) => setEdit({ ...edit, isArchived: v })}
                />
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEdit(null)} disabled={busy}>
              {translate('action.cancel')}
            </Button>
            <Button type="button" onClick={save} disabled={busy || !edit?.title.trim()}>
              {translate('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewsletterNode({
  node,
  depth,
  iriOf,
  childrenByParent,
  onAddChild,
  onEdit,
  onSend,
  onDelete,
  draggingIri,
  dropHint,
  onDragStartNode,
  onDragOverNode,
  onDropNode,
  onDragEndNode,
}: {
  node: NewsletterRow;
  depth: number;
  iriOf: (r: NewsletterRow) => string;
  childrenByParent: Record<string, NewsletterRow[]>;
  onAddChild: (parentIri: string) => void;
  onEdit: (r: NewsletterRow) => void;
  onSend: (r: NewsletterRow) => void;
  onDelete: (r: NewsletterRow) => void;
  draggingIri: string | null;
  dropHint: { iri: string; zone: DropZone } | null;
  onDragStartNode: (iri: string) => void;
  onDragOverNode: (iri: string, zone: DropZone) => void;
  onDropNode: (target: NewsletterRow, zone: DropZone) => void;
  onDragEndNode: () => void;
}) {
  const { t: translate } = useTranslation();
  const localize = useLocalize();
  const { data: subCounts } = useQuery({
    queryKey: ['newsletter-subscriber-counts'],
    queryFn: fetchSubscriberCounts,
    staleTime: 60_000,
  });
  const iri = iriOf(node);
  const counts = subCounts?.[iri];
  const children = childrenByParent[iri] ?? [];
  const hint = dropHint?.iri === iri ? dropHint.zone : null;
  const zoneFrom = (e: DragEvent<HTMLDivElement>): DropZone => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    return y < rect.height * 0.25 ? 'before' : y > rect.height * 0.75 ? 'after' : 'inside';
  };
  return (
    <>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          onDragStartNode(iri);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (draggingIri && draggingIri !== iri) onDragOverNode(iri, zoneFrom(e));
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDropNode(node, zoneFrom(e));
        }}
        onDragEnd={onDragEndNode}
        className={[
          'group flex items-center gap-2 py-2',
          draggingIri === iri ? 'opacity-40' : '',
          node.archived ? 'opacity-50' : '',
          hint === 'inside' ? 'rounded bg-primary/10 ring-1 ring-primary/40' : '',
          hint === 'before' ? 'border-t-2 border-primary' : '',
          hint === 'after' ? 'border-b-2 border-primary' : '',
        ].join(' ')}
        style={{ paddingLeft: depth * 20 }}
      >
        {children.length > 0 ? (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <span className="inline-block size-4 shrink-0" />
        )}
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded"
          style={{ color: node.color ?? '#94a3b8', backgroundColor: `${node.color ?? '#94a3b8'}1f` }}
        >
          <DynamicIcon
            name={(node.icon || 'mail') as Parameters<typeof DynamicIcon>[0]['name']}
            className="size-3.5"
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{localize(node, 'title')}</span>
            {node.estimatedFrequency ? (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {translate(`newsletters.frequency.${node.estimatedFrequency}`)}
              </span>
            ) : null}
            {node.mandatory ? (
              <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                {translate('newsletters.badge_mandatory')}
              </span>
            ) : null}
            {node.subscribable === false && !node.mandatory ? (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {translate('newsletters.badge_structure')}
              </span>
            ) : null}
            {node.archived ? (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                {translate('newsletters.badge_archived')}
              </span>
            ) : null}
            {counts && (counts.active > 0 || counts.pending > 0) ? (
              <span
                className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                title={translate('newsletters.subscribers_tooltip', {
                  active: counts.active,
                  pending: counts.pending,
                  revoked: counts.revoked,
                })}
              >
                {translate('newsletters.subscribers_badge', { count: counts.active })}
              </span>
            ) : null}
          </div>
          {node.description ? (
            <div className="truncate text-xs text-muted-foreground">{localize(node, 'description')}</div>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
          <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => onSend(node)}>
            <Send className="size-3" /> {translate('newsletters.send')}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => onAddChild(iri)}>
            <Plus className="size-3" /> {translate('newsletters.subtopic')}
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => onEdit(node)}>
            <Pencil className="size-3" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => onDelete(node)}>
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
      {children.map((c) => (
        <NewsletterNode
          key={iriOf(c)}
          node={c}
          depth={depth + 1}
          iriOf={iriOf}
          childrenByParent={childrenByParent}
          onAddChild={onAddChild}
          onEdit={onEdit}
          onSend={onSend}
          onDelete={onDelete}
          draggingIri={draggingIri}
          dropHint={dropHint}
          onDragStartNode={onDragStartNode}
          onDragOverNode={onDragOverNode}
          onDropNode={onDropNode}
          onDragEndNode={onDragEndNode}
        />
      ))}
    </>
  );
}
