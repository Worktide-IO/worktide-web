import { useInvalidate, useOne } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2, Copy, Link2, Loader2, RotateCw, Save, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { ChannelJsonld } from '@/api/types/channel/Jsonld';
import { ChannelVisibilityFields, type ChannelVisibility } from '@/components/ChannelVisibilityFields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

import { findSourceType } from './catalog';

type Step = 'identify' | 'configure' | 'test' | 'done';
type TestVerdict = { status: 'ok' | 'warning' | 'failed'; message: string };

/**
 * Multi-step wizard that walks the user through adding (or editing)
 * a source. Steps adapt to the source-type's `auth` flavor so the
 * mail-IMAP path differs from the OAuth and webhook paths without
 * a per-adapter modal.
 *
 *   1. Identify  — name, address (skip if editing)
 *   2. Configure — adapter-specific config + credentials
 *   3. Test      — POST /v1/channels/{id}/test, show verdict
 *   4. Done      — summary + redirect
 *
 * Edit mode (`existingChannelId` set) opens directly on Configure
 * so the user can fix one field and re-test without re-typing the
 * whole identity.
 */
export function SourceWizard({
  adapterCode,
  existingChannelId,
  onClose,
}: {
  adapterCode: string;
  existingChannelId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const def = findSourceType(adapterCode);
  const isEdit = Boolean(existingChannelId);

  // Both create and edit start on 'identify' (name + visibility). In edit the
  // channel already exists, so submitIdentify just advances instead of creating.
  const [step, setStep] = useState<Step>('identify');
  const [channelId, setChannelId] = useState<string | null>(existingChannelId);
  const [testVerdict, setTestVerdict] = useState<TestVerdict | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Step-1 fields
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [visibility, setVisibility] = useState<ChannelVisibility>({ isShared: true, ownerUser: null });

  // Load existing channel when editing
  const { result: existing } = useOne<Row<ChannelJsonld>>({
    resource: 'channels',
    id: existingChannelId ?? '',
    queryOptions: { enabled: Boolean(existingChannelId) },
  });
  useEffect(() => {
    if (existing) {
      setName(existing.name ?? '');
      setAddress(existing.address ?? '');
      const ex = existing as unknown as { isShared?: boolean; ownerUser?: string | null };
      setVisibility({ isShared: ex.isShared ?? true, ownerUser: ex.ownerUser ?? null });
    }
  }, [existing]);

  // Step-2 adapter-config fields. Shapes diverge per type — we hold
  // a single flexible record and the step-2 renderer picks fields.
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const initialCfg = useMemo(() => {
    if (!existing) return null;
    const ic = (existing.inboundConfig ?? {}) as Record<string, unknown>;
    const oc = (existing.outboundConfig ?? {}) as Record<string, unknown>;
    const ac = (existing.authConfig ?? {}) as Record<string, unknown>;
    return {
      imapHost: String(ic.host ?? ''),
      imapPort: String(ic.port ?? '993'),
      imapEnc: String(ic.encryption ?? 'ssl'),
      imapFolder: String(ic.folder ?? 'INBOX'),
      smtpHost: String(oc.host ?? ''),
      smtpPort: String(oc.port ?? '587'),
      smtpEnc: String(oc.encryption ?? 'tls'),
      smtpFrom: String(oc.from ?? ''),
      username: String(ac.username ?? ''),
      password: '',
      token: String(ic.token ?? ''),
      // Redmine + Jira pre-fills. `baseUrl` is shared across both;
      // adapter-specific keys never collide because we namespace the
      // password-style fields (apiKey vs jiraPat etc.).
      baseUrl: String(ic.baseUrl ?? ''),
      projectId: String(ic.projectId ?? ''),
      trackerId: String(ic.trackerId ?? ''),
      assignedToId: String(ic.assignedToId ?? ''),
      // Read-only = no `outbound` capability, tracked as a '1'/'' string flag
      // (cfg is string-typed). Default read-only for a fresh ticket source so
      // nothing is pushed back until bidirectional sync is explicitly enabled.
      readOnly: existing
        ? (((existing.capabilities as string[] | undefined) ?? []).includes('outbound') ? '' : '1')
        : '1',
      projectKey: String(ic.projectKey ?? ''),
      jiraApiVersion: String(ic.apiVersion ?? '2'),
      apiKey: '',
      jiraPat: '',
      jiraEmail: String(ac.email ?? ''),
      jiraApiToken: '',
      webhookToken: String(ic.webhookToken ?? ''),
    };
  }, [existing]);
  useEffect(() => {
    if (initialCfg) setCfg(initialCfg);
  }, [initialCfg]);

  const setField = (k: string, v: string) => setCfg((s) => ({ ...s, [k]: v }));

  if (!def) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unbekannte Quelle</DialogTitle>
            <DialogDescription>
              Kein Source-Typ für „{adapterCode}".
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={onClose}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // --- Step 1 → 2 (Identify → Configure) ---
  const submitIdentify = async () => {
    if (!name.trim()) {
      toast.error(t('toast.name_required'));
      return;
    }
    // Editing: the channel already exists — don't create a second one. Just move
    // to the config step; name + visibility are persisted by submitConfigure.
    if (isEdit) {
      setStep('configure');
      return;
    }
    setSaving(true);
    try {
      const workspaceId = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (!workspaceId) throw new Error('Kein aktiver Workspace.');

      // For webhook adapter, generate a strong token immediately so
      // it's visible in step 2 (copy-to-clipboard).
      const inboundConfig: Record<string, unknown> = {};
      if (def.auth === 'token') {
        inboundConfig.token = generateToken();
      }
      // For ticket-system adapters (Redmine, Jira) — auto-generate a
      // separate `webhookToken` so the admin can paste the
      // entity-webhook URL into the third-party admin UI right away.
      // Even before the operator wires it up, having the token in
      // place means the push subscription "just works" when they do.
      if (def.code === 'redmine' || def.code === 'jira') {
        inboundConfig.webhookToken = generateToken();
      }

      const payload = {
        workspace: `/v1/workspaces/${workspaceId}`,
        name: name.trim(),
        adapterCode: def.code,
        address: address.trim() || null,
        capabilities: def.auth === 'token' ? ['inbound'] : ['inbound', 'outbound'],
        inboundConfig,
        outboundConfig: {},
        authConfig: {},
        isShared: visibility.isShared,
        ownerUser: visibility.ownerUser,
      };
      const resp = await api.post<{ id: string; '@id': string }>('/channels', payload);
      setChannelId(resp.data.id);
      // Preload token into form so step 2 shows it
      if (def.auth === 'token' && inboundConfig.token) {
        setField('token', String(inboundConfig.token));
      }
      setStep('configure');
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Konnte Quelle nicht anlegen.');
    } finally {
      setSaving(false);
    }
  };

  // --- Step 2 → 3 (Configure → Test) ---
  const submitConfigure = async () => {
    if (!channelId) {
      toast.error(t('toast.channel_id_missing'));
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        address: address.trim() || null,
        isShared: visibility.isShared,
        ownerUser: visibility.ownerUser,
      };

      if (def.code === 'email_imap') {
        body.inboundConfig = {
          host: cfg.imapHost,
          port: Number(cfg.imapPort) || 993,
          encryption: cfg.imapEnc,
          folder: cfg.imapFolder || 'INBOX',
        };
        body.outboundConfig = {
          host: cfg.smtpHost,
          port: Number(cfg.smtpPort) || 587,
          encryption: cfg.smtpEnc,
          from: cfg.smtpFrom || address,
        };
        const authPatch: Record<string, unknown> = {};
        if (cfg.username) authPatch.username = cfg.username;
        if (cfg.password) authPatch.password = cfg.password;
        if (Object.keys(authPatch).length || !isEdit) body.authConfig = authPatch;
      } else if (def.code === 'webhook_generic') {
        body.inboundConfig = { token: cfg.token };
      } else if (def.code === 'redmine') {
        body.inboundConfig = {
          baseUrl: (cfg.baseUrl ?? '').replace(/\/$/, ''),
          projectId: cfg.projectId || undefined,
          trackerId: cfg.trackerId || undefined,
          assignedToId: cfg.assignedToId || undefined,
          // Preserve the webhookToken minted at create-time so the
          // operator's existing webhook config keeps working after
          // every edit.
          webhookToken: cfg.webhookToken || undefined,
        };
        if (cfg.apiKey) {
          body.authConfig = { apiKey: cfg.apiKey };
        }
        body.entityTypes = ['task'];
        // Read-only = inbound capability only. Without `outbound`, imported
        // mappings are created inbound-only and local edits never push back.
        body.capabilities = cfg.readOnly ? ['inbound'] : ['inbound', 'outbound'];
      } else if (def.code === 'jira') {
        body.inboundConfig = {
          baseUrl: (cfg.baseUrl ?? '').replace(/\/$/, ''),
          apiVersion: cfg.jiraApiVersion || '2',
          projectKey: cfg.projectKey || undefined,
          webhookToken: cfg.webhookToken || undefined,
        };
        const authPatch: Record<string, unknown> = {};
        if (cfg.jiraPat) authPatch.personalAccessToken = cfg.jiraPat;
        if (cfg.jiraEmail) authPatch.email = cfg.jiraEmail;
        if (cfg.jiraApiToken) authPatch.apiToken = cfg.jiraApiToken;
        if (Object.keys(authPatch).length) body.authConfig = authPatch;
        body.entityTypes = ['task'];
      }
      // OAuth adapters don't need a configure PATCH — the OAuth flow
      // populates authConfig directly via the callback.

      await api.patch(`/channels/${channelId}`, body, {
        headers: { 'Content-Type': 'application/merge-patch+json' },
      });
      void invalidate({ resource: 'channels', invalidates: ['list', 'detail'], id: channelId });

      if (def.auth === 'oauth') {
        // OAuth path stops here for now — user clicks "connect" inline
        // and lands back via the callback. Step 3 is then the test
        // of the post-OAuth credentials.
      }
      setStep('test');
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Konfiguration nicht gespeichert.');
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (!channelId) return;
    setTesting(true);
    setTestVerdict(null);
    try {
      const { data } = await api.post<TestVerdict>(`/channels/${channelId}/test`, {});
      setTestVerdict(data);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setTestVerdict({ status: 'failed', message: detail ?? 'Test fehlgeschlagen.' });
    } finally {
      setTesting(false);
    }
  };

  const startOAuth = async () => {
    if (!channelId) return;
    try {
      const { data } = await api.get<{ authorizeUrl: string }>(`/channels/${channelId}/oauth/start`);
      window.location.href = data.authorizeUrl;
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'OAuth-Login fehlgeschlagen.');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? 'Quelle bearbeiten' : 'Neue Quelle: '}
            <Badge variant="outline">{def.label}</Badge>
          </DialogTitle>
          <DialogDescription>{def.description}</DialogDescription>
        </DialogHeader>

        <Stepper step={step} hasOAuth={def.auth === 'oauth'} />

        <div className="space-y-3 py-2">
          {step === 'identify' ? (
            <>
              <IdentifyStep
                name={name}
                setName={setName}
                address={address}
                setAddress={setAddress}
                hint={def.setupHint}
              />
              <ChannelVisibilityFields value={visibility} onChange={setVisibility} />
            </>
          ) : null}

          {step === 'configure' && def.code === 'email_imap' ? (
            <ImapConfigure cfg={cfg} setField={setField} isEdit={isEdit} />
          ) : null}

          {step === 'configure' && def.code === 'webhook_generic' ? (
            <WebhookConfigure token={cfg.token ?? ''} />
          ) : null}

          {step === 'configure' && def.code === 'redmine' ? (
            <RedmineConfigure cfg={cfg} setField={setField} isEdit={isEdit} />
          ) : null}

          {step === 'configure' && def.code === 'jira' ? (
            <JiraConfigure cfg={cfg} setField={setField} isEdit={isEdit} />
          ) : null}

          {step === 'configure' && def.auth === 'oauth' ? (
            <OAuthConfigure
              providerLabel={def.label}
              connected={Boolean(((existing?.authConfig ?? {}) as Record<string, unknown>).accessToken)}
              onConnect={startOAuth}
            />
          ) : null}

          {step === 'test' ? (
            <TestStep verdict={testVerdict} onRun={runTest} testing={testing} />
          ) : null}

          {step === 'done' ? (
            <DoneStep label={def.label} />
          ) : null}
        </div>

        <DialogFooter>
          {step !== 'identify' && step !== 'done' ? (
            <Button
              variant="ghost"
              onClick={() => setStep(step === 'test' ? 'configure' : 'identify')}
              disabled={saving || testing}
            >
              Zurück
            </Button>
          ) : null}
          {step === 'identify' ? (
            <Button onClick={submitIdentify} disabled={saving || !name.trim()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Weiter
            </Button>
          ) : null}
          {step === 'configure' ? (
            <Button onClick={submitConfigure} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Speichern &amp; testen
            </Button>
          ) : null}
          {step === 'test' ? (
            <Button
              onClick={() => setStep('done')}
              disabled={testing || (testVerdict?.status === 'failed')}
              variant={testVerdict?.status === 'ok' ? 'default' : 'outline'}
            >
              {testVerdict?.status === 'ok' ? 'Fertigstellen' : 'Trotzdem fertigstellen'}
              <ArrowRight className="size-4" />
            </Button>
          ) : null}
          {step === 'done' ? (
            <Button onClick={onClose}>Schließen</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ step, hasOAuth }: { step: Step; hasOAuth: boolean }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'identify', label: 'Bezeichnung' },
    { id: 'configure', label: hasOAuth ? 'Verbinden' : 'Konfigurieren' },
    { id: 'test', label: 'Test' },
    { id: 'done', label: 'Fertig' },
  ];
  const activeIdx = steps.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1">
          <span
            className={cn(
              'inline-flex size-5 items-center justify-center rounded-full text-[10px] font-semibold',
              i < activeIdx ? 'bg-emerald-500 text-white' : i === activeIdx ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}
          >
            {i < activeIdx ? <CheckCircle2 className="size-3" /> : i + 1}
          </span>
          <span className={cn(i === activeIdx ? 'font-medium' : 'text-muted-foreground')}>{s.label}</span>
          {i < steps.length - 1 ? <ArrowRight className="mx-1 size-3 text-muted-foreground/50" /> : null}
        </div>
      ))}
    </div>
  );
}

function IdentifyStep({
  name, setName, address, setAddress, hint,
}: { name: string; setName: (v: string) => void; address: string; setAddress: (v: string) => void; hint?: string }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="wiz-name">Name</Label>
        <Input id="wiz-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Support-Postfach" autoFocus />
        <p className="text-xs text-muted-foreground">Wird als Channel-Bezeichnung in Listen angezeigt.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wiz-address">Adresse / Identifier (optional)</Label>
        <Input id="wiz-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="support@firma.de" />
      </div>
      {hint ? (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
          {hint}
        </p>
      ) : null}
    </>
  );
}

function ImapConfigure({
  cfg, setField, isEdit,
}: { cfg: Record<string, string>; setField: (k: string, v: string) => void; isEdit: boolean }) {
  return (
    <>
      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">IMAP (eingehend)</legend>
        <div className="grid grid-cols-[1fr_100px_120px] gap-2">
          <Input value={cfg.imapHost ?? ''} onChange={(e) => setField('imapHost', e.target.value)} placeholder="imap.firma.de" />
          <Input value={cfg.imapPort ?? '993'} onChange={(e) => setField('imapPort', e.target.value)} placeholder="Port" />
          <Select
            value={cfg.imapEnc === '' ? 'none' : (cfg.imapEnc ?? 'ssl')}
            onValueChange={(v) => setField('imapEnc', v === 'none' ? '' : v)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ssl">SSL</SelectItem>
              <SelectItem value="tls">TLS</SelectItem>
              <SelectItem value="none">keine</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input value={cfg.imapFolder ?? 'INBOX'} onChange={(e) => setField('imapFolder', e.target.value)} placeholder="Folder (INBOX)" />
      </fieldset>
      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">SMTP (ausgehend)</legend>
        <div className="grid grid-cols-[1fr_100px_120px] gap-2">
          <Input value={cfg.smtpHost ?? ''} onChange={(e) => setField('smtpHost', e.target.value)} placeholder="smtp.firma.de" />
          <Input value={cfg.smtpPort ?? '587'} onChange={(e) => setField('smtpPort', e.target.value)} placeholder="Port" />
          <Select
            value={cfg.smtpEnc === '' ? 'none' : (cfg.smtpEnc ?? 'tls')}
            onValueChange={(v) => setField('smtpEnc', v === 'none' ? '' : v)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ssl">SSL</SelectItem>
              <SelectItem value="tls">STARTTLS</SelectItem>
              <SelectItem value="none">keine</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input value={cfg.smtpFrom ?? ''} onChange={(e) => setField('smtpFrom', e.target.value)} placeholder="From-Adresse" />
      </fieldset>
      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Auth</legend>
        <Input value={cfg.username ?? ''} onChange={(e) => setField('username', e.target.value)} placeholder="Benutzername" />
        <Input
          type="password"
          value={cfg.password ?? ''}
          onChange={(e) => setField('password', e.target.value)}
          placeholder={isEdit ? 'Passwort (leer = unverändert)' : 'Passwort'}
          autoComplete="new-password"
        />
      </fieldset>
    </>
  );
}

function WebhookConfigure({ token }: { token: string }) {
  const { t } = useTranslation();
  const apiHost = window.location.origin.replace('worktide-web', 'api.worktide');
  const url = `${apiHost}/v1/inbound/webhooks/${token}`;
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Webhook-URL</legend>
      <p className="text-xs text-muted-foreground">
        Gib diese URL bei Deinem Sender (Zabbix, Slack, eigenes Skript) als Webhook-Ziel an.
        Der Token in der URL authentifiziert — behandle ihn wie ein Passwort.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded border bg-muted px-2 py-1 text-xs">{url}</code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(url);
            toast.success(t('toast.url_copied'));
          }}
        >
          <Copy className="size-3" />
          Kopieren
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Beispiel-curl zum Testen:
      </p>
      <pre className="overflow-x-auto rounded border bg-muted px-2 py-1 text-[11px]">
{`curl -X POST '${url}' \\
  -H 'Content-Type: application/json' \\
  -d '{"title":"Test","sender":"manual"}'`}
      </pre>
    </fieldset>
  );
}

function OAuthConfigure({
  providerLabel, connected, onConnect,
}: { providerLabel: string; connected: boolean; onConnect: () => void }) {
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">OAuth-Login</legend>
      <p className="text-xs text-muted-foreground">
        Klick startet die {providerLabel}-Anmeldung — kein App-Passwort nötig. Du landest nach
        der Zustimmung automatisch wieder hier.
      </p>
      {connected ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 className="mr-1 inline size-4" />
          Bereits verbunden.
        </div>
      ) : (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Noch nicht verbunden.
        </div>
      )}
      <Button type="button" variant="outline" className="w-full" onClick={onConnect}>
        <Link2 className="size-4" />
        {connected ? `Mit ${providerLabel} neu verbinden` : `Mit ${providerLabel} anmelden`}
      </Button>
    </fieldset>
  );
}

function TestStep({
  verdict, onRun, testing,
}: { verdict: TestVerdict | null; onRun: () => void; testing: boolean }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Verbindungs-Test prüft Auth + Erreichbarkeit, ohne Daten zu ziehen oder zu senden.
      </p>
      <Button onClick={onRun} disabled={testing} variant="outline" className="w-full">
        {testing ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
        Test starten
      </Button>
      {verdict ? (
        <div
          className={cn(
            'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
            verdict.status === 'ok' && 'border-emerald-300 bg-emerald-50 text-emerald-800',
            verdict.status === 'warning' && 'border-amber-300 bg-amber-50 text-amber-800',
            verdict.status === 'failed' && 'border-destructive/40 bg-destructive/10 text-destructive',
          )}
        >
          {verdict.status === 'ok' ? <CheckCircle2 className="size-4 shrink-0 mt-0.5" /> : <XCircle className="size-4 shrink-0 mt-0.5" />}
          <span>{verdict.message}</span>
        </div>
      ) : null}
    </div>
  );
}

function DoneStep({ label }: { label: string }) {
  return (
    <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-center text-sm text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
      <CheckCircle2 className="mx-auto size-8" />
      <p className="font-medium">{label}-Quelle ist aktiv.</p>
      <p className="text-xs">
        Neue Events erscheinen im Inbox-Stream sobald der Sync-Worker das nächste Mal läuft
        (typischerweise innerhalb 60 s).
      </p>
    </div>
  );
}

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function WebhookUrlBlock({ token, providerHint }: { token: string; providerHint: string }) {
  const { t } = useTranslation();
  const apiHost = window.location.origin.replace('worktide-web', 'api.worktide');
  const url = `${apiHost}/v1/inbound/entity-webhooks/${token}`;
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Push-URL (Webhook)
      </legend>
      <p className="text-xs text-muted-foreground">
        {providerHint} Klick auf Kopieren, dann im jeweiligen
        Admin-Backend als Webhook-URL eintragen.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded border bg-muted px-2 py-1 text-xs">{url}</code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(url);
            toast.success(t('toast.webhook_url_copied'));
          }}
        >
          <Copy className="size-3" />
          Kopieren
        </Button>
      </div>
    </fieldset>
  );
}

function RedmineConfigure({
  cfg, setField, isEdit,
}: { cfg: Record<string, string>; setField: (k: string, v: string) => void; isEdit: boolean }) {
  return (
    <>
      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Redmine-Server</legend>
        <Input
          value={cfg.baseUrl ?? ''}
          onChange={(e) => setField('baseUrl', e.target.value)}
          placeholder="https://projects.example.com"
        />
        <Input
          value={cfg.projectId ?? ''}
          onChange={(e) => setField('projectId', e.target.value)}
          placeholder="Redmine-Projekt-ID oder -Key (optional, leer = alle)"
        />
      </fieldset>
      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Filter (optional)</legend>
        <Input
          value={cfg.trackerId ?? ''}
          onChange={(e) => setField('trackerId', e.target.value)}
          placeholder="Tracker-ID (optional, leer = alle Tracker)"
        />
        <Input
          value={cfg.assignedToId ?? ''}
          onChange={(e) => setField('assignedToId', e.target.value)}
          placeholder="Zugewiesen an: me oder Benutzer-ID (optional)"
        />
        <p className="text-xs text-muted-foreground">
          Nur Tickets eines Trackers und/oder bestimmter Zuweisung importieren.
          „me" = der Benutzer des API-Keys. Tracker-ID findest Du in Redmine unter
          Administration → Tracker (in der URL).
        </p>
      </fieldset>
      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Synchronisation</legend>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={cfg.readOnly === '1'}
            onCheckedChange={(v) => setField('readOnly', v ? '1' : '')}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Nur lesen (read-only)</span>
            <span className="block text-xs text-muted-foreground">
              Tickets werden nur importiert. Änderungen in Worktide werden NICHT nach
              Redmine zurückgeschrieben. Später auf bidirektional umstellbar.
            </span>
          </span>
        </label>
      </fieldset>
      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">API-Key</legend>
        <Input
          type="password"
          value={cfg.apiKey ?? ''}
          onChange={(e) => setField('apiKey', e.target.value)}
          placeholder={isEdit ? 'API-Key (leer = unverändert)' : 'API-Key aus Redmine-Profil'}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">
          Profil → „API-Zugriffsschlüssel anzeigen". Wird X-Redmine-API-Key
          Header gesendet, nicht in URL (sicher in Access-Logs).
        </p>
      </fieldset>
      {cfg.webhookToken ? (
        <WebhookUrlBlock
          token={cfg.webhookToken}
          providerHint="Optional: installiere das redmine_webhook-Plugin und trage die folgende URL in Verwaltung → Einstellungen → Webhooks ein, damit Worktide live über Änderungen informiert wird (statt 60s-Pull)."
        />
      ) : null}
    </>
  );
}

function JiraConfigure({
  cfg, setField, isEdit,
}: { cfg: Record<string, string>; setField: (k: string, v: string) => void; isEdit: boolean }) {
  const apiVersion = cfg.jiraApiVersion ?? '2';
  return (
    <>
      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Jira-Server</legend>
        <Input
          value={cfg.baseUrl ?? ''}
          onChange={(e) => setField('baseUrl', e.target.value)}
          placeholder="https://jira.firma.de"
        />
        <div className="grid grid-cols-[150px_1fr] gap-2">
          <Select value={apiVersion} onValueChange={(v) => setField('jiraApiVersion', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="2">API v2 (Server / DC)</SelectItem>
              <SelectItem value="3">API v3 (Cloud)</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={cfg.projectKey ?? ''}
            onChange={(e) => setField('projectKey', e.target.value)}
            placeholder="Projekt-Key (LW, PROJ ...) — optional"
          />
        </div>
      </fieldset>
      {apiVersion === '2' ? (
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">PAT</legend>
          <Input
            type="password"
            value={cfg.jiraPat ?? ''}
            onChange={(e) => setField('jiraPat', e.target.value)}
            placeholder={isEdit ? 'PAT (leer = unverändert)' : 'Personal Access Token'}
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">
            Bei Jira Server/DC: Profil → Persönliche Zugangstokens → Token
            anlegen mit Scope "Read + Write Issues". Wird als
            Authorization: Bearer Header gesendet.
          </p>
        </fieldset>
      ) : (
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Cloud-Auth</legend>
          <Input
            value={cfg.jiraEmail ?? ''}
            onChange={(e) => setField('jiraEmail', e.target.value)}
            placeholder="Atlassian-Account-Email"
          />
          <Input
            type="password"
            value={cfg.jiraApiToken ?? ''}
            onChange={(e) => setField('jiraApiToken', e.target.value)}
            placeholder={isEdit ? 'API-Token (leer = unverändert)' : 'API-Token (id.atlassian.com → Security → Create API token)'}
            autoComplete="new-password"
          />
        </fieldset>
      )}
      {cfg.webhookToken ? (
        <WebhookUrlBlock
          token={cfg.webhookToken}
          providerHint="Trage die folgende URL in Jira → Administration → System → WebHooks ein und aktiviere die Events Issue Created / Updated / Deleted, damit Worktide live über Änderungen informiert wird (statt 60s-Pull)."
        />
      ) : null}
    </>
  );
}
