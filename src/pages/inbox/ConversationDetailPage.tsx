import { useInvalidate, useList, useOne } from '@refinedev/core';
import { ArrowLeft, ChevronDown, Mail, Paperclip, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import type { ChannelJsonld } from '@/api/types/channel/Jsonld';
import type { ConversationJsonld } from '@/api/types/conversation/Jsonld';
import type { InboundEventJsonld } from '@/api/types/inboundEvent/Jsonld';
import type { OutboundMessageJsonld } from '@/api/types/outboundMessage/Jsonld';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import { useLiveResource } from '@/lib/mercure';
import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = {
  open: 'Offen',
  pending: 'Wartet',
  closed: 'Erledigt',
  spam: 'Spam',
};
const STATUS_OPTIONS = ['open', 'pending', 'closed', 'spam'];

const OUTBOUND_STATUS_LABEL: Record<string, string> = {
  queued: 'In Warteschlange',
  sending: 'Sende…',
  sent: 'Gesendet',
  failed: 'Fehlgeschlagen',
  bounced: 'Bounce',
};

type Bubble = {
  kind: 'inbound' | 'outbound';
  at: Date;
  event?: Row<InboundEventJsonld>;
  message?: Row<OutboundMessageJsonld>;
};

/**
 * Detail view for one conversation — every InboundEvent and
 * OutboundMessage in the thread rendered as alternating bubbles,
 * a reply composer below.
 *
 * The composer is a deliberately plain Textarea + Send button for
 * v1. BlockNote-rich-text comes later (Phase C.4.x) once we know how
 * the SPA wants to surface threading-quotes, signatures, and AI-
 * suggested replies — each of those affects the editor shape.
 *
 * Status changes (Open → Pending → Closed) are inline via the header
 * Select. Reassignment + tagging come in C.4.x.
 */
export function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const invalidate = useInvalidate();

  useLiveResource('conversations');
  useLiveResource('inbound_events');
  useLiveResource('outbound_messages');

  const { result: convo, query: convoQuery } = useOne<Row<ConversationJsonld>>({
    resource: 'conversations',
    id: id ?? '',
  });

  const { result: events } = useList<Row<InboundEventJsonld>>({
    resource: 'inbound_events',
    pagination: { mode: 'off' },
    filters: id ? [{ field: 'conversation', operator: 'eq', value: `/v1/conversations/${id}` }] : [],
    sorters: [{ field: 'receivedAt', order: 'asc' }],
    queryOptions: { enabled: Boolean(id) },
  });

  const { result: outbound } = useList<Row<OutboundMessageJsonld>>({
    resource: 'outbound_messages',
    pagination: { mode: 'off' },
    filters: id ? [{ field: 'conversation', operator: 'eq', value: `/v1/conversations/${id}` }] : [],
    sorters: [{ field: 'createdAt', order: 'asc' }],
    queryOptions: { enabled: Boolean(id) },
  });

  const { result: channelOne } = useOne<Row<ChannelJsonld>>({
    resource: 'channels',
    id: convo?.channel?.split('/').pop() ?? '',
    queryOptions: { enabled: Boolean(convo?.channel) },
  });
  const channel = channelOne;

  const bubbles = useMemo<Bubble[]>(() => {
    const out: Bubble[] = [];
    for (const e of events?.data ?? []) {
      out.push({
        kind: 'inbound',
        at: new Date(e.receivedAt ?? e.createdAt ?? Date.now()),
        event: e,
      });
    }
    for (const m of outbound?.data ?? []) {
      out.push({
        kind: 'outbound',
        at: new Date(m.sentAt ?? m.createdAt ?? Date.now()),
        message: m,
      });
    }
    return out.sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [events, outbound]);

  const setStatus = async (next: string) => {
    if (!id) return;
    try {
      await api.patch(
        `/conversations/${id}`,
        { status: next },
        { headers: { 'Content-Type': 'application/merge-patch+json' } },
      );
      void invalidate({ resource: 'conversations', invalidates: ['list', 'detail'], id });
      toast.success(`Status: ${STATUS_LABEL[next] ?? next}`);
    } catch {
      toast.error('Konnte Status nicht ändern.');
    }
  };

  if (convoQuery.isLoading || !convo) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/inbox')} aria-label="Zurück">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold truncate">{convo.subject || '(no subject)'}</h2>
          <p className="text-xs text-muted-foreground truncate">
            {convo.senderRaw ?? '—'} · {channel?.name ?? 'Channel?'} · {bubbles.length} Nachricht{bubbles.length === 1 ? '' : 'en'}
          </p>
        </div>
        <Select value={(convo.status as string) ?? 'open'} onValueChange={setStatus}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 px-1">
        {bubbles.map((b, i) => (
          <MessageBubble key={`${b.kind}-${i}`} bubble={b} />
        ))}
      </div>

      <ReplyComposer
        conversationId={id ?? ''}
        channelIri={convo.channel ?? null}
        lastInboundIri={bubbles.filter((b) => b.kind === 'inbound').slice(-1)[0]?.event?.['@id'] ?? null}
        defaultRecipient={convo.senderRaw ?? ''}
        defaultSubject={(convo.subject ?? '').startsWith('Re: ') ? convo.subject ?? '' : `Re: ${convo.subject ?? ''}`}
      />
    </div>
  );
}

function MessageBubble({ bubble }: { bubble: Bubble }) {
  const isInbound = bubble.kind === 'inbound';
  const e = bubble.event;
  const m = bubble.message;

  return (
    <Card className={cn('border-l-4', isInbound ? 'border-l-indigo-500' : 'border-l-emerald-500')}>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2 pt-3">
        <Mail className={cn('size-4', isInbound ? 'text-indigo-500' : 'text-emerald-500')} />
        <span className="text-xs font-medium">
          {isInbound ? e?.senderRaw ?? 'Unbekannter Absender' : `→ ${m?.recipientRaw ?? '(unknown)'}`}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {bubble.at.toLocaleString('de-DE')}
        </span>
        {!isInbound && m?.status ? (
          <Badge variant="outline" className="text-[10px]">
            {OUTBOUND_STATUS_LABEL[m.status as string] ?? m.status}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">
        {isInbound ? (
          <InboundBody event={e!} />
        ) : (
          <pre className="whitespace-pre-wrap text-sm">{m?.body}</pre>
        )}
      </CardContent>
    </Card>
  );
}

function InboundBody({ event }: { event: Row<InboundEventJsonld> }) {
  const [expanded, setExpanded] = useState(false);
  const meta = (event as unknown as { sourceMetadata?: Record<string, unknown> }).sourceMetadata ?? {};
  const truncated = meta.bodyTruncated === true;
  const oversized = meta.oversized === true;
  const attachments = (event.attachments ?? []) as Array<{ filename?: string; sizeBytes?: number; oversized?: boolean }>;

  return (
    <>
      {oversized ? (
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
          Mail übersprungen — Größe überschreitet das Channel-Limit.
        </div>
      ) : null}
      <pre className={cn('whitespace-pre-wrap text-sm', !expanded && 'line-clamp-12')}>
        {event.body ?? ''}
      </pre>
      {(truncated || (event.body && event.body.length > 1000)) && !expanded ? (
        <Button
          variant="link"
          size="sm"
          className="mt-1 h-auto px-0 text-xs"
          onClick={() => setExpanded(true)}
        >
          <ChevronDown className="size-3" />
          {truncated ? 'Vollständige Mail laden' : 'Mehr anzeigen'}
        </Button>
      ) : null}
      {attachments.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {attachments.map((a, i) => (
            <span
              key={i}
              className={cn(
                'inline-flex items-center gap-1 rounded border bg-muted/30 px-1.5 py-0.5 text-xs',
                a.oversized && 'border-amber-300 bg-amber-50 text-amber-800',
              )}
              title={a.oversized ? 'Zu groß, nicht gespeichert' : 'Gespeichert'}
            >
              <Paperclip className="size-3" />
              {a.filename ?? 'anhang'} ({Math.round((a.sizeBytes ?? 0) / 1024)} KB)
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}

function ReplyComposer({
  conversationId,
  channelIri,
  lastInboundIri,
  defaultRecipient,
  defaultSubject,
}: {
  conversationId: string;
  channelIri: string | null;
  lastInboundIri: string | null;
  defaultRecipient: string;
  defaultSubject: string;
}) {
  const invalidate = useInvalidate();
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!channelIri) {
      toast.error('Konversation ohne Channel — keine Antwort möglich.');
      return;
    }
    if (!recipient.trim() || !body.trim()) {
      toast.error('Empfänger und Text sind pflicht.');
      return;
    }
    setSending(true);
    try {
      const workspaceId = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (!workspaceId) throw new Error('Kein aktiver Workspace.');
      await api.post('/outbound_messages', {
        workspace: `/v1/workspaces/${workspaceId}`,
        channel: channelIri,
        conversation: `/v1/conversations/${conversationId}`,
        inReplyToInboundEvent: lastInboundIri,
        recipientRaw: extractEmail(recipient),
        subject: subject.trim() || null,
        body: body.trim(),
        attachments: [],
        additionalRecipients: [],
      });
      toast.success('Antwort in Warteschlange.');
      setBody('');
      void invalidate({ resource: 'outbound_messages', invalidates: ['list'] });
      void invalidate({ resource: 'conversations', invalidates: ['detail'], id: conversationId });
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Konnte Antwort nicht senden.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-2 pb-2">
        <div className="grid grid-cols-[80px_1fr] items-center gap-2">
          <Label htmlFor="reply-to" className="text-xs">An</Label>
          <input
            id="reply-to"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="h-8 rounded border bg-background px-2 text-sm"
          />
          <Label htmlFor="reply-subject" className="text-xs">Betreff</Label>
          <input
            id="reply-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-8 rounded border bg-background px-2 text-sm"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Antwort verfassen…"
          className="h-32 resize-none text-sm"
        />
        <div className="flex justify-end gap-2">
          <Button onClick={send} disabled={sending}>
            <Send className="size-4" />
            {sending ? 'Sende…' : 'Senden'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function extractEmail(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return m ? m[1] : raw.trim();
}
