import { useInvalidate, useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { DynamicIcon } from 'lucide-react/dynamic';
import { Layers, Loader2, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { TrackerJsonld } from '@/api/types/tracker/Jsonld';
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
import { Skeleton } from '@/components/ui/skeleton';
import { LocalizedFields, type TranslationsMap } from '@/components/LocalizedFields';
import { useSupportedLanguages, useLocalize } from '@/lib/languages';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

const ICON_PRESETS = [
  'bug',
  'sparkles',
  'book-open',
  'life-buoy',
  'milestone',
  'rocket',
  'wrench',
  'shield-alert',
  'beaker',
  'flag',
  'clipboard-list',
  'cpu',
];

const SWATCHES = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16',
  '#10b981', '#06b6d4', '#3b82f6', '#6366f1',
  '#8b5cf6', '#ec4899', '#94a3b8', '#64748b',
];

/**
 * Workspace-Tracker CRUD card. Trackers are the issue-type axis
 * (Bug / Feature / Story / Support / …) on top of TaskStatus (lifecycle)
 * and TaskPriority (urgency).
 *
 * Exactly one tracker per workspace should carry `isDefault=true` —
 * the SPA enforces this client-side at create/edit time by clearing
 * the flag on every other row when a new default is set.
 *
 * Delete is blocked at the DB level if any task still references the
 * tracker (FK ON DELETE RESTRICT). The UI shows a useful error instead
 * of silently failing.
 */
export function WorkspaceTrackersCard() {
  const { t: translate } = useTranslation();
  const [editing, setEditing] = useState<Row<TrackerJsonld> | null>(null);
  const [creating, setCreating] = useState(false);

  const { result, query } = useList<Row<TrackerJsonld>>({
    resource: 'trackers',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });
  const trackers = result?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="size-5 text-muted-foreground" />
          {translate('workspace_trackers.title')}
        </CardTitle>
        <CardDescription>
          {translate('workspace_trackers.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {translate('workspace_trackers.new')}
          </Button>
        </div>

        {query.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : trackers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {translate('workspace_trackers.empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" aria-label={translate('workspace_trackers.icon_col')} />
                <TableHead>{translate('workspace_trackers.col_name')}</TableHead>
                <TableHead className="w-20 text-center">Default</TableHead>
                <TableHead className="w-20 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {trackers.map((t) => (
                <TrackerRow key={t['@id']} tracker={t} onEdit={() => setEditing(t)} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {creating ? <TrackerDialog mode="create" onClose={() => setCreating(false)} /> : null}
      {editing ? (
        <TrackerDialog mode="edit" tracker={editing} onClose={() => setEditing(null)} />
      ) : null}
    </Card>
  );
}

function TrackerRow({
  tracker,
  onEdit,
}: {
  tracker: Row<TrackerJsonld>;
  onEdit: () => void;
}) {
  const { t: translate } = useTranslation();
  const invalidate = useInvalidate();
  const localize = useLocalize();
  const [deleting, setDeleting] = useState(false);
  const color = tracker.color ?? '#94a3b8';
  const iconName = (tracker.icon ?? 'circle') as Parameters<typeof DynamicIcon>[0]['name'];
  const isDefault = (tracker as unknown as { default?: boolean }).default === true;

  const remove = async () => {
    if (!tracker.id) return;
    if (!window.confirm(
      translate('workspace_trackers.confirm_delete', { name: tracker.name }),
    )) {
      return;
    }
    setDeleting(true);
    try {
      await api.delete(`/trackers/${tracker.id}`);
      void invalidate({ resource: 'trackers', invalidates: ['list'] });
      toast.success(translate('toast.tracker_deleted_named', { name: tracker.name }));
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? translate('toast.could_not_delete_tracker'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <TableRow>
      <TableCell>
        <span
          aria-hidden
          className="inline-flex size-7 items-center justify-center rounded-md border"
          style={{
            color,
            backgroundColor: `${color}1f`,
            borderColor: `${color}66`,
          }}
        >
          <DynamicIcon name={iconName} className="size-4" strokeWidth={2.25} />
        </span>
      </TableCell>
      <TableCell className="font-medium">{localize(tracker, 'name')}</TableCell>
      <TableCell className="text-center">
        {isDefault ? (
          <Star className="inline size-4 fill-amber-400 text-amber-500" aria-label="Default" />
        ) : null}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="icon" className="size-7" onClick={onEdit} aria-label={translate('action.edit')}>
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={remove}
          disabled={deleting}
          aria-label={translate('action.delete')}
        >
          {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      </TableCell>
    </TableRow>
  );
}

type DialogProps =
  | { mode: 'create'; onClose: () => void }
  | { mode: 'edit'; tracker: Row<TrackerJsonld>; onClose: () => void };

function TrackerDialog(props: DialogProps) {
  const { t: translate } = useTranslation();
  const invalidate = useInvalidate();
  const { result } = useList<Row<TrackerJsonld>>({
    resource: 'trackers',
    pagination: { mode: 'off' },
  });
  const allTrackers = result?.data ?? [];

  const isEdit = props.mode === 'edit';
  const initial = isEdit ? props.tracker : null;

  const { languages } = useSupportedLanguages();
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? ICON_PRESETS[0]);
  const [color, setColor] = useState(initial?.color ?? SWATCHES[6]);
  const [isDefault, setIsDefault] = useState<boolean>(
    (initial as unknown as { default?: boolean } | null)?.default === true,
  );
  const [translations, setTranslations] = useState<TranslationsMap>(
    (initial as unknown as { translations?: TranslationsMap } | null)?.translations ?? {},
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit && props.tracker) {
      setName(props.tracker.name ?? '');
      setIcon(props.tracker.icon ?? ICON_PRESETS[0]);
      setColor(props.tracker.color ?? SWATCHES[6]);
      setIsDefault(
        (props.tracker as unknown as { default?: boolean }).default === true,
      );
      setTranslations(
        (props.tracker as unknown as { translations?: TranslationsMap }).translations ?? {},
      );
    }
  }, [isEdit, props]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      // If we're setting this one as default, clear isDefault on every
      // other tracker first so the workspace stays single-default.
      if (isDefault) {
        const others = allTrackers.filter(
          (t) => t.id !== (isEdit ? props.tracker.id : null) &&
            (t as unknown as { default?: boolean }).default === true,
        );
        for (const o of others) {
          if (!o.id) continue;
          await api.patch(
            `/trackers/${o.id}`,
            { isDefault: false },
            { headers: { 'Content-Type': 'application/merge-patch+json' } },
          );
        }
      }

      if (isEdit && props.tracker.id) {
        await api.patch(
          `/trackers/${props.tracker.id}`,
          { name: trimmed, icon, color, isDefault, translations },
          { headers: { 'Content-Type': 'application/merge-patch+json' } },
        );
        toast.success(translate('toast.tracker_updated_named', { name: trimmed }));
      } else {
        const workspaceId =
          typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
        if (!workspaceId) {
          throw new Error('Kein aktiver Workspace.');
        }
        await api.post('/trackers', {
          name: trimmed,
          icon,
          color,
          isDefault,
          translations,
          position: allTrackers.length,
          workspace: `/v1/workspaces/${workspaceId}`,
        });
        toast.success(translate('toast.tracker_created_named', { name: trimmed }));
      }
      void invalidate({ resource: 'trackers', invalidates: ['list'] });
      props.onClose();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? translate('toast.could_not_save_tracker'));
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
              ? translate('tracker_dialog.title_edit', { name: initial?.name })
              : translate('tracker_dialog.title_create')}
          </DialogTitle>
          <DialogDescription>
            {translate('tracker_dialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <LocalizedFields
            fields={[
              {
                key: 'name',
                label: translate('tracker_dialog.field_name'),
                placeholder: translate('tracker_dialog.name_placeholder'),
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
            <Label>Icon</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {ICON_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={cn(
                    'inline-flex size-8 items-center justify-center rounded-md border transition-transform',
                    icon === p
                      ? 'border-foreground scale-110'
                      : 'border-border hover:scale-105',
                  )}
                  style={icon === p ? { color, backgroundColor: `${color}26` } : undefined}
                  onClick={() => setIcon(p)}
                  aria-label={translate('tracker_dialog.icon_aria', { name: p })}
                  title={p}
                >
                  <DynamicIcon name={p as Parameters<typeof DynamicIcon>[0]['name']} className="size-4" />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{translate('tracker_dialog.color_label')}</Label>
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
                  aria-label={translate('tracker_dialog.color_aria', { name: c })}
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
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium"
                style={{
                  color,
                  backgroundColor: `${color}1f`,
                  borderColor: `${color}66`,
                }}
              >
                <DynamicIcon name={icon as Parameters<typeof DynamicIcon>[0]['name']} className="size-3" />
                {name.trim() || translate('tracker_dialog.preview')}
              </span>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="size-4"
            />
            {translate('tracker_dialog.set_default')}
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={saving}>
            {translate('action.cancel')}
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : isEdit ? <Pencil className="size-4" /> : <Plus className="size-4" />}
            {isEdit ? translate('action.save') : translate('tracker_dialog.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
