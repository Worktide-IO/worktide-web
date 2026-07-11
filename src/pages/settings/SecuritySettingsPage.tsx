import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Monitor,
  Bell,
  Clock,
  Globe,
  LogOut,
  Mail,
  MessageSquare,
  MonitorSmartphone,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import i18n from '@/i18n';

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
  { value: 'off', label: 'security.idle_never' },
  { value: '5', label: 'security.idle_5min' },
  { value: '15', label: 'security.idle_15min' },
  { value: '30', label: 'security.idle_30min' },
  { value: '60', label: 'security.idle_1h' },
  { value: '120', label: 'security.idle_2h' },
];

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return i18n.t('security.time_just_now');
  if (min < 60) return i18n.t('security.time_min_ago', { count: min });
  const h = Math.floor(min / 60);
  if (h < 24) return i18n.t('security.time_hours_ago', { count: h });
  const d = Math.floor(h / 24);
  if (d < 30) return i18n.t(d === 1 ? 'security.time_day_ago' : 'security.time_days_ago', { count: d });
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
      <NotificationsCard />
      <IdleTimeoutCard />
    </SettingsLayout>
  );
}

type NotifPrefs = {
  email: boolean;
  chat: boolean;
  frequency: string;
  types: Record<string, boolean>;
  quietHours: { start: string; end: string } | null;
};
type ChatStatus = { provider: string | null; enabled: boolean; configured: boolean };
const CHAT_PROVIDERS = [
  { value: 'slack', label: 'Slack' },
  { value: 'mattermost', label: 'Mattermost' },
  { value: 'teams', label: 'Microsoft Teams' },
];

/**
 * Notification delivery channels: e-mail + chat (Slack/Mattermost/Teams). In-app
 * (the bell) is always on. The chat webhook URL is write-only — we only learn
 * whether one is configured; "Test senden" posts a live message.
 */
function NotificationsCard() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [chat, setChat] = useState<ChatStatus | null>(null);
  const [provider, setProvider] = useState('slack');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api.get('/me/preferences').then(({ data }) => setPrefs(data.notificationPreferences)).catch(() => undefined);
    api
      .get<ChatStatus>('/me/chat-webhook')
      .then(({ data }) => {
        setChat(data);
        if (data.provider) setProvider(data.provider);
      })
      .catch(() => setChat({ provider: null, enabled: false, configured: false }));
  }, []);

  const savePrefs = async (next: Partial<NotifPrefs>) => {
    if (!prefs) return;
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    try {
      await api.put('/me/preferences', { notificationPreferences: merged });
    } catch {
      toast.error(t('toast.could_not_save'));
    }
  };

  const saveWebhook = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await api.put<ChatStatus>('/me/chat-webhook', { provider, url: url.trim(), enabled: true });
      setChat(data);
      setUrl('');
      setMsg(t('security.conn_saved'));
    } catch {
      setMsg(t('security.url_invalid'));
    } finally {
      setBusy(false);
    }
  };

  const testWebhook = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await api.post<{ sent: boolean }>('/me/chat-webhook/test');
      setMsg(data.sent ? t('security.test_sent') : t('security.send_failed_enabled'));
    } catch {
      setMsg(t('security.send_failed'));
    } finally {
      setBusy(false);
    }
  };

  const removeWebhook = async () => {
    setBusy(true);
    try {
      await api.delete('/me/chat-webhook');
      setChat({ provider: null, enabled: false, configured: false });
      setMsg(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-5 text-muted-foreground" />
          {t('security.notifications')}
        </CardTitle>
        <CardDescription>
          {t('security.notifications_desc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!prefs ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="size-4 text-muted-foreground" /> {t('security.channel_email')}
              </div>
              <Switch checked={prefs.email} onCheckedChange={(v) => savePrefs({ email: v })} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <MessageSquare className="size-4 text-muted-foreground" /> Chat (Slack/Mattermost/Teams)
              </div>
              <Switch checked={prefs.chat} onCheckedChange={(v) => savePrefs({ chat: v })} />
            </div>
          </>
        )}

        {chat ? (
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="size-4 text-muted-foreground" /> {t('security.chat_connection')}
              {chat.configured ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                  {CHAT_PROVIDERS.find((p) => p.value === chat.provider)?.label ?? chat.provider} · {t('security.configured')}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <Label className="text-xs">{t('security.service')}</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHAT_PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-56 grow gap-1">
                <Label className="text-xs">Incoming-Webhook-URL {chat.configured ? t('security.set_new') : ''}</Label>
                <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.slack.com/services/…" />
              </div>
              <Button type="button" onClick={saveWebhook} disabled={busy || !url.trim()}>
                {t('action.save')}
              </Button>
            </div>
            {chat.configured ? (
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={testWebhook} disabled={busy}>
                  {t('security.send_test')}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={removeWebhook} disabled={busy}>
                  {t('security.remove')}
                </Button>
              </div>
            ) : null}
            {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SessionsCard() {
  const { t } = useTranslation();
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
      toast.error(t('toast.sessions_load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const revoke = async (id: number) => {
    if (!window.confirm(t('security.confirm_end_session'))) {
      return;
    }
    setBusy(id);
    try {
      await api.delete(`/me/sessions/${id}`);
      toast.success(t('toast.session_ended'));
      await load();
      qc.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      console.warn('Session revoke failed', err);
      toast.error(t('toast.could_not_end_session'));
    } finally {
      setBusy(null);
    }
  };

  const revokeOthers = async () => {
    if (!window.confirm(t('security.confirm_end_others'))) {
      return;
    }
    setBusy('others');
    try {
      const { data } = await api.post<{ revoked: number }>('/me/sessions/revoke-others');
      toast.success(t('toast.sessions_ended', { count: data.revoked }));
      await load();
    } catch (err) {
      console.warn('Revoke-others failed', err);
      toast.error(t('toast.could_not_end_other_sessions'));
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
          {t('security.active_sessions')}
        </CardTitle>
        <CardDescription>
          {t('security.active_sessions_desc')}
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
            {t('security.no_sessions')}
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
                          {t('security.this_session')}
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
                        {t('security.last_seen')} {relativeTime(s.lastSeenAt)}
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
                      <span className="ml-1">{t('security.end')}</span>
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
              {t('security.logout_others', { count: othersCount })}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function IdleTimeoutCard() {
  const { t } = useTranslation();
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
      toast.success(t('toast.auto_logout_updated'));
    } catch (err) {
      console.warn('Idle timeout save failed', err);
      toast.error(t('toast.could_not_save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-5 text-muted-foreground" />
          {t('security.idle_logout')}
        </CardTitle>
        <CardDescription>
          {t('security.idle_logout_desc')}
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
                    {t(o.label)}
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
