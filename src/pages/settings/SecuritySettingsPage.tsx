import { useQueryClient } from '@tanstack/react-query';
import {
  Monitor,
  Clock,
  Globe,
  LogOut,
  MonitorSmartphone,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

import { SettingsLayout } from './SettingsLayout';

type Session = {
  id: number;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  validUntil: string | null;
  isCurrent: boolean;
};

type Prefs = {
  dashboardLayout: unknown;
  idleTimeoutMinutes: number | null;
  updatedAt: string | null;
};

const IDLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'off', label: 'Nie' },
  { value: '5', label: '5 Minuten' },
  { value: '15', label: '15 Minuten' },
  { value: '30', label: '30 Minuten' },
  { value: '60', label: '1 Stunde' },
  { value: '120', label: '2 Stunden' },
];

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `vor ${d} Tag${d === 1 ? '' : 'en'}`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Parses a User-Agent string into a short "Chrome on macOS" label.
 * Heuristic only — UA strings are a swamp; if nothing matches, fall
 * back to a generic "Browser" label rather than show the raw soup.
 */
function deviceLabel(ua: string | null): { browser: string; os: string } {
  if (!ua) return { browser: 'Browser', os: '–' };
  const lower = ua.toLowerCase();
  let browser = 'Browser';
  if (/edg\//.test(lower)) browser = 'Edge';
  else if (/chrome\//.test(lower) && !/chromium\//.test(lower)) browser = 'Chrome';
  else if (/firefox\//.test(lower)) browser = 'Firefox';
  else if (/safari\//.test(lower)) browser = 'Safari';
  else if (/curl\//.test(lower)) browser = 'curl';
  else if (/python-requests/.test(lower)) browser = 'Python';
  else if (/^claude-smoke/.test(lower)) browser = 'Smoke-Test';

  let os = '–';
  if (/windows/.test(lower)) os = 'Windows';
  else if (/mac os x|macintosh/.test(lower)) os = 'macOS';
  else if (/iphone|ipad/.test(lower)) os = 'iOS';
  else if (/android/.test(lower)) os = 'Android';
  else if (/linux/.test(lower)) os = 'Linux';

  return { browser, os };
}

export function SecuritySettingsPage() {
  return (
    <SettingsLayout>
      <SessionsCard />
      <IdleTimeoutCard />
    </SettingsLayout>
  );
}

function SessionsCard() {
  const qc = useQueryClient();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | 'others' | null>(null);

  const load = async () => {
    try {
      const { data } = await api.get<{ sessions: Session[] }>('/me/sessions');
      setSessions(data.sessions);
    } catch (err) {
      console.warn('SessionsCard.load failed', err);
      toast.error('Sitzungen konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const revoke = async (id: number) => {
    if (!window.confirm('Diese Sitzung wirklich beenden? Das betroffene Gerät wird bei der nächsten Aktion abgemeldet.')) {
      return;
    }
    setBusy(id);
    try {
      await api.delete(`/me/sessions/${id}`);
      toast.success('Sitzung beendet.');
      await load();
      qc.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      console.warn('Session revoke failed', err);
      toast.error('Konnte Sitzung nicht beenden.');
    } finally {
      setBusy(null);
    }
  };

  const revokeOthers = async () => {
    if (!window.confirm('Alle anderen Sitzungen abmelden? Alle anderen Geräte werden bei der nächsten Aktion ausgeloggt.')) {
      return;
    }
    setBusy('others');
    try {
      const { data } = await api.post<{ revoked: number }>('/me/sessions/revoke-others');
      toast.success(`${data.revoked} Sitzung${data.revoked === 1 ? '' : 'en'} beendet.`);
      await load();
    } catch (err) {
      console.warn('Revoke-others failed', err);
      toast.error('Konnte andere Sitzungen nicht beenden.');
    } finally {
      setBusy(null);
    }
  };

  const othersCount = (sessions ?? []).filter((s) => !s.isCurrent).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MonitorSmartphone className="size-5 text-muted-foreground" />
          Aktive Sitzungen
        </CardTitle>
        <CardDescription>
          Geräte und Browser, die aktuell bei deinem Account angemeldet sind.
          Jede Sitzung entspricht einem Refresh-Token. Schließen entfernt das
          Token sofort — der schon erteilte Zugriff läuft binnen 1 h ab.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : sessions === null || sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine aktiven Sitzungen — das kann eigentlich nicht sein, du bist
            ja gerade angemeldet 🤔
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {sessions.map((s) => {
              const { browser, os } = deviceLabel(s.userAgent);
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-3 p-3"
                >
                  <Monitor className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{browser}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{os}</span>
                      {s.isCurrent ? (
                        <Badge variant="default" className="ml-1 h-5 text-[10px]">
                          diese Sitzung
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {s.ipAddress ? (
                        <span className="inline-flex items-center gap-1">
                          <Globe className="size-3" />
                          {s.ipAddress}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" />
                        Zuletzt: {relativeTime(s.lastSeenAt)}
                      </span>
                    </div>
                  </div>
                  {s.isCurrent ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === s.id}
                      onClick={() => revoke(s.id)}
                      className="shrink-0"
                    >
                      <Trash2 className="size-4" />
                      <span className="ml-1">Beenden</span>
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {othersCount > 0 ? (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={revokeOthers}
              disabled={busy === 'others'}
            >
              <LogOut className="size-4" />
              Alle anderen abmelden ({othersCount})
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function IdleTimeoutCard() {
  const [value, setValue] = useState<string>('off');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<Prefs>('/me/preferences')
      .then(({ data }) => {
        setValue(data.idleTimeoutMinutes ? String(data.idleTimeoutMinutes) : 'off');
      })
      .catch((err) => {
        console.warn('IdleTimeoutCard load failed', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async (next: string) => {
    setSaving(true);
    setValue(next);
    try {
      await api.put('/me/preferences', {
        idleTimeoutMinutes: next === 'off' ? null : Number(next),
      });
      toast.success('Auto-Logout aktualisiert.');
    } catch (err) {
      console.warn('Idle timeout save failed', err);
      toast.error('Konnte nicht speichern.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-5 text-muted-foreground" />
          Automatisch abmelden bei Inaktivität
        </CardTitle>
        <CardDescription>
          Sinnvoll auf Geräten, die unbeaufsichtigt bleiben können (Kundentermin,
          gemeinsam genutzter Laptop). Maus-, Tastatur- oder Scroll-Aktivität
          setzt den Timer zurück.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="idle-timeout">Timeout</Label>
          {loading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select value={value} onValueChange={save} disabled={saving}>
              <SelectTrigger id="idle-timeout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IDLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
