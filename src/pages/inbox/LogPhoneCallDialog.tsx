import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Phone, PhoneIncoming, PhoneOutgoing, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

type Direction = 'inbound' | 'outbound';

/**
 * Log a phone call as a Conversation. The backend (POST /v1/conversations/phone)
 * turns an inbound call into an InboundEvent and an outbound one into an
 * OutboundMessage, both on the workspace's sync-less `phone` channel.
 */
export function LogPhoneCallDialog() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>('inbound');
  const [counterparty, setCounterparty] = useState('');
  const [subject, setSubject] = useState('');
  const [summary, setSummary] = useState('');
  const [duration, setDuration] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDirection('inbound');
    setCounterparty('');
    setSubject('');
    setSummary('');
    setDuration('');
  };

  const submit = async () => {
    if (summary.trim() === '') {
      toast.error(t('phone_call.summary_required'));
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<{ id: string }>('/conversations/phone', {
        direction,
        counterparty: counterparty.trim() || null,
        subject: subject.trim() || null,
        summary: summary.trim(),
        durationMinutes: duration.trim() ? Number(duration) : null,
      });
      toast.success(t('phone_call.logged'));
      setOpen(false);
      reset();
      if (data?.id) navigate(`/inbox/${data.id}`);
    } catch {
      toast.error(t('phone_call.could_not_log'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Phone className="size-4" />
          {t('phone_call.log')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('phone_call.title')}</DialogTitle>
          <DialogDescription>{t('phone_call.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={direction === 'inbound' ? 'default' : 'outline'}
              onClick={() => setDirection('inbound')}
            >
              <PhoneIncoming className="size-4" />
              {t('phone_call.inbound')}
            </Button>
            <Button
              type="button"
              variant={direction === 'outbound' ? 'default' : 'outline'}
              onClick={() => setDirection('outbound')}
            >
              <PhoneOutgoing className="size-4" />
              {t('phone_call.outbound')}
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ph-counterparty">{t('phone_call.counterparty')}</Label>
            <Input
              id="ph-counterparty"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder={t('phone_call.counterparty_placeholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ph-subject">{t('phone_call.subject')}</Label>
            <Input
              id="ph-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('phone_call.subject_placeholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ph-summary">{t('phone_call.summary')}</Label>
            <Textarea
              id="ph-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={t('phone_call.summary_placeholder')}
              rows={4}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ph-duration">{t('phone_call.duration')}</Label>
            <Input
              id="ph-duration"
              type="number"
              min={0}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-32"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            {t('action.cancel')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Phone className="size-4" />}
            {t('phone_call.log')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
