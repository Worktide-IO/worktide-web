import { Bot, Check, Loader2, Send, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { aiErrorMessage } from '@/lib/ai';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Proposal = {
  // absence
  startsOn?: string; endsOn?: string; type?: string;
  // create_ticket
  title?: string; description?: string | null; projectId?: string; projectName?: string; customerName?: string | null;
  // promote_product
  productId?: string; productName?: string;
};
type CommandResponse =
  | { intent: 'clarify'; question: string }
  | { intent: 'denied'; message: string }
  | { intent: 'absence' | 'create_ticket' | 'promote_product'; proposal: Proposal };

/**
 * "KI-Assistent" — a free-text command bar. The AI classifies the instruction
 * (absence / create ticket / promote a product), asks back when unclear, and
 * shows a concrete proposal that the staff confirms before anything happens
 * (POST /me/agent-command → propose, /execute → act).
 */
export function AiAssistantWidget() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [clarify, setClarify] = useState<string | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [pending, setPending] = useState<{ intent: string; proposal: Proposal } | null>(null);

  async function submit() {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    setClarify(null);
    setDenied(null);
    setPending(null);
    try {
      const { data } = await api.post<CommandResponse>('/me/agent-command', { text: value });
      if (data.intent === 'clarify') {
        setClarify(data.question);
      } else if (data.intent === 'denied') {
        setDenied(data.message);
      } else {
        setPending({ intent: data.intent, proposal: data.proposal });
      }
    } catch (err) {
      toast.error(aiErrorMessage(err, t('widget.assistant.failed')));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!pending) return;
    const p = pending.proposal;
    const body: Record<string, unknown> = { intent: pending.intent };
    if (pending.intent === 'absence') Object.assign(body, { startsOn: p.startsOn, endsOn: p.endsOn, type: p.type });
    if (pending.intent === 'create_ticket') Object.assign(body, { title: p.title, description: p.description, projectId: p.projectId });
    if (pending.intent === 'promote_product') Object.assign(body, { productId: p.productId });

    setBusy(true);
    try {
      const { data } = await api.post<{ status: string; identifier?: string }>('/me/agent-command/execute', body);
      const msg =
        data.status === 'ticket_created' ? t('widget.assistant.ticket_created', { id: data.identifier ?? '' })
        : data.status === 'marketing_queued' ? t('widget.assistant.marketing_queued')
        : t('widget.assistant.absence_created');
      toast.success(msg);
      setPending(null);
      setText('');
      if (pending.intent === 'absence') void qc.invalidateQueries({ queryKey: ['dashboard', 'my-schedule'] });
    } catch (err) {
      toast.error(aiErrorMessage(err, t('widget.assistant.failed')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Bot className="size-4 text-muted-foreground" /> {t('widget.assistant.label')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            placeholder={t('widget.assistant.placeholder')}
            disabled={busy}
            className="h-9 text-sm"
          />
          <Button size="sm" className="h-9 shrink-0" disabled={busy || !text.trim()} onClick={() => void submit()}>
            {busy && !pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>

        {clarify ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            {clarify}
          </div>
        ) : null}

        {denied ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {denied}
          </div>
        ) : null}

        {pending ? (
          <div className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50/50 p-3 text-sm dark:border-indigo-900 dark:bg-indigo-950/20">
            <div className="text-xs font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
              {t(`widget.assistant.intent_${pending.intent}`)}
            </div>
            {pending.intent === 'create_ticket' ? (
              <div>
                <div className="font-medium">{pending.proposal.title}</div>
                <div className="text-xs text-muted-foreground">
                  {pending.proposal.projectName}{pending.proposal.customerName ? ` · ${pending.proposal.customerName}` : ''}
                </div>
                {pending.proposal.description ? <p className="mt-1 text-xs text-muted-foreground">{pending.proposal.description}</p> : null}
              </div>
            ) : pending.intent === 'absence' ? (
              <div>{t('widget.assistant.absence_summary', { from: pending.proposal.startsOn, to: pending.proposal.endsOn, type: pending.proposal.type })}</div>
            ) : (
              <div>{t('widget.assistant.promote_summary', { product: pending.proposal.productName })}</div>
            )}
            <div className="flex gap-2 pt-1">
              <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={busy} onClick={() => void confirm()}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                {t('widget.assistant.confirm')}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" disabled={busy} onClick={() => setPending(null)}>
                <X className="size-3.5" /> {t('widget.assistant.discard')}
              </Button>
            </div>
          </div>
        ) : null}

        {!clarify && !denied && !pending ? <p className="text-xs text-muted-foreground">{t('widget.assistant.hint')}</p> : null}
      </CardContent>
    </Card>
  );
}
