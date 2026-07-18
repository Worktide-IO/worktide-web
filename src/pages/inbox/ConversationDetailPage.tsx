import { useInvalidate, useOne } from '@refinedev/core';
import { intlLocale } from '@/lib/intl';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Mail, Paperclip, Send, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import type { ChannelJsonld } from '@/api/types/channel/Jsonld';
import type { ConversationJsonld } from '@/api/types/conversation/Jsonld';
import type { InboundEventJsonld } from '@/api/types/inboundEvent/Jsonld';
import type { OutboundMessageJsonld } from '@/api/types/outboundMessage/Jsonld';
import { AiTicketSuggestionPanel } from '@/components/AiTicketSuggestionPanel';
import { AiTriagePanel } from '@/components/AiTriagePanel';
import { AssignSenderDialog } from '@/components/AssignSenderDialog';
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
import { topicFor, useLiveResource, useMercureTopic } from '@/lib/mercure';
import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { aiReply, aiErrorMessage } from '@/lib/ai';
import type { Row } from '@/lib/refine';
import { useKeysetList } from '@/lib/useKeysetList';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = {
  open: 'conversation_status.open',
  pending: 'conversation_status.pending',
  closed: 'conversation_status.closed',
  spam: 'conversation_status.spam',
};
const STATUS_OPTIONS = ['open', 'pending', 'closed', 'spam'];

const OUTBOUND_STATUS_LABEL: Record<string, string> = {
  queued: 'outbound_status.queued',
  sending: 'outbound_status.sending',
  sent: 'outbound_status.sent',
  failed: 'outbound_status.failed',
  bounced: 'outbound_status.bounced',
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
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const invalidate = useInvalidate();

  useLiveResource('conversations');

  const { result: convo, query: convoQuery } = useOne<Row<ConversationJsonld>>({
    resource: 'conversations',
    id: id ?? '',
  });

  // Thread messages are loaded newest-first via keyset (order desc +
  // receivedAt/createdAt[before]) — a huge thread (10k+ mails) no longer loads
  // in one shot. "Load older" walks further back; both lists merge + sort asc
  // for display.
  const convoIri = id ? `/v1/conversations/${id}` : undefined;
  const inbound = useKeysetList<Row<InboundEventJsonld>>({
    resource: 'inbound_events',
    orderField: 'receivedAt',
    cursorOf: (e) => (e.receivedAt ? String(e.receivedAt) : undefined),
    filters: { conversation: convoIri },
    pageSize: 50,
    enabled: Boolean(id),
  });
  const outboundList = useKeysetList<Row<OutboundMessageJsonld>>({
    resource: 'outbound_messages',
    orderField: 'createdAt',
    cursorOf: (m) => (m.createdAt ? String(m.createdAt) : undefined),
    filters: { conversation: convoIri },
    pageSize: 50,
    enabled: Boolean(id),
  });

  // Live: a new event on this (or any) thread reloads the newest page.
  useMercureTopic(topicFor('inbound_events'), { onMessage: () => inbound.reset() });
  useMercureTopic(topicFor('outbound_messages'), { onMessage: () => outboundList.reset() });

  const hasOlder = inbound.hasMore || outboundList.hasMore;
  const loadingOlder = inbound.isLoading || outboundList.isLoading;
  const loadOlder = () => {
    inbound.loadMore();
    outboundList.loadMore();
  };

  const { result: channelOne } = useOne<Row<ChannelJsonld>>({
    resource: 'channels',
    id: convo?.channel?.split('/').pop() ?? '',
    queryOptions: { enabled: Boolean(convo?.channel) },
  });
  const channel = channelOne;

  const bubbles = useMemo<Bubble[]>(() => {
    const out: Bubble[] = [];
    for (const e of inbound.items) {
      out.push({
        kind: 'inbound',
        at: new Date(e.receivedAt ?? e.createdAt ?? 0),
        event: e,
      });
    }
    for (const m of outboundList.items) {
      out.push({
        kind: 'outbound',
        at: new Date(m.sentAt ?? m.createdAt ?? 0),
        message: m,
      });
    }
    return out.sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [inbound.items, outboundList.items]);

  const setStatus = async (next: string) => {
    if (!id) return;
    try {
      await api.patch(
        `/conversations/${id}`,
        { status: next },
        { headers: { 'Content-Type': 'application/merge-patch+json' } },
      );
      void invalidate({ resource: 'conversations', invalidates: ['list', 'detail'], id });
      toast.success(t('toast.status_set', { status: STATUS_LABEL[next] ? t(STATUS_LABEL[next]) : next }));
    } catch {
      toast.error(t('toast.could_not_change_status'));
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
        <Button variant="ghost" size="icon" onClick={() => navigate('/inbox')} aria-label={t('conversation.back')}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold truncate">{convo.subject || '(no subject)'}</h2>
          <p className="text-xs text-muted-foreground truncate">
            {convo.senderRaw ?? '—'} · {channel?.name ?? 'Channel?'} · {t('conversation.messages_count', { count: bubbles.length })}
          </p>
        </div>
        {!convo.customer && (convo.senderRaw ?? '').includes('@') ? (
          <AssignSenderDialog
            conversationId={id ?? ''}
            senderRaw={convo.senderRaw}
            onLinked={() => void invalidate({ resource: 'conversations', invalidates: ['list', 'detail'], id })}
          />
        ) : null}
        <Select value={(convo.status as string) ?? 'open'} onValueChange={setStatus}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(STATUS_LABEL[s])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <AiTriagePanel
          target="conversation"
          targetId={id}
          onApplied={() => void invalidate({ resource: 'conversations', invalidates: ['list', 'detail'], id })}
        />
        <AiTicketSuggestionPanel
          conversationId={id}
          onApplied={() => void invalidate({ resource: 'conversations', invalidates: ['list', 'detail'], id })}
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 px-1">
        {hasOlder ? (
          <div className="flex justify-center py-1">
            <Button variant="outline" size="sm" onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ChevronUp className="size-3.5" />
              )}
              {t('conversation.load_older')}
            </Button>
          </div>
        ) : null}
        {bubbles.map((b, i) => (
          <MessageBubble
            key={b.event?.['@id'] ?? b.message?.['@id'] ?? `${b.kind}-${i}`}
            bubble={b}
          />
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
  const { t } = useTranslation();
  const isInbound = bubble.kind === 'inbound';
  const e = bubble.event;
  const m = bubble.message;

  return (
    <Card className={cn('border-l-4', isInbound ? 'border-l-indigo-500' : 'border-l-emerald-500')}>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2 pt-3">
        <Mail className={cn('size-4', isInbound ? 'text-indigo-500' : 'text-emerald-500')} />
        <span className="text-xs font-medium">
          {isInbound ? e?.senderRaw ?? t('conversation.unknown_sender') : `→ ${m?.recipientRaw ?? '(unknown)'}`}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {bubble.at.toLocaleString(intlLocale())}
        </span>
        {!isInbound && m?.status ? (
          <Badge variant="outline" className="text-[10px]">
            {OUTBOUND_STATUS_LABEL[m.status as string] ? t(OUTBOUND_STATUS_LABEL[m.status as string]) : m.status}
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
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const meta = (event as unknown as { sourceMetadata?: Record<string, unknown> }).sourceMetadata ?? {};
  const truncated = meta.bodyTruncated === true;
  const oversized = meta.oversized === true;
  const attachments = (event.attachments ?? []) as Array<{ filename?: string; sizeBytes?: number; oversized?: boolean }>;

  return (
    <>
      {oversized ? (
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
          {t('conversation.mail_skipped')}
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
          {truncated ? t('conversation.load_full_mail') : t('conversation.show_more')}
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
              title={a.oversized ? t('conversation.att_too_large') : t('conversation.att_saved')}
            >
              <Paperclip className="size-3" />
              {a.filename ?? t('conversation.attachment_fallback')} ({Math.round((a.sizeBytes ?? 0) / 1024)} KB)
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
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  // Inline AI draft: fetch a suggested reply and pre-fill the composer. Appends
  // (never overwrites) if the agent already started typing.
  const suggest = async () => {
    setSuggesting(true);
    try {
      const { reply } = await aiReply.suggest(conversationId);
      if (reply?.trim()) {
        setBody((prev) => (prev.trim() ? `${prev.trim()}\n\n${reply.trim()}` : reply.trim()));
      }
    } catch (err) {
      toast.error(aiErrorMessage(err, t('toast.ai_analysis_failed')));
    } finally {
      setSuggesting(false);
    }
  };

  const send = async () => {
    if (!channelIri) {
      toast.error(t('toast.conversation_no_channel'));
      return;
    }
    if (!recipient.trim() || !body.trim()) {
      toast.error(t('toast.recipient_text_required'));
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
      toast.success(t('toast.reply_queued'));
      setBody('');
      void invalidate({ resource: 'outbound_messages', invalidates: ['list'] });
      void invalidate({ resource: 'conversations', invalidates: ['detail'], id: conversationId });
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? t('toast.could_not_send_reply'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-2 pb-2">
        <div className="grid grid-cols-[80px_1fr] items-center gap-2">
          <Label htmlFor="reply-to" className="text-xs">{t('conversation.to')}</Label>
          <input
            id="reply-to"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="h-8 rounded border bg-background px-2 text-sm"
          />
          <Label htmlFor="reply-subject" className="text-xs">{t('conversation.subject')}</Label>
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
          placeholder={t('conversation.reply_placeholder')}
          className="h-32 resize-none text-sm"
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={suggest} disabled={suggesting || sending} title={t('conversation.ai_reply_hint')}>
            {suggesting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {suggesting ? t('conversation.ai_reply_drafting') : t('conversation.ai_reply')}
          </Button>
          <Button onClick={send} disabled={sending}>
            <Send className="size-4" />
            {sending ? t('conversation.sending') : t('conversation.send')}
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
