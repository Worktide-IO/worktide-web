import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Template = { id?: string; '@id'?: string; name: string; subject: string; body?: string | null };
type Editing = { id: string; name: string; subject: string; body: string };

const MERGE_PATCH = { headers: { 'Content-Type': 'application/merge-patch+json' } };

/**
 * Manage reusable newsletter templates — edit (name + subject + markdown body)
 * and delete. New templates are created from the issue composer ("Als Vorlage
 * speichern"); here they can be fully maintained.
 */
export function NewsletterTemplatesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/newsletter_templates', { params: { 'order[name]': 'asc' }, headers: { Accept: 'application/ld+json' } })
      .then((r) => setTemplates(r.data['member'] ?? r.data['hydra:member'] ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const idOf = (t: Template) => t.id ?? t['@id']?.split('/').pop() ?? '';

  const startEdit = (t: Template) =>
    setEditing({ id: idOf(t), name: t.name, subject: t.subject, body: t.body ?? '' });

  const saveEdit = async () => {
    if (!editing || !editing.name.trim() || !editing.subject.trim()) return;
    setBusy(true);
    try {
      await api.patch(
        `/newsletter_templates/${editing.id}`,
        { name: editing.name.trim(), subject: editing.subject.trim(), body: editing.body.trim() || null },
        MERGE_PATCH,
      );
      setEditing(null);
      load();
    } catch {
      toast.error('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: Template) => {
    if (!window.confirm(`Vorlage „${t.name}" löschen?`)) return;
    try {
      await api.delete(`/newsletter_templates/${idOf(t)}`);
      if (editing?.id === idOf(t)) setEditing(null);
      load();
    } catch {
      toast.error('Löschen fehlgeschlagen.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Newsletter-Vorlagen</DialogTitle>
        </DialogHeader>

        {editing ? (
          <div className="space-y-3 rounded-md border p-3">
            <div className="space-y-1">
              <Label>Name der Vorlage</Label>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Betreff</Label>
              <Input value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Inhalt (Markdown)</Label>
              <Textarea
                rows={8}
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Platzhalter: <code>{'{{ firstName }}'}</code>, <code>{'{{ lastName }}'}</code>,{' '}
                <code>{'{{ company }}'}</code>.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
                Abbrechen
              </Button>
              <Button type="button" onClick={saveEdit} disabled={busy || !editing.name.trim() || !editing.subject.trim()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Speichern
              </Button>
            </div>
          </div>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Lädt…</p>
        ) : templates.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Noch keine Vorlagen. Speichern Sie beim Verfassen eines Newsletters „Als Vorlage".
          </p>
        ) : (
          <div className="divide-y">
            {templates.map((t) => (
              <div key={idOf(t)} className="flex items-center gap-2 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{t.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{t.subject}</div>
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => startEdit(t)}>
                  <Pencil className="size-3" /> Bearbeiten
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => remove(t)}>
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
