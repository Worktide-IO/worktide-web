import { useGetIdentity } from '@refinedev/core';
import { intlLocale } from '@/lib/intl';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ListChecks, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { useUserDirectory, userDisplayName } from '@/hooks/useUserDirectory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { cn } from '@/lib/utils';

type Identity = { id?: string };

type Health = 'on_track' | 'at_risk' | 'off_track' | 'on_hold' | 'complete';

type StatusUpdate = {
  '@id'?: string;
  id?: string;
  health: Health;
  title?: string | null;
  summary?: string | null;
  risks?: string | null;
  nextSteps?: string | null;
  createdByUser?: string | null;
  createdAt?: string;
};

const HEALTH: { value: Health; label: string; tone: string; dot: string }[] = [
  { value: 'on_track', label: 'On Track', tone: 'text-green-700 bg-green-100 border-green-200', dot: 'bg-green-500' },
  { value: 'at_risk', label: 'At Risk', tone: 'text-amber-800 bg-amber-100 border-amber-200', dot: 'bg-amber-500' },
  { value: 'off_track', label: 'Off Track', tone: 'text-red-700 bg-red-100 border-red-200', dot: 'bg-red-500' },
  { value: 'on_hold', label: 'On Hold', tone: 'text-slate-600 bg-slate-100 border-slate-200', dot: 'bg-slate-400' },
  { value: 'complete', label: 'Abgeschlossen', tone: 'text-sky-700 bg-sky-100 border-sky-200', dot: 'bg-sky-500' },
];
const healthMeta = (h: Health) => HEALTH.find((x) => x.value === h) ?? HEALTH[0];

function readCollection(data: unknown): StatusUpdate[] {
  const doc = data as Record<string, unknown>;
  return (doc?.['member'] ?? doc?.['hydra:member'] ?? []) as StatusUpdate[];
}

/**
 * Per-project status-update feed + editor (backend: ProjectStatusUpdate).
 * Post a RAG health signal with summary / risks / next-steps; the feed shows
 * the history newest-first with author + date. Authors can delete their own
 * entries (the DELETE voter enforces this server-side regardless).
 */
export function ProjectStatusUpdatesTab({ projectIri }: { projectIri: string }) {
  const { t } = useTranslation();
  const { data: identity } = useGetIdentity<Identity>();
  const meIri = identity?.id ? `/v1/users/${identity.id}` : null;
  const { byIri } = useUserDirectory();

  const [updates, setUpdates] = useState<StatusUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [health, setHealth] = useState<Health>('on_track');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [risks, setRisks] = useState('');
  const [nextSteps, setNextSteps] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/project_status_updates', {
        params: { project: projectIri, 'order[createdAt]': 'desc' },
      });
      setUpdates(readCollection(data));
    } catch {
      /* keep prior list */
    } finally {
      setLoading(false);
    }
  }, [projectIri]);

  useEffect(() => {
    void load();
  }, [load]);

  const canSubmit = summary.trim() !== '' || risks.trim() !== '' || nextSteps.trim() !== '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      await api.post('/project_status_updates', {
        project: projectIri,
        health,
        title: title.trim() || null,
        summary: summary.trim() || null,
        risks: risks.trim() || null,
        nextSteps: nextSteps.trim() || null,
      });
      toast.success(t('toast.status_update_posted'));
      setTitle('');
      setSummary('');
      setRisks('');
      setNextSteps('');
      setHealth('on_track');
      void load();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? t('toast.update_post_failed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (u: StatusUpdate) => {
    if (!u.id) return;
    try {
      await api.delete(`/project_status_updates/${u.id}`);
      toast.success(t('toast.update_deleted'));
      void load();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? t('toast.delete_failed'));
    }
  };

  return (
    <div className="space-y-4">
      {/* Editor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('status_updates.new_heading')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label>{t('status_updates.status_label')}</Label>
                <Select value={health} onValueChange={(v) => setHealth(v as Health)}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HEALTH.map((h) => (
                      <SelectItem key={h.value} value={h.value}>
                        <span className="flex items-center gap-2">
                          <span className={cn('size-2 rounded-full', h.dot)} />
                          {h.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-56 flex-1 space-y-1.5">
                <Label htmlFor="su-title">{t('status_updates.title_label')}</Label>
                <Input
                  id="su-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('status_updates.title_placeholder')}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-summary">{t('status_updates.summary_label')}</Label>
              <Textarea
                id="su-summary"
                rows={3}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder={t('status_updates.summary_placeholder')}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="su-risks">{t('status_updates.risks')}</Label>
                <Textarea
                  id="su-risks"
                  rows={3}
                  value={risks}
                  onChange={(e) => setRisks(e.target.value)}
                  placeholder={t('status_updates.risks_placeholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-next">{t('status_updates.next_steps')}</Label>
                <Textarea
                  id="su-next"
                  rows={3}
                  value={nextSteps}
                  onChange={(e) => setNextSteps(e.target.value)}
                  placeholder={t('status_updates.next_steps_placeholder')}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy || !canSubmit}>
                <Send className="size-4" /> {t('status_updates.post')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Feed */}
      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : updates.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t('status_updates.empty')}
        </p>
      ) : (
        <ul className="space-y-3">
          {updates.map((u) => {
            const meta = healthMeta(u.health);
            const author = u.createdByUser ? byIri[u.createdByUser] : undefined;
            const mine = Boolean(meIri && u.createdByUser === meIri);
            return (
              <li key={u['@id'] ?? u.id}>
                <Card>
                  <CardContent className="space-y-3 pt-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={cn('gap-1', meta.tone)}>
                        <span className={cn('size-2 rounded-full', meta.dot)} /> {meta.label}
                      </Badge>
                      {u.title ? <span className="font-medium">{u.title}</span> : null}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {author ? userDisplayName(author) : t('status_updates.unknown_author')}
                        {u.createdAt ? ` · ${new Date(u.createdAt).toLocaleDateString(intlLocale())}` : ''}
                      </span>
                      {mine ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => remove(u)}
                          title={t('action.delete')}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                    {u.summary ? <p className="whitespace-pre-wrap text-sm">{u.summary}</p> : null}
                    {u.risks ? (
                      <div className="text-sm">
                        <p className="mb-1 flex items-center gap-1.5 font-medium text-amber-700">
                          <AlertTriangle className="size-3.5" /> {t('status_updates.risks')}
                        </p>
                        <p className="whitespace-pre-wrap text-muted-foreground">{u.risks}</p>
                      </div>
                    ) : null}
                    {u.nextSteps ? (
                      <div className="text-sm">
                        <p className="mb-1 flex items-center gap-1.5 font-medium">
                          <ListChecks className="size-3.5" /> {t('status_updates.next_steps')}
                        </p>
                        <p className="whitespace-pre-wrap text-muted-foreground">{u.nextSteps}</p>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
