import { useInvalidate, useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { TagJsonld, TagJsonldScopeEnum } from '@/api/types/tag/Jsonld';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TranslationsFields, type TranslationsMap } from '@/components/TranslationsFields';
import { useSupportedLanguages, useLocalize } from '@/lib/languages';
import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

const SCOPES: { value: TagJsonldScopeEnum; label: string }[] = [
  { value: 'any', label: 'Überall' },
  { value: 'project', label: 'Projekte' },
  { value: 'task', label: 'Aufgaben' },
  { value: 'customer', label: 'Kunden' },
];

const SWATCHES = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16',
  '#10b981', '#06b6d4', '#3b82f6', '#6366f1',
  '#8b5cf6', '#ec4899', '#94a3b8', '#64748b',
];

/**
 * Workspace-level Tag-CRUD card.
 *
 * The Tag entity is workspace-scoped + unique on (name, scope), so the
 * UI mirrors that shape: name + scope + colour, each editable. Delete
 * is dangerous (cascades the ManyToMany rows but the entity itself has
 * no soft-delete trait) so we route it through a confirm.
 *
 * Scope filter on the list defaults to "Überall"; clicking a different
 * scope filters client-side using the same fallthrough rule as
 * TagPicker (scope: 'any' shows everywhere).
 */
export function WorkspaceTagsCard() {
  const [scope, setScope] = useState<TagJsonldScopeEnum | 'all'>('all');
  const [editing, setEditing] = useState<Row<TagJsonld> | null>(null);
  const [creating, setCreating] = useState(false);

  const { result, query } = useList<Row<TagJsonld>>({
    resource: 'tags',
    pagination: { mode: 'off' },
    sorters: [{ field: 'name', order: 'asc' }],
  });
  const tags = useMemo(() => {
    const all = result?.data ?? [];
    if (scope === 'all') return all;
    return all.filter((t) => t.scope === scope);
  }, [result, scope]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tags className="size-5 text-muted-foreground" />
          Tags
        </CardTitle>
        <CardDescription>
          Workspace-weite Tags zum Kennzeichnen von Projekten, Aufgaben und
          Kunden. Der Scope grenzt ein, wo der Tag angeboten wird —{' '}
          <em>Überall</em> erscheint in jeder Auswahl.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Scopes</SelectItem>
              {SCOPES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Neuer Tag
          </Button>
        </div>

        {query.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : tags.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {scope === 'all'
              ? 'Noch keine Tags. Lege den ersten an.'
              : 'Keine Tags in diesem Scope.'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" aria-label="Farbe" />
                <TableHead>Name</TableHead>
                <TableHead className="w-32">Scope</TableHead>
                <TableHead className="w-20 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tags.map((t) => (
                <TagRow key={t['@id']} tag={t} onEdit={() => setEditing(t)} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {creating ? (
        <TagDialog
          mode="create"
          onClose={() => setCreating(false)}
        />
      ) : null}
      {editing ? (
        <TagDialog
          mode="edit"
          tag={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

function TagRow({
  tag,
  onEdit,
}: {
  tag: Row<TagJsonld>;
  onEdit: () => void;
}) {
  const { t: translate } = useTranslation();
  const invalidate = useInvalidate();
  const localize = useLocalize();
  const [deleting, setDeleting] = useState(false);
  const color = tag.color ?? '#94a3b8';

  const remove = async () => {
    if (!tag.id) return;
    if (!window.confirm(`Tag "${tag.name}" wirklich löschen? Die Markierungen an verknüpften Projekten/Aufgaben gehen verloren.`)) {
      return;
    }
    setDeleting(true);
    try {
      await api.delete(`/tags/${tag.id}`);
      void invalidate({ resource: 'tags', invalidates: ['list'] });
      toast.success(`Tag "${tag.name}" gelöscht.`);
    } catch {
      toast.error(translate('toast.could_not_delete_tag'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <TableRow>
      <TableCell>
        <span
          aria-hidden
          className="block size-4 rounded-full border"
          style={{ backgroundColor: color, borderColor: `${color}99` }}
        />
      </TableCell>
      <TableCell className="font-medium">
        <span
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
          style={{
            backgroundColor: `${color}26`,
            borderColor: `${color}66`,
            color,
          }}
        >
          {localize(tag, 'name')}
        </span>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {SCOPES.find((s) => s.value === tag.scope)?.label ?? tag.scope}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="icon" className="size-7" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={remove}
          disabled={deleting}
        >
          {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      </TableCell>
    </TableRow>
  );
}

type DialogProps =
  | { mode: 'create'; onClose: () => void }
  | { mode: 'edit'; tag: Row<TagJsonld>; onClose: () => void };

function TagDialog(props: DialogProps) {
  const invalidate = useInvalidate();
  const isEdit = props.mode === 'edit';
  const initial = isEdit ? props.tag : null;

  const { languages } = useSupportedLanguages();
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? SWATCHES[7]);
  const [scope, setScope] = useState<TagJsonldScopeEnum>(initial?.scope ?? 'any');
  const [translations, setTranslations] = useState<TranslationsMap>(
    (initial as unknown as { translations?: TranslationsMap } | null)?.translations ?? {},
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit && props.tag) {
      setName(props.tag.name ?? '');
      setColor(props.tag.color ?? SWATCHES[7]);
      setScope(props.tag.scope ?? 'any');
      setTranslations(
        (props.tag as unknown as { translations?: TranslationsMap }).translations ?? {},
      );
    }
  }, [isEdit, props]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      if (isEdit && props.tag.id) {
        await api.patch(
          `/tags/${props.tag.id}`,
          { name: trimmed, color, scope, translations },
          { headers: { 'Content-Type': 'application/merge-patch+json' } },
        );
        toast.success(`Tag "${trimmed}" aktualisiert.`);
      } else {
        const workspaceId =
          typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
        if (!workspaceId) {
          throw new Error('Kein aktiver Workspace.');
        }
        await api.post('/tags', {
          name: trimmed,
          color,
          scope,
          translations,
          workspace: `/v1/workspaces/${workspaceId}`,
        });
        toast.success(`Tag "${trimmed}" angelegt.`);
      }
      void invalidate({ resource: 'tags', invalidates: ['list'] });
      props.onClose();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Konnte Tag nicht speichern.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Tag "${initial?.name}" bearbeiten` : 'Neuen Tag anlegen'}
          </DialogTitle>
          <DialogDescription>
            Name, Scope und Farbe — der Tag wird ab dem nächsten Render in
            allen passenden Pickern und Listen sichtbar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tag-name">Name</Label>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Frontend, Bug, Wartung"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tag-scope">Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as TagJsonldScopeEnum)}>
              <SelectTrigger id="tag-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <em>Überall</em> erscheint auch bei Projekt- und
              Aufgaben-Pickern.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Farbe</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    'size-7 rounded-full border-2 transition-transform',
                    color === c ? 'scale-110 border-foreground' : 'border-transparent hover:scale-105',
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Farbe ${c}`}
                />
              ))}
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="ml-1 h-7 w-12 cursor-pointer p-0.5"
              />
            </div>
            <div className="pt-1">
              <span
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: `${color}26`,
                  borderColor: `${color}66`,
                  color,
                }}
              >
                {name.trim() || 'Vorschau'}
              </span>
            </div>
          </div>
          <TranslationsFields
            fields={[{ key: 'name', label: 'Name' }]}
            locales={languages}
            value={translations}
            onChange={setTranslations}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : isEdit ? <Pencil className="size-4" /> : <Plus className="size-4" />}
            {isEdit ? 'Speichern' : 'Anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
