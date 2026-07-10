import { useList } from '@refinedev/core';
import { ChevronRight, Loader2, Mail, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

/** Minimal shape of a Newsletter node (we call the API directly, like IndustriesPage). */
type NewsletterRow = Row<{
  '@id': string;
  id?: string;
  title: string;
  description?: string | null;
  parent?: string | null; // parent IRI or null for roots
  position?: number;
}>;

type EditState = {
  id?: string; // set → edit; unset → create
  title: string;
  description: string;
  parentIri: string | null;
};

const ROOT = '__root__';

/**
 * Newsletter tree management — the per-workspace topic tree customers subscribe
 * to in the portal. Create / rename / move (via a parent picker) / delete, with
 * arbitrary nesting. Ordering is server-assigned via `position`; drag-reorder is
 * a deliberate follow-up (see docs). Customers are then granted individual nodes
 * on the customer's "Newsletter" tab.
 */
export function NewslettersPage() {
  const { result, query } = useList<NewsletterRow>({
    resource: 'newsletters',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });

  const [rootTitle, setRootTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);

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
      toast.success(`„${t}" angelegt.`);
      setRootTitle('');
      await query.refetch();
    } catch {
      toast.error('Anlegen fehlgeschlagen.');
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
      if (edit.id) {
        await api.patch(
          `/newsletters/${edit.id}`,
          { title: t, description: edit.description.trim() || null, parent: edit.parentIri },
          { headers: { 'Content-Type': 'application/merge-patch+json' } },
        );
        toast.success('Gespeichert.');
      } else {
        const siblings = childrenByParent[edit.parentIri ?? ROOT]?.length ?? 0;
        await api.post('/newsletters', {
          title: t,
          description: edit.description.trim() || null,
          parent: edit.parentIri,
          position: siblings,
          // Root needs an explicit workspace; children inherit it server-side.
          ...(edit.parentIri ? {} : { workspace: workspaceIri }),
        });
        toast.success('Angelegt.');
      }
      setEdit(null);
      await query.refetch();
    } catch {
      toast.error('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: NewsletterRow) => {
    const hasChildren = (childrenByParent[iriOf(r)]?.length ?? 0) > 0;
    const msg = hasChildren
      ? `„${r.title}" und alle Unterthemen löschen?`
      : `„${r.title}" löschen?`;
    if (!window.confirm(msg)) return;
    try {
      await api.delete(`/newsletters/${idOf(r)}`);
      toast.success('Gelöscht.');
      await query.refetch();
    } catch {
      toast.error('Löschen fehlgeschlagen.');
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
      <div>
        <h2 className="flex items-center gap-2 text-2xl">
          <Mail className="size-6 text-muted-foreground" /> Newsletter
        </h2>
        <p className="text-sm text-muted-foreground">
          Themenbaum, den Kunden im Portal abonnieren. Pro Kunde einzeln freischaltbar (Reiter
          „Newsletter" beim Kunden).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Neues Thema (oberste Ebene)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="z. B. Produkt-News"
              value={rootTitle}
              onChange={(e) => setRootTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addRoot();
              }}
              className="max-w-sm"
            />
            <Button type="button" onClick={addRoot} disabled={busy || !rootTitle.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Hinzufügen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{rows.length} Themen</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : rootNodes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Noch keine Themen.</p>
          ) : (
            <div className="divide-y">
              {rootNodes.map((n) => (
                <NewsletterNode
                  key={iriOf(n)}
                  node={n}
                  depth={0}
                  iriOf={iriOf}
                  childrenByParent={childrenByParent}
                  onAddChild={(parentIri) => setEdit({ title: '', description: '', parentIri })}
                  onEdit={(r) =>
                    setEdit({
                      id: idOf(r),
                      title: r.title,
                      description: r.description ?? '',
                      parentIri: r.parent ?? null,
                    })
                  }
                  onDelete={remove}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={edit !== null} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? 'Thema bearbeiten' : 'Neues Thema'}</DialogTitle>
          </DialogHeader>
          {edit ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Titel</Label>
                <Input
                  autoFocus
                  value={edit.title}
                  onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Beschreibung (optional)</Label>
                <Textarea
                  rows={2}
                  value={edit.description}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Übergeordnet</Label>
                <Select
                  value={edit.parentIri ?? ROOT}
                  onValueChange={(v) => setEdit({ ...edit, parentIri: v === ROOT ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROOT}>— (oberste Ebene)</SelectItem>
                    {parentOptions.map((o) => (
                      <SelectItem key={o.iri} value={o.iri}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEdit(null)} disabled={busy}>
              Abbrechen
            </Button>
            <Button type="button" onClick={save} disabled={busy || !edit?.title.trim()}>
              Speichern
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
  onDelete,
}: {
  node: NewsletterRow;
  depth: number;
  iriOf: (r: NewsletterRow) => string;
  childrenByParent: Record<string, NewsletterRow[]>;
  onAddChild: (parentIri: string) => void;
  onEdit: (r: NewsletterRow) => void;
  onDelete: (r: NewsletterRow) => void;
}) {
  const iri = iriOf(node);
  const children = childrenByParent[iri] ?? [];
  return (
    <>
      <div
        className="group flex items-center gap-2 py-2"
        style={{ paddingLeft: depth * 20 }}
      >
        {children.length > 0 ? (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <span className="inline-block size-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{node.title}</div>
          {node.description ? (
            <div className="truncate text-xs text-muted-foreground">{node.description}</div>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
          <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => onAddChild(iri)}>
            <Plus className="size-3" /> Unterthema
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
          onDelete={onDelete}
        />
      ))}
    </>
  );
}
