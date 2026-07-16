import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Bug, Camera, Lightbulb, Loader2, Paintbrush, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { feedbackApi, type FeedbackSubmitInput } from '@/lib/feedback';
import { getDiagnostics } from '@/lib/diagnostics';
import { captureViewport } from '@/lib/screenshot';
import { enqueueMutation, drainPendingQueue } from '@/lib/pendingQueue';
import { SnipEditor } from './SnipEditor';

const OPEN_EVENT = 'wt-open-feedback';

export type FeedbackPrefill = { title?: string; description?: string; category?: string };

/** Open the feedback reporter from anywhere (header button, error boundary). */
export function openFeedback(prefill?: FeedbackPrefill): void {
  window.dispatchEvent(new CustomEvent<FeedbackPrefill>(OPEN_EVENT, { detail: prefill ?? {} }));
}

const CATEGORIES: { key: string; icon: React.ElementType }[] = [
  { key: 'bug', icon: Bug },
  { key: 'feature', icon: Lightbulb },
  { key: 'ui_ux', icon: Paintbrush },
];

function isNetworkError(err: unknown): boolean {
  const e = err as { response?: unknown; code?: string };
  return !e?.response || e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED';
}

/**
 * The feedback reporter — a global overlay mounted once in AppLayout, opened via
 * {@link openFeedback}. Pure client-side compose (works when the backend/app is
 * erroring); submit queues-and-retries on a network outage.
 */
export function FeedbackWidget() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [captureUrl, setCaptureUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<FeedbackPrefill>).detail ?? {};
      setTitle(detail.title ?? '');
      setDescription(detail.description ?? '');
      setCategory(detail.category ?? 'bug');
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);

  const clearShot = () => {
    setShot((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const resetAndClose = () => {
    clearShot();
    setTitle('');
    setDescription('');
    setCategory('bug');
    setIncludeDiagnostics(true);
    setOpen(false);
  };

  const startSnip = async () => {
    setCapturing(true);
    setOpen(false);
    // Let the dialog unmount so it isn't part of the screenshot.
    await new Promise((r) => setTimeout(r, 180));
    try {
      const dataUrl = await captureViewport();
      setCaptureUrl(dataUrl);
    } catch {
      toast.error(t('feedback.screenshot_failed'));
      setOpen(true);
    } finally {
      setCapturing(false);
    }
  };

  const onSnipDone = (blob: Blob) => {
    clearShot();
    setShot({ blob, url: URL.createObjectURL(blob) });
    setCaptureUrl(null);
    setOpen(true);
  };

  const onSnipCancel = () => {
    setCaptureUrl(null);
    setOpen(true);
  };

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);

    const input: FeedbackSubmitInput = {
      title: trimmed,
      category,
      description: description.trim() || undefined,
      route: location.pathname + location.search,
      appVersion: (import.meta.env?.VITE_APP_VERSION as string | undefined) ?? undefined,
      diagnostics: includeDiagnostics ? getDiagnostics() : undefined,
    };

    try {
      const ticket = await feedbackApi.submit(input);
      if (shot) {
        try {
          await feedbackApi.uploadScreenshot(ticket.id, shot.blob);
        } catch {
          // Screenshot is best-effort; the report is already filed.
        }
      }
      toast.success(t('feedback.submitted'));
      window.dispatchEvent(new Event('wt-feedback-submitted'));
      resetAndClose();
    } catch (err) {
      if (isNetworkError(err)) {
        // Backend/network down → queue and replay on recovery.
        enqueueMutation({
          key: `feedback-${Date.now()}`,
          method: 'post',
          url: '/feedback',
          body: input,
          contentType: 'application/json',
          label: t('feedback.queued_label'),
        });
        void drainPendingQueue();
        toast.message(t('feedback.queued'));
        resetAndClose();
      } else {
        toast.error(t('feedback.submit_failed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {captureUrl && <SnipEditor imageDataUrl={captureUrl} onDone={onSnipDone} onCancel={onSnipCancel} />}

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : resetAndClose())}>
        <DialogContent data-feedback-chrome="true" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="size-4" /> {t('feedback.title')}
            </DialogTitle>
            <DialogDescription>{t('feedback.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={
                    'flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition ' +
                    (category === c.key
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted')
                  }
                >
                  <c.icon className="size-4" />
                  {t(`feedback.category.${c.key}`)}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="feedback-title">{t('feedback.label_title')}</Label>
              <Input
                id="feedback-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('feedback.placeholder_title')}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="feedback-desc">{t('feedback.label_description')}</Label>
              <Textarea
                id="feedback-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('feedback.placeholder_description')}
                rows={4}
              />
            </div>

            <div className="flex items-center gap-2">
              {shot ? (
                <div className="flex items-center gap-2">
                  <img src={shot.url} alt="" className="h-12 w-auto rounded border border-border" />
                  <Button type="button" size="sm" variant="ghost" onClick={clearShot}>
                    <X className="size-4" /> {t('feedback.remove_screenshot')}
                  </Button>
                </div>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={startSnip} disabled={capturing}>
                  {capturing ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                  {t('feedback.add_screenshot')}
                </Button>
              )}
            </div>

            <div className="flex items-start justify-between gap-3 rounded-md bg-muted/50 p-2.5">
              <div className="space-y-0.5">
                <Label htmlFor="feedback-diag" className="text-sm">
                  {t('feedback.include_diagnostics')}
                </Label>
                <p className="text-xs text-muted-foreground">{t('feedback.diagnostics_hint')}</p>
              </div>
              <Switch id="feedback-diag" checked={includeDiagnostics} onCheckedChange={setIncludeDiagnostics} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={resetAndClose}>
              {t('action.cancel')}
            </Button>
            <Button type="button" onClick={submit} disabled={submitting || !title.trim()}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('feedback.send')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
