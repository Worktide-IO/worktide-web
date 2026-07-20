import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BellOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

type Props = {
  conversationId: string;
  /** Raw sender header, e.g. `Jane Doe <jane@x.test>` or a bare address. */
  senderRaw: string | null | undefined;
  /** Called after the rule was created (hide this thread / refresh the inbox). */
  onMuted: () => void;
};

/** Extract a lowercase email from `Name <a@b>` or a bare address. */
function emailOf(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  const m = s.match(/<([^>]+)>/);
  const candidate = (m ? m[1] : s).trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate) ? candidate.toLowerCase() : '';
}

/**
 * Inbox detail action: "mute this kind of message" — build a Thunderbird-style
 * mute rule from the conversation (sender and/or a subject keyword, combined
 * with AND) and hide matching threads. POST /conversations/{id}/mute-sender.
 * Nothing is deleted — muted threads stay searchable under the "Ignoriert" view.
 *
 * The subject keyword is what makes it precise: e.g. sender = noreply@hetzner.com
 * AND subject contains "Verification Code" mutes only the 2FA mail, not every
 * message from that sender.
 */
export function MuteSenderButton({ conversationId, senderRaw, onMuted }: Props) {
  const { t } = useTranslation();
  const email = useMemo(() => emailOf(senderRaw), [senderRaw]);
  const [open, setOpen] = useState(false);
  const [bySender, setBySender] = useState(true);
  const [subjectKeyword, setSubjectKeyword] = useState('');
  const [busy, setBusy] = useState(false);

  const useSender = bySender && email !== '';
  const keyword = subjectKeyword.trim();
  const canSubmit = useSender || keyword !== '';

  const mute = async () => {
    const conditions: Array<{ field: string; operator: string; value: string }> = [];
    if (useSender) conditions.push({ field: 'sender_email', operator: 'equals', value: email });
    if (keyword !== '') conditions.push({ field: 'subject', operator: 'contains', value: keyword });
    if (conditions.length === 0) return;

    setBusy(true);
    try {
      await api.post(`/conversations/${conversationId}/mute-sender`, { combinator: 'and', conditions });
      toast.success(t('toast.muted'));
      setOpen(false);
      onMuted();
    } catch {
      toast.error(t('toast.mute_failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <BellOff className="size-4" />
          {t('conversation.mute')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('conversation.mute_title')}</DialogTitle>
          <DialogDescription>{t('conversation.mute_desc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-2">
            <Checkbox
              id="mute-by-sender"
              checked={useSender}
              disabled={email === ''}
              onCheckedChange={(v) => setBySender(v === true)}
            />
            <Label htmlFor="mute-by-sender" className="font-normal leading-snug">
              {email !== ''
                ? t('conversation.mute_by_sender', { email })
                : t('conversation.mute_no_sender')}
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mute-subject" className="font-normal">
              {t('conversation.mute_subject_label')}
            </Label>
            <Input
              id="mute-subject"
              value={subjectKeyword}
              onChange={(e) => setSubjectKeyword(e.target.value)}
              placeholder={t('conversation.mute_subject_placeholder')}
            />
            <p className="text-xs text-muted-foreground">{t('conversation.mute_hint')}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            {t('action.cancel')}
          </Button>
          <Button onClick={() => void mute()} disabled={busy || !canSubmit}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : t('conversation.mute_confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
