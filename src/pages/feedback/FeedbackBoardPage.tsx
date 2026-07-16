import { useCallback, useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, MessagesSquare, Plus, Send } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import {
  feedbackApi,
  type FeedbackAuthorLabel,
  type FeedbackDetail,
  type FeedbackTicket,
} from '@/lib/feedback';
import { openFeedback } from '@/components/feedback/FeedbackWidget';

const CATEGORY_KEYS = ['bug', 'feature', 'ui_ux'] as const;
const STATUS_KEYS = ['new', 'triaged', 'planned', 'in_progress', 'done', 'declined'] as const;

export function FeedbackBoardPage() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    feedbackApi
      .list({ category: category || undefined, status: status || undefined })
      .then(setTickets)
      .catch(() => toast.error(t('feedback.load_failed')))
      .finally(() => setLoading(false));
  }, [category, status, t]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when a report is filed via the global widget while viewing the board.
  useEffect(() => {
    const onSubmitted = () => load();
    window.addEventListener('wt-feedback-submitted', onSubmitted);
    return () => window.removeEventListener('wt-feedback-submitted', onSubmitted);
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <MessagesSquare className="size-5" /> {t('feedback.board_title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('feedback.board_subtitle')}</p>
        </div>
        <Button type="button" onClick={() => openFeedback()}>
          <Plus className="size-4" /> {t('feedback.new')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChips label={t('feedback.filter_all')} value="" active={category === ''} onClick={() => setCategory('')} />
        {CATEGORY_KEYS.map((k) => (
          <FilterChips key={k} label={t(`feedback.category.${k}`)} value={k} active={category === k} onClick={() => setCategory(k)} />
        ))}
        <span className="mx-1 w-px bg-border" />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          <option value="">{t('feedback.filter_any_status')}</option>
          {STATUS_KEYS.map((k) => (
            <option key={k} value={k}>
              {t(`feedback.status.${k}`)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          {t('feedback.empty')}
        </div>
      ) : (
        <ul className="space-y-2">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <button
                type="button"
                onClick={() => setSelected(ticket.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition hover:bg-muted/50"
              >
                <CategoryDot ticket={ticket} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{ticket.title}</span>
                    {ticket.isMine && <Badge variant="secondary" className="shrink-0">{t('feedback.author.you')}</Badge>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{categoryLabel(ticket.category, t)}</span>
                    <span>·</span>
                    <span>{authorText(ticket.authorLabel, t)}</span>
                    {ticket.replyCount > 0 && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <MessagesSquare className="size-3" /> {ticket.replyCount}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <StatusBadge ticket={ticket} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <FeedbackDetailSheet id={selected} onClose={() => setSelected(null)} onReplied={load} />
    </div>
  );
}

function FilterChips({ label, active, onClick }: { label: string; value: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-3 py-1 text-xs transition ' +
        (active ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')
      }
    >
      {label}
    </button>
  );
}

function CategoryDot({ ticket }: { ticket: FeedbackTicket }) {
  return (
    <span
      aria-hidden
      className="size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: ticket.category.color ?? '#94a3b8' }}
    />
  );
}

function StatusBadge({ ticket }: { ticket: FeedbackTicket }) {
  const { t } = useTranslation();
  return (
    <Badge variant={ticket.status.isCompleted ? 'secondary' : 'outline'} className="shrink-0">
      {statusLabel(ticket.status, t)}
    </Badge>
  );
}

function FeedbackDetailSheet({
  id,
  onClose,
  onReplied,
}: {
  id: string | null;
  onClose: () => void;
  onReplied: () => void;
}) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<FeedbackDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    setLoading(true);
    feedbackApi
      .get(id)
      .then(setDetail)
      .catch(() => toast.error(t('feedback.load_failed')))
      .finally(() => setLoading(false));
  }, [id, t]);

  const sendReply = async () => {
    const content = reply.trim();
    if (!content || !id || sending) return;
    setSending(true);
    try {
      const created = await feedbackApi.reply(id, content);
      setDetail((prev) => (prev ? { ...prev, replies: [...prev.replies, created] } : prev));
      setReply('');
      onReplied();
    } catch {
      toast.error(t('feedback.reply_failed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={id !== null} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-lg">
        {loading || !detail ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 pr-6">{detail.ticket.title}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <span>{categoryLabel(detail.ticket.category, t)}</span>
                <span>·</span>
                <span>{statusLabel(detail.ticket.status, t)}</span>
                <span>·</span>
                <span>{authorText(detail.ticket.authorLabel, t)}</span>
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 overflow-auto py-4">
              {detail.ticket.description && (
                <p className="whitespace-pre-wrap text-sm text-foreground">{detail.ticket.description}</p>
              )}
              {detail.ticket.submitter?.name && (
                <p className="rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
                  {t('feedback.submitted_by', { name: detail.ticket.submitter.name })}
                </p>
              )}

              <div className="space-y-3 border-t border-border pt-3">
                <h3 className="text-xs font-medium uppercase text-muted-foreground">
                  {t('feedback.replies')} ({detail.replies.length})
                </h3>
                {detail.replies.map((r) => (
                  <div key={r.id} className="rounded-md bg-muted/50 p-2.5 text-sm">
                    <div className="mb-1 text-xs font-medium text-muted-foreground">{authorText(r.authorLabel, t)}</div>
                    <p className="whitespace-pre-wrap">{r.content}</p>
                  </div>
                ))}
                {detail.replies.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('feedback.no_replies')}</p>
                )}
              </div>
            </div>

            <div className="space-y-2 border-t border-border pt-3">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={t('feedback.reply_placeholder')}
                rows={2}
              />
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={sendReply} disabled={sending || !reply.trim()}>
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {t('feedback.reply_send')}
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// --- label helpers (bilingual via stable keys; fall back to server label) ---

function authorText(label: FeedbackAuthorLabel, t: TFunction): string {
  if (label && typeof label === 'object') return label.name ?? t('feedback.author.user');
  return t(`feedback.author.${label}`);
}

function categoryLabel(cat: FeedbackTicket['category'], t: TFunction): string {
  return t(`feedback.category.${cat.key}`, { defaultValue: cat.label ?? cat.key });
}

function statusLabel(status: FeedbackTicket['status'], t: TFunction): string {
  return t(`feedback.status.${status.key}`, { defaultValue: status.label });
}
