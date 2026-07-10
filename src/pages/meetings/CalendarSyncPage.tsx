import { useGetIdentity, useList } from '@refinedev/core';
import { RefreshCw, CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ConnRow = Row<{
  '@id': string;
  id?: string;
  owner: string;
  configured: boolean;
  active: boolean;
  lastSyncedAt?: string | null;
  lastError?: string | null;
}>;

/**
 * Personal calendar sync: the logged-in staff member connects their external
 * calendar via a secret ICS feed URL, so booking slots only offer times when
 * they're actually free. The feed is polled every ~10 min (cron). The URL is
 * write-only (never shown back).
 */
export function CalendarSyncPage() {
  const { data: identity } = useGetIdentity<{ id?: string }>();
  const ownerIri = identity?.id ? `/v1/users/${identity.id}` : undefined;

  const { result, query } = useList<ConnRow>({
    resource: 'staff_calendar_connections',
    pagination: { mode: 'off' },
    filters: ownerIri ? [{ field: 'owner', operator: 'eq', value: ownerIri }] : [],
    queryOptions: { enabled: Boolean(ownerIri) },
  });
  const conn = result?.data?.[0];

  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const workspaceIri = (() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    return id ? `/v1/workspaces/${id}` : undefined;
  })();

  const save = async () => {
    const u = url.trim();
    if (!/^https?:\/\//.test(u)) {
      toast.error('Bitte eine gültige ICS-URL (https://…) angeben.');
      return;
    }
    setBusy(true);
    try {
      if (conn?.id) {
        await api.patch(`/staff_calendar_connections/${conn.id}`, { icsUrl: u }, {
          headers: { 'Content-Type': 'application/merge-patch+json' },
        });
      } else {
        await api.post('/staff_calendar_connections', { owner: ownerIri, workspace: workspaceIri, icsUrl: u });
      }
      toast.success('Kalender verbunden. Sync erfolgt in Kürze.');
      setUrl('');
      await query.refetch();
    } catch {
      toast.error('Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!conn?.id || !window.confirm('Kalenderverbindung entfernen?')) return;
    try {
      await api.delete(`/staff_calendar_connections/${conn.id}`);
      toast.success('Verbindung entfernt.');
      await query.refetch();
    } catch {
      toast.error('Entfernen fehlgeschlagen.');
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-2xl">
          <RefreshCw className="size-6 text-muted-foreground" /> Kalender-Sync
        </h2>
        <p className="text-sm text-muted-foreground">
          Verbinde deinen Kalender per ICS-Feed — dann werden Buchungs-Slots nur angeboten, wenn du
          wirklich frei bist. Der Feed wird alle ~10 Minuten abgeglichen.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {conn?.configured ? 'Verbundener Kalender' : 'Kalender verbinden'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {conn?.configured ? (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary" className="gap-1"><CheckCircle2 className="size-3.5" /> Verbunden</Badge>
              <span className="text-muted-foreground">
                {conn.lastSyncedAt
                  ? `Zuletzt synchronisiert: ${new Date(conn.lastSyncedAt).toLocaleString('de-DE')}`
                  : 'Noch nicht synchronisiert'}
              </span>
            </div>
          ) : null}
          {conn?.lastError ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">Letzter Fehler: {conn.lastError}</p>
          ) : null}

          <div className="space-y-1">
            <Label>{conn?.configured ? 'ICS-URL ersetzen' : 'ICS-Feed-URL'}</Label>
            <Input
              value={url}
              placeholder="https://calendar.google.com/…/basic.ics"
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Die geheime iCal-/ICS-Export-URL aus Google Kalender, Outlook oder Apple Kalender. Wird
              aus Sicherheitsgründen nicht erneut angezeigt.
            </p>
          </div>

          <div className="flex gap-2">
            <Button type="button" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {conn?.configured ? 'Aktualisieren' : 'Verbinden'}
            </Button>
            {conn?.configured ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={disconnect}>
                Entfernen
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
