import { Copy, Loader2, Pencil, Send, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
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

type Issue = {
  id?: string;
  '@id'?: string;
  subject: string;
  body?: string | null;
  status: 'draft' | 'sent';
  sentAt?: string | null;
  recipientCount?: number;
};

type Template = { id?: string; '@id'?: string; name: string; subject: string; body?: string | null };

const MERGE_PATCH = { headers: { 'Content-Type': 'application/merge-patch+json' } };

/**
 * Composes, drafts + sends newsletter issues for one node. Drafts can be saved,
 * edited, deleted and sent later; sent issues are read-only history (and can be
 * duplicated into a fresh draft). "Unterthemen einschließen" fans the send out
 * to descendant topics (deduped server-side). Sending is confirmed (bulk mail);
 * a disabled egress module surfaces as a clear error.
 */
export function NewsletterIssuesDialog({
  nodeIri,
  nodeTitle,
  open,
  onOpenChange,
}: {
  nodeIri: string;
  nodeTitle: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [includeDescendants, setIncludeDescendants] = useState(false);
  const [busy, setBusy] = useState(false);

  const workspaceIri = (() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    return id ? `/v1/workspaces/${id}` : undefined;
  })();

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/newsletter_issues', {
        params: { newsletter: nodeIri, 'order[createdAt]': 'desc' },
        headers: { Accept: 'application/ld+json' },
      })
      .then((r) => setIssues(r.data['member'] ?? r.data['hydra:member'] ?? []))
      .catch(() => setIssues([]))
      .finally(() => setLoading(false));
  }, [nodeIri]);

  const loadTemplates = useCallback(() => {
    api
      .get('/newsletter_templates', {
        params: { 'order[name]': 'asc' },
        headers: { Accept: 'application/ld+json' },
      })
      .then((r) => setTemplates(r.data['member'] ?? r.data['hydra:member'] ?? []))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    if (open) {
      load();
      loadTemplates();
    }
  }, [open, load, loadTemplates]);

  const idOf = (i: Issue) => i.id ?? i['@id']?.split('/').pop() ?? '';

  const resetComposer = () => {
    setSubject('');
    setBody('');
    setEditingId(null);
  };

  // Create (or update, when editing) the draft; returns its id.
  const persistDraft = async (): Promise<string> => {
    const payload = { subject: subject.trim(), body: body.trim() || null };
    if (editingId) {
      await api.patch(`/newsletter_issues/${editingId}`, payload, MERGE_PATCH);
      return editingId;
    }
    const created = await api.post('/newsletter_issues', { newsletter: nodeIri, ...payload });
    return created.data.id ?? created.data['@id']?.split('/').pop();
  };

  const saveDraft = async () => {
    if (!subject.trim()) return;
    setBusy(true);
    try {
      await persistDraft();
      toast.success('Entwurf gespeichert.');
      resetComposer();
      load();
    } catch {
      toast.error('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const sendId = async (id: string) => {
    try {
      const res = await api.post(`/newsletter_issues/${id}/send`, { includeDescendants });
      toast.success(`An ${res.data.recipientCount} Empfänger gesendet.`);
      load();
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 409
          ? 'Versand ist nicht aktiviert (EGRESS_ALLOW=newsletter_send).'
          : 'Senden fehlgeschlagen.',
      );
    }
  };

  const composeAndSend = async () => {
    if (!subject.trim()) return;
    if (!window.confirm(`„${subject.trim()}" jetzt an alle Abonnenten von „${nodeTitle}" senden?`)) return;
    setBusy(true);
    try {
      const id = await persistDraft();
      await sendId(id);
      resetComposer();
    } catch {
      toast.error('Senden fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const sendExisting = async (i: Issue) => {
    if (!window.confirm(`„${i.subject}" jetzt an alle Abonnenten von „${nodeTitle}" senden?`)) return;
    setBusy(true);
    await sendId(idOf(i));
    setBusy(false);
  };

  const editDraft = (i: Issue) => {
    setEditingId(idOf(i));
    setSubject(i.subject);
    setBody(i.body ?? '');
  };

  const duplicate = (i: Issue) => {
    setEditingId(null);
    setSubject(`Kopie: ${i.subject}`);
    setBody(i.body ?? '');
  };

  const tplIdOf = (t: Template) => t.id ?? t['@id']?.split('/').pop() ?? '';

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => tplIdOf(x) === id);
    if (!t) return;
    setEditingId(null);
    setSubject(t.subject);
    setBody(t.body ?? '');
  };

  const saveAsTemplate = async () => {
    if (!subject.trim()) return;
    const name = window.prompt('Name der Vorlage:', subject.trim().slice(0, 60));
    if (!name || !name.trim()) return;
    try {
      await api.post('/newsletter_templates', {
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim() || null,
        workspace: workspaceIri,
      });
      toast.success('Als Vorlage gespeichert.');
      loadTemplates();
    } catch {
      toast.error('Speichern der Vorlage fehlgeschlagen.');
    }
  };

  const remove = async (i: Issue) => {
    if (!window.confirm('Entwurf löschen?')) return;
    try {
      await api.delete(`/newsletter_issues/${idOf(i)}`);
      if (editingId === idOf(i)) resetComposer();
      load();
    } catch {
      toast.error('Löschen fehlgeschlagen.');
    }
  };

  const dateFmt = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Newsletter · {nodeTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {editingId ? 'Entwurf bearbeiten' : 'Neuer Newsletter'}
              </span>
              <div className="flex items-center gap-2">
                {templates.length > 0 ? (
                  <Select value="" onValueChange={applyTemplate}>
                    <SelectTrigger className="h-8 w-52">
                      <SelectValue placeholder="Vorlage laden…" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={tplIdOf(t)} value={tplIdOf(t)}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <Button type="button" variant="ghost" size="sm" className="h-8" onClick={saveAsTemplate} disabled={!subject.trim()}>
                  Als Vorlage speichern
                </Button>
                {editingId ? (
                  <Button type="button" variant="ghost" size="sm" className="h-8" onClick={resetComposer}>
                    <X className="size-3" /> Neu
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Betreff</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="z. B. Produkt-Update Juli"
              />
            </div>
            <div className="space-y-1">
              <Label>Inhalt (Markdown)</Label>
              <Textarea
                rows={8}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={'# Überschrift\n\nHallo {{ firstName }},\n\n- Punkt eins\n- **wichtig**'}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Markdown wird unterstützt. Platzhalter: <code>{'{{ firstName }}'}</code>,{' '}
                <code>{'{{ lastName }}'}</code>, <code>{'{{ company }}'}</code>. Jede Mail enthält
                einen Abmelde-Link.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={includeDescendants}
                onCheckedChange={(v) => setIncludeDescendants(v === true)}
              />
              Unterthemen einschließen (auch Abonnenten der Unterthemen)
            </label>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={saveDraft}
                disabled={busy || !subject.trim()}
              >
                Als Entwurf speichern
              </Button>
              <Button type="button" onClick={composeAndSend} disabled={busy || !subject.trim()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Senden
              </Button>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">Verlauf</div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Lädt…</p>
            ) : issues.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Noch nichts angelegt.
              </p>
            ) : (
              <div className="divide-y">
                {issues.map((i) => (
                  <div key={idOf(i)} className="flex items-center gap-2 py-2 text-sm">
                    <div className="min-w-0 flex-1 truncate">{i.subject}</div>
                    {i.status === 'sent' ? (
                      <>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {i.sentAt ? dateFmt.format(new Date(i.sentAt)) : ''} · {i.recipientCount ?? 0} Empf.
                        </span>
                        <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => duplicate(i)}>
                          <Copy className="size-3" /> Duplizieren
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          Entwurf
                        </span>
                        <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => editDraft(i)}>
                          <Pencil className="size-3" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7" disabled={busy} onClick={() => sendExisting(i)}>
                          <Send className="size-3" /> Senden
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => remove(i)}>
                          <Trash2 className="size-3" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
