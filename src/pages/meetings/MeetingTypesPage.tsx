import { useGetIdentity, useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Copy, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { TranslationsFields, type TranslationsMap } from '@/components/TranslationsFields';
import { useSupportedLanguages, useLocalize } from '@/lib/languages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Window = { weekday: number; start: string; end: string };
type MeetingTypeRow = Row<{
  '@id': string;
  id?: string;
  slug: string;
  title: string;
  description?: string | null;
  durationMinutes: number;
  enabled: boolean;
  locationType: string;
  locationDetail?: string | null;
  timezone: string;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  availability: Window[];
  translations?: TranslationsMap | null;
}>;

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const PORTAL_BASE = import.meta.env.VITE_PORTAL_BASE_URL ?? 'https://worktide-portal.ddev.site';

type FormState = {
  id?: string;
  slug: string;
  title: string;
  description: string;
  durationMinutes: number;
  enabled: boolean;
  locationType: string;
  locationDetail: string;
  timezone: string;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  availability: Window[];
  translations: TranslationsMap;
};

const BLANK: FormState = {
  slug: '',
  title: '',
  description: '',
  durationMinutes: 30,
  enabled: true,
  locationType: 'video',
  locationDetail: '',
  timezone: 'Europe/Berlin',
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  minNoticeMinutes: 240,
  maxAdvanceDays: 30,
  translations: {},
  availability: [
    { weekday: 1, start: '09:00', end: '17:00' },
    { weekday: 2, start: '09:00', end: '17:00' },
    { weekday: 3, start: '09:00', end: '17:00' },
    { weekday: 4, start: '09:00', end: '17:00' },
    { weekday: 5, start: '09:00', end: '17:00' },
  ],
};

/**
 * Meeting-type management (Calendly-style). Staff define bookable meeting types
 * with weekly availability; customers book at {PORTAL}/book/<slug>. Mirrors the
 * direct-api CRUD pattern of IndustriesPage/NewslettersPage.
 */
export function MeetingTypesPage() {
  const { t } = useTranslation();
  const { result, query } = useList<MeetingTypeRow>({
    resource: 'meeting_types',
    pagination: { mode: 'off' },
    sorters: [{ field: 'title', order: 'asc' }],
  });
  const { data: identity } = useGetIdentity<{ id?: string }>();
  const { languages } = useSupportedLanguages();
  const localize = useLocalize();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = result?.data ?? [];
  const workspaceIri = (() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    return id ? `/v1/workspaces/${id}` : undefined;
  })();

  const save = async () => {
    if (!form) return;
    if (!form.title.trim() || !/^[a-z0-9-]{1,60}$/.test(form.slug)) {
      toast.error(t('toast.title_slug_required'));
      return;
    }
    setBusy(true);
    const payload: Record<string, unknown> = {
      slug: form.slug,
      title: form.title.trim(),
      description: form.description.trim() || null,
      durationMinutes: form.durationMinutes,
      enabled: form.enabled,
      locationType: form.locationType,
      locationDetail: form.locationDetail.trim() || null,
      timezone: form.timezone,
      bufferBeforeMinutes: form.bufferBeforeMinutes,
      bufferAfterMinutes: form.bufferAfterMinutes,
      minNoticeMinutes: form.minNoticeMinutes,
      maxAdvanceDays: form.maxAdvanceDays,
      availability: form.availability,
      translations: form.translations,
    };
    try {
      if (form.id) {
        await api.patch(`/meeting_types/${form.id}`, payload, {
          headers: { 'Content-Type': 'application/merge-patch+json' },
        });
      } else {
        await api.post('/meeting_types', {
          ...payload,
          workspace: workspaceIri,
          ...(identity?.id ? { host: `/v1/users/${identity.id}` } : {}),
        });
      }
      toast.success(t('toast.saved'));
      setForm(null);
      await query.refetch();
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      toast.error(status === 422 ? t('toast.slug_taken') : t('toast.save_failed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: MeetingTypeRow) => {
    if (!r.id || !window.confirm(t('meeting_types.confirm_delete', { title: r.title }))) return;
    try {
      await api.delete(`/meeting_types/${r.id}`);
      toast.success(t('toast.deleted'));
      await query.refetch();
    } catch {
      toast.error(t('toast.delete_failed'));
    }
  };

  const copyLink = (slug: string) => {
    void navigator.clipboard?.writeText(`${PORTAL_BASE.replace(/\/$/, '')}/book/${slug}`);
    toast.success(t('toast.booking_link_copied'));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl">
            <CalendarClock className="size-6 text-muted-foreground" /> {t('meeting_types.heading')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('meeting_types.subtitle')} <code>/book/&lt;slug&gt;</code>.
          </p>
        </div>
        <Button type="button" onClick={() => setForm({ ...BLANK })}>
          <Plus className="size-4" /> {t('meeting_types.new')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('meeting_types.count', { count: rows.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('meeting_types.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('meeting_types.title')}</TableHead>
                  <TableHead className="w-20">{t('meeting_types.col_duration')}</TableHead>
                  <TableHead className="w-24">{t('meeting_types.col_status')}</TableHead>
                  <TableHead className="w-56 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r['@id']}>
                    <TableCell>
                      <div className="font-medium">{localize(r, 'title')}</div>
                      <div className="text-xs text-muted-foreground">/book/{r.slug}</div>
                    </TableCell>
                    <TableCell>{t('meeting_types.minutes', { n: r.durationMinutes })}</TableCell>
                    <TableCell>
                      <Badge variant={r.enabled ? 'secondary' : 'outline'} className="text-[10px]">
                        {r.enabled ? t('meeting_types.active') : t('meeting_types.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => copyLink(r.slug)}>
                          <Copy className="size-3" /> Link
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7"
                          onClick={() => setForm({
                            id: r.id,
                            slug: r.slug,
                            title: r.title,
                            description: r.description ?? '',
                            durationMinutes: r.durationMinutes,
                            enabled: r.enabled,
                            locationType: r.locationType,
                            locationDetail: r.locationDetail ?? '',
                            timezone: r.timezone,
                            bufferBeforeMinutes: r.bufferBeforeMinutes,
                            bufferAfterMinutes: r.bufferAfterMinutes,
                            minNoticeMinutes: r.minNoticeMinutes,
                            maxAdvanceDays: r.maxAdvanceDays,
                            availability: r.availability ?? [],
                            translations: r.translations ?? {},
                          })}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => remove(r)}>
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? t('meeting_types.edit') : t('meeting_types.new')}</DialogTitle>
          </DialogHeader>
          {form ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label>{t('meeting_types.title')}</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Slug</Label>
                  <Input value={form.slug} placeholder="projekt-update" onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} />
                </div>
                <div className="space-y-1">
                  <Label>{t('meeting_types.duration_min')}</Label>
                  <Input type="number" min={1} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t('meeting_types.description')}</Label>
                <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <TranslationsFields
                fields={[
                  { key: 'title', label: t('meeting_types.title') },
                  { key: 'description', label: t('meeting_types.description') },
                ]}
                locales={languages}
                value={form.translations}
                onChange={(translations) => setForm({ ...form, translations })}
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('meeting_types.location')}</Label>
                  <Select value={form.locationType} onValueChange={(v) => setForm({ ...form, locationType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="video">{t('meeting_types.loc_video')}</SelectItem>
                      <SelectItem value="phone">{t('meeting_types.loc_phone')}</SelectItem>
                      <SelectItem value="in_person">{t('meeting_types.loc_in_person')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t('meeting_types.location_detail')}</Label>
                  <Input value={form.locationDetail} placeholder={t('meeting_types.location_detail_ph')} onChange={(e) => setForm({ ...form, locationDetail: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>{t('meeting_types.min_notice')}</Label>
                  <Input type="number" min={0} value={form.minNoticeMinutes} onChange={(e) => setForm({ ...form, minNoticeMinutes: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label>{t('meeting_types.max_advance')}</Label>
                  <Input type="number" min={1} value={form.maxAdvanceDays} onChange={(e) => setForm({ ...form, maxAdvanceDays: Number(e.target.value) })} />
                </div>
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <Label>{t('meeting_types.availability', { tz: form.timezone })}</Label>
                  <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setForm({ ...form, availability: [...form.availability, { weekday: 1, start: '09:00', end: '17:00' }] })}>
                    <Plus className="size-3" /> {t('meeting_types.time_slot')}
                  </Button>
                </div>
                {form.availability.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('meeting_types.no_slots')}</p>
                ) : (
                  form.availability.map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Select value={String(w.weekday)} onValueChange={(v) => {
                        const a = [...form.availability]; a[i] = { ...w, weekday: Number(v) }; setForm({ ...form, availability: a });
                      }}>
                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {WEEKDAYS.map((d, idx) => <SelectItem key={idx} value={String(idx + 1)}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input type="time" value={w.start} className="w-28" onChange={(e) => { const a = [...form.availability]; a[i] = { ...w, start: e.target.value }; setForm({ ...form, availability: a }); }} />
                      <span className="text-muted-foreground">–</span>
                      <Input type="time" value={w.end} className="w-28" onChange={(e) => { const a = [...form.availability]; a[i] = { ...w, end: e.target.value }; setForm({ ...form, availability: a }); }} />
                      <Button type="button" variant="ghost" size="sm" className="h-8 text-destructive" onClick={() => setForm({ ...form, availability: form.availability.filter((_, j) => j !== i) })}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="mt-enabled">{t('meeting_types.active_bookable')}</Label>
                <Switch id="mt-enabled" checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setForm(null)} disabled={busy}>{t('action.cancel')}</Button>
            <Button type="button" onClick={save} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : null} {t('action.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
