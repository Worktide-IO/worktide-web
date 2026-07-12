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
import { LocalizedFields, type TranslationsMap } from '@/components/LocalizedFields';
import { useSupportedLanguages, useLocalize } from '@/lib/languages';
import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

const SCOPES: { value: TagJsonldScopeEnum; label: string }[] = [
  { value: 'any', label: 'ws_tags.scope_any' },
  { value: 'project', label: 'ws_tags.scope_project' },
  { value: 'task', label: 'ws_tags.scope_task' },
  { value: 'customer', label: 'ws_tags.scope_customer' },
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
 * Scope filter on the list defaults to translate('ws_tags.everywhere'); clicking a different
 * scope filters client-side using the same fallthrough rule as
 * TagPicker (scope: 'any' shows everywhere).
 */
export function WorkspaceTagsCard() {
  const { t: translate } = useTranslation();
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
          {translate('ws_tags.desc_lead')}{' '}
          <em>{translate('ws_tags.scope_any')}</em> {translate('ws_tags.desc_tail')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{translate('ws_tags.all_scopes')}</SelectItem>
              {SCOPES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {translate(s.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {translate('ws_tags.new_tag')}
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
              ? translate('ws_tags.empty_all')
              : translate('ws_tags.empty_scope')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" aria-label={translate('ws_tags.color')} />
                <TableHead>{translate('ws_tags.name')}</TableHead>
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
    if (!window.confirm(translate('ws_tags.confirm_delete', { name: tag.name }))) {
      return;
    }
    setDeleting(true);
    try {
      await api.delete(`/tags/${tag.id}`);
      void invalidate({ resource: 'tags', invalidates: ['list'] });
      toast.success(translate('toast.tag_deleted_named', { name: tag.name }));
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
        {(() => {
          const s = SCOPES.find((s) => s.value === tag.scope);
          return s ? translate(s.label) : tag.scope;
        })()}
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
  const { t: translate } = useTranslation();
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
        toast.success(translate('toast.tag_updated_named', { name: trimmed }));
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
        toast.success(translate('toast.tag_created_named', { name: trimmed }));
      }
      void invalidate({ resource: 'tags', invalidates: ['list'] });
      props.onClose();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? translate('toast.could_not_save_tag'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? translate('ws_tags.edit_title', { name: initial?.name })
              : translate('ws_tags.create_title')}
          </DialogTitle>
          <DialogDescription>
            {translate('ws_tags.dialog_desc')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <LocalizedFields
            fields={[
              {
                key: 'name',
                label: translate('ws_tags.name'),
                placeholder: translate('ws_tags.name_placeholder'),
                autoFocus: true,
              },
            ]}
            locales={languages}
            base={{ name }}
            onBaseChange={(_, v) => setName(v)}
            translations={translations}
            onTranslationsChange={setTranslations}
          />
          <div className="space-y-1.5">
            <Label htmlFor="tag-scope">Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as TagJsonldScopeEnum)}>
              <SelectTrigger id="tag-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {translate(s.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <em>{translate('ws_tags.scope_any')}</em> {translate('ws_tags.picker_hint')}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>{translate('ws_tags.color')}</Label>
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
                  aria-label={translate('ws_tags.color_swatch', { color: c })}
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
                {name.trim() || translate('ws_tags.preview')}
              </span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={saving}>
            {translate('action.cancel')}
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : isEdit ? <Pencil className="size-4" /> : <Plus className="size-4" />}
            {isEdit ? translate('action.save') : translate('ws_tags.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
