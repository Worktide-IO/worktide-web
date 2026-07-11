import { Check, Loader2, Pencil, Trash2, X } from 'lucide-react';
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

type Template = { id?: string; '@id'?: string; name: string; subject: string };

const MERGE_PATCH = { headers: { 'Content-Type': 'application/merge-patch+json' } };

/**
 * Manage reusable newsletter templates — rename + delete. New templates are
 * created from the issue composer ("Als Vorlage speichern"); this is the tidy-up
 * surface.
 */
export function NewsletterTemplatesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
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

  const saveRename = async () => {
    if (!editing || !editing.name.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/newsletter_templates/${editing.id}`, { name: editing.name.trim() }, MERGE_PATCH);
      setEditing(null);
      load();
    } catch {
      toast.error('Umbenennen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: Template) => {
    if (!window.confirm(`Vorlage „${t.name}" löschen?`)) return;
    try {
      await api.delete(`/newsletter_templates/${idOf(t)}`);
      load();
    } catch {
      toast.error('Löschen fehlgeschlagen.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Newsletter-Vorlagen</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Lädt…</p>
        ) : templates.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Noch keine Vorlagen. Speichern Sie beim Verfassen eines Newsletters „Als Vorlage".
          </p>
        ) : (
          <div className="divide-y">
            {templates.map((t) => {
              const id = idOf(t);
              const isEditing = editing?.id === id;
              return (
                <div key={id} className="flex items-center gap-2 py-2 text-sm">
                  {isEditing ? (
                    <>
                      <Input
                        autoFocus
                        value={editing.name}
                        onChange={(e) => setEditing({ id, name: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && saveRename()}
                        className="h-8 flex-1"
                      />
                      <Button type="button" variant="ghost" size="sm" className="h-7" disabled={busy} onClick={saveRename}>
                        {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setEditing(null)}>
                        <X className="size-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{t.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{t.subject}</div>
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setEditing({ id, name: t.name })}>
                        <Pencil className="size-3" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => remove(t)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
