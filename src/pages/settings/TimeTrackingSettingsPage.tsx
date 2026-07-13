import { useInvalidate, useList } from '@refinedev/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

import { SettingsLayout } from './SettingsLayout';

/**
 * `/settings/time-tracking` — per-workspace time-tracking policy. These knobs
 * live on the TimeTrackingSettings singleton (one row per workspace). There is
 * no seed row, so the first save POSTs a fresh row and later saves PATCH it.
 * Writing needs workspace MANAGE (backend voter); non-admins get a 403 toast.
 */
type SettingsRow = Row<{
  '@id'?: string;
  id?: string;
  roundingMinutes?: number;
  minimumMinutes?: number;
  lockAfterDays?: number | null;
  allowFutureEntries?: boolean;
  autoStopMinutes?: number | null;
}>;

export function TimeTrackingSettingsPage() {
  const { t } = useTranslation();
  return (
    <SettingsLayout>
      <div>
        <h2 className="text-2xl">{t('tt_settings.heading')}</h2>
        <p className="text-sm text-muted-foreground">{t('tt_settings.subtitle')}</p>
      </div>
      <TimeTrackingForm />
    </SettingsLayout>
  );
}

/** Empty string ↔ "disabled" (null). Non-negative integers only. */
function toNullableInt(v: string): number | null {
  const n = parseInt(v, 10);
  return v.trim() === '' || Number.isNaN(n) || n <= 0 ? null : n;
}

function TimeTrackingForm() {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const wsId = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;

  const { result, query } = useList<SettingsRow>({
    resource: 'time_tracking_settings',
    pagination: { mode: 'off' },
  });
  const row = result?.data?.[0] ?? null;

  const [autoStop, setAutoStop] = useState('');
  const [rounding, setRounding] = useState('0');
  const [minimum, setMinimum] = useState('0');
  const [lockAfter, setLockAfter] = useState('');
  const [allowFuture, setAllowFuture] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed form from the loaded settings row
    setAutoStop(row.autoStopMinutes != null ? String(row.autoStopMinutes) : '');
    setRounding(String(row.roundingMinutes ?? 0));
    setMinimum(String(row.minimumMinutes ?? 0));
    setLockAfter(row.lockAfterDays != null ? String(row.lockAfterDays) : '');
    setAllowFuture(Boolean(row.allowFutureEntries));
  }, [row]);

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-40" />
        </CardContent>
      </Card>
    );
  }

  const save = async () => {
    const body = {
      autoStopMinutes: toNullableInt(autoStop),
      roundingMinutes: Math.max(0, parseInt(rounding, 10) || 0),
      minimumMinutes: Math.max(0, parseInt(minimum, 10) || 0),
      lockAfterDays: toNullableInt(lockAfter),
      allowFutureEntries: allowFuture,
    };
    setSaving(true);
    try {
      const id = row?.id ?? row?.['@id']?.split('/').pop();
      if (id) {
        await api.patch(`/time_tracking_settings/${id}`, body, {
          headers: { 'Content-Type': 'application/merge-patch+json' },
        });
      } else {
        if (!wsId) {
          toast.error(t('tt_settings.no_workspace'));
          return;
        }
        await api.post('/time_tracking_settings', {
          ...body,
          workspace: `/v1/workspaces/${wsId}`,
        });
      }
      void invalidate({ resource: 'time_tracking_settings', invalidates: ['list'] });
      toast.success(t('tt_settings.saved'));
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(status === 403 ? t('tt_settings.forbidden') : t('tt_settings.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tt_settings.policy')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="tt-autostop">{t('tt_settings.auto_stop')}</Label>
          <Input
            id="tt-autostop"
            type="number"
            min={0}
            value={autoStop}
            placeholder={t('tt_settings.auto_stop_off')}
            onChange={(e) => setAutoStop(e.target.value)}
            className="w-48"
          />
          <p className="text-xs text-muted-foreground">{t('tt_settings.auto_stop_hint')}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tt-rounding">{t('tt_settings.rounding')}</Label>
          <Input
            id="tt-rounding"
            type="number"
            min={0}
            value={rounding}
            onChange={(e) => setRounding(e.target.value)}
            className="w-48"
          />
          <p className="text-xs text-muted-foreground">{t('tt_settings.rounding_hint')}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tt-minimum">{t('tt_settings.minimum')}</Label>
          <Input
            id="tt-minimum"
            type="number"
            min={0}
            value={minimum}
            onChange={(e) => setMinimum(e.target.value)}
            className="w-48"
          />
          <p className="text-xs text-muted-foreground">{t('tt_settings.minimum_hint')}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tt-lock">{t('tt_settings.lock_after')}</Label>
          <Input
            id="tt-lock"
            type="number"
            min={0}
            value={lockAfter}
            placeholder={t('tt_settings.lock_after_off')}
            onChange={(e) => setLockAfter(e.target.value)}
            className="w-48"
          />
          <p className="text-xs text-muted-foreground">{t('tt_settings.lock_after_hint')}</p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="tt-future">{t('tt_settings.allow_future')}</Label>
            <p className="text-xs text-muted-foreground">{t('tt_settings.allow_future_hint')}</p>
          </div>
          <Switch id="tt-future" checked={allowFuture} onCheckedChange={setAllowFuture} />
        </div>

        <Button onClick={save} disabled={saving}>
          {t('tt_settings.save_button')}
        </Button>
      </CardContent>
    </Card>
  );
}
