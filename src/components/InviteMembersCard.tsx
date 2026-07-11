import { Mail, RefreshCw, Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Invitation = {
  '@id'?: string;
  id?: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  sentAt?: string | null;
  sendCount?: number;
  expiresAt?: string;
  createdAt?: string;
};

const ROLES = [
  { value: 'member', label: 'team_role.member' },
  { value: 'admin', label: 'team_role.admin' },
  { value: 'guest', label: 'team_role.guest' },
];

const STATUS_TONE: Record<Invitation['status'], string> = {
  pending: 'text-amber-700 bg-amber-100 border-amber-200',
  accepted: 'text-green-700 bg-green-100 border-green-200',
  expired: 'text-slate-500 bg-slate-100 border-slate-200',
  revoked: 'text-slate-500 bg-slate-100 border-slate-200',
};
const STATUS_LABEL: Record<Invitation['status'], string> = {
  pending: 'invitation_status.pending',
  accepted: 'invitation_status.accepted',
  expired: 'invitation_status.expired',
  revoked: 'invitation_status.revoked',
};

function readCollection(data: unknown): Invitation[] {
  const doc = data as Record<string, unknown>;
  return (doc?.['member'] ?? doc?.['hydra:member'] ?? []) as Invitation[];
}

/**
 * Workspace-invitation panel: invite by email + role, then track each
 * invitation's status. The backend auto-sends a branded email on create;
 * "Erneut senden" re-dispatches (and refreshes the expiry) for pending ones.
 * All calls are workspace-scoped via the X-Workspace-Id header.
 */
export function InviteMembersCard() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/workspace_invitations', {
        params: { 'order[createdAt]': 'desc' },
      });
      setInvitations(readCollection(data));
    } catch {
      /* keep prior list on transient errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    const workspaceId =
      typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    if (!workspaceId) {
      toast.error('Kein aktiver Workspace.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/workspace_invitations', {
        email: trimmed,
        role,
        workspace: `/v1/workspaces/${workspaceId}`,
      });
      toast.success(`Einladung an ${trimmed} versendet.`);
      setEmail('');
      void load();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Einladung konnte nicht erstellt werden.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async (inv: Invitation) => {
    if (!inv.id) return;
    try {
      await api.post(`/workspace_invitations/${inv.id}/resend`);
      toast.success(`Einladung an ${inv.email} erneut versendet.`);
      void load();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Erneutes Senden fehlgeschlagen.');
    }
  };

  const revoke = async (inv: Invitation) => {
    if (!inv.id) return;
    try {
      await api.delete(`/workspace_invitations/${inv.id}`);
      toast.success('Einladung zurückgezogen.');
      void load();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Zurückziehen fehlgeschlagen.');
    }
  };

  const shown = useMemo(
    // Hide accepted ones — those already appear as members in the grid below.
    () => invitations.filter((i) => i.status !== 'accepted'),
    [invitations],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Personen einladen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={invite} className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Mail className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@firma.de"
              className="pl-8"
              autoComplete="off"
            />
          </div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {t(r.label)}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={busy || !email.trim()}>
            <Send className="size-4" />
            Einladen
          </Button>
        </form>

        {!loading && shown.length > 0 ? (
          <ul className="divide-y rounded-md border">
            {shown.map((inv) => (
              <li
                key={inv['@id'] ?? inv.email}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{inv.email}</span>
                <Badge variant="outline" className={cn('text-[10px]', STATUS_TONE[inv.status])}>
                  {t(STATUS_LABEL[inv.status])}
                </Badge>
                {inv.sendCount ? (
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {inv.sendCount}× gesendet
                  </span>
                ) : null}
                {inv.status === 'pending' ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => resend(inv)}
                      title="Erneut senden"
                    >
                      <RefreshCw className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => revoke(inv)}
                      title="Zurückziehen"
                    >
                      <X className="size-4" />
                    </Button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
