import { Loader2, Send } from 'lucide-react';
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

type Issue = {
  id?: string;
  '@id'?: string;
  subject: string;
  status: 'draft' | 'sent';
  sentAt?: string | null;
  recipientCount?: number;
};

/**
 * Composes + sends newsletter issues for one node. Lists past issues (with
 * send status + recipient count) and offers a markdown composer whose "Senden"
 * creates the issue then mails it to the node's opted-in contacts. Sending is
 * irreversible (bulk mail) so it's confirmed; a disabled egress module surfaces
 * as a clear error rather than a silent no-op.
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
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

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

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const idOf = (i: Issue) => i.id ?? i['@id']?.split('/').pop() ?? '';

  const send = async () => {
    const s = subject.trim();
    if (!s) return;
    if (!window.confirm(`„${s}" jetzt an alle Abonnenten von „${nodeTitle}" senden?`)) return;
    setSending(true);
    try {
      const created = await api.post('/newsletter_issues', {
        newsletter: nodeIri,
        subject: s,
        body: body.trim() || null,
      });
      const id = created.data.id ?? created.data['@id']?.split('/').pop();
      const res = await api.post(`/newsletter_issues/${id}/send`);
      toast.success(`An ${res.data.recipientCount} Empfänger gesendet.`);
      setSubject('');
      setBody('');
      load();
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 409
          ? 'Versand ist nicht aktiviert (EGRESS_ALLOW=newsletter_send).'
          : 'Senden fehlgeschlagen.',
      );
    } finally {
      setSending(false);
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Newsletter · {nodeTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3 rounded-md border p-3">
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
            <div className="flex justify-end">
              <Button type="button" onClick={send} disabled={sending || !subject.trim()}>
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
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
                Noch nichts gesendet.
              </p>
            ) : (
              <div className="divide-y">
                {issues.map((i) => (
                  <div key={idOf(i)} className="flex items-center justify-between py-2 text-sm">
                    <div className="min-w-0 flex-1 truncate">{i.subject}</div>
                    <div className="shrink-0 text-xs text-muted-foreground">
                      {i.status === 'sent' && i.sentAt
                        ? `${dateFmt.format(new Date(i.sentAt))} · ${i.recipientCount ?? 0} Empf.`
                        : 'Entwurf'}
                    </div>
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
