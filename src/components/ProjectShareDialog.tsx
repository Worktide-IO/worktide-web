import { Mail, Send, Share2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type ShareInvitation = {
  '@id'?: string;
  id?: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  sendCount?: number;
  expiresAt?: string;
  createdAt?: string;
};

// The collaboration role the target workspace gets on the shared project.
// Mirrors ProjectMemberRole (manager | contributor | viewer) on the backend.
const ROLES = [
  { value: 'contributor', label: 'Mitarbeit (bearbeiten)' },
  { value: 'manager', label: 'Verwaltung (voller Zugriff)' },
  { value: 'viewer', label: 'Betrachten (nur lesen)' },
];

const STATUS_TONE: Record<ShareInvitation['status'], string> = {
  pending: 'text-amber-700 bg-amber-100 border-amber-200',
  accepted: 'text-green-700 bg-green-100 border-green-200',
  expired: 'text-slate-500 bg-slate-100 border-slate-200',
  revoked: 'text-slate-500 bg-slate-100 border-slate-200',
};
const STATUS_LABEL: Record<ShareInvitation['status'], string> = {
  pending: 'Ausstehend',
  accepted: 'Angenommen',
  expired: 'Abgelaufen',
  revoked: 'Zurückgezogen',
};
const ROLE_LABEL: Record<string, string> = {
  contributor: 'Mitarbeit',
  manager: 'Verwaltung',
  viewer: 'Betrachten',
};

function readCollection(data: unknown): ShareInvitation[] {
  const doc = data as Record<string, unknown>;
  return (doc?.['member'] ?? doc?.['hydra:member'] ?? []) as ShareInvitation[];
}

type Props = {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Cross-workspace project sharing dialog: a project manager/admin invites an
 * external collaborator by email + role. The backend mints an accept token and
 * mails a magic link; on accept a ProjectShare links the project into the
 * invitee's own workspace so their team collaborates without joining ours.
 *
 * Scoped to a single project — the pending list is filtered by `project`, and
 * `workspace` is the active (host) workspace A, matching the project's owner.
 */
export function ProjectShareDialog({ projectId, projectName, open, onOpenChange }: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('contributor');
  const [invitations, setInvitations] = useState<ShareInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const projectIri = `/v1/projects/${projectId}`;

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/project_share_invitations', {
        params: { project: projectIri, 'order[createdAt]': 'desc' },
      });
      setInvitations(readCollection(data));
    } catch {
      /* keep prior list on transient errors */
    } finally {
      setLoading(false);
    }
  }, [projectIri]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

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
      await api.post('/project_share_invitations', {
        email: trimmed,
        role,
        project: projectIri,
        workspace: `/v1/workspaces/${workspaceId}`,
      });
      toast.success(`Freigabe-Einladung an ${trimmed} versendet.`);
      setEmail('');
      void load();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Einladung konnte nicht erstellt werden.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (inv: ShareInvitation) => {
    if (!inv.id) return;
    try {
      await api.delete(`/project_share_invitations/${inv.id}`);
      toast.success('Einladung zurückgezogen.');
      void load();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Zurückziehen fehlgeschlagen.');
    }
  };

  // Accepted shares surface elsewhere (the project shows up in the partner
  // workspace); here we only track outstanding invitations.
  const shown = useMemo(() => invitations.filter((i) => i.status !== 'accepted'), [invitations]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-4" /> Projekt teilen
          </DialogTitle>
          <DialogDescription>
            Laden Sie einen externen Workspace per E-Mail ein, an „{projectName}“ mitzuarbeiten.
            Die Einladung wird von einer Person im anderen Workspace angenommen.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={invite} className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Mail className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@partner.de"
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
                {r.label}
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
              <li key={inv['@id'] ?? inv.email} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{inv.email}</span>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {ROLE_LABEL[inv.role] ?? inv.role}
                </span>
                <Badge variant="outline" className={cn('text-[10px]', STATUS_TONE[inv.status])}>
                  {STATUS_LABEL[inv.status]}
                </Badge>
                {inv.status === 'pending' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke(inv)}
                    title="Zurückziehen"
                  >
                    <X className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : !loading ? (
          <p className="text-sm text-muted-foreground">Noch keine offenen Einladungen.</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
