import { useGetIdentity, useInvalidate } from '@refinedev/core';
import { Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { UserJsonld } from '@/api/types/user/Jsonld';
import type { WorkspaceMemberJsonld } from '@/api/types/workspaceMember/Jsonld';
import { api } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'guest', label: 'Gast' },
];

type Props = {
  member: Row<WorkspaceMemberJsonld>;
  user: Row<UserJsonld> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Admin edit of a workspace member. Name + email go to the dedicated
 * PATCH /v1/workspace_members/{id}/profile (writes the linked User); role +
 * active flag are a merge-patch on the member itself; removal is a DELETE.
 * You can't deactivate or remove your own membership (self-lockout guard).
 */
export function MemberEditDialog({ member, user, open, onOpenChange }: Props) {
  const invalidate = useInvalidate();
  const { data: identity } = useGetIdentity<{ id?: string }>();

  // The parent mounts this dialog fresh per open ({editing ? <…/> : null}), so
  // initialising from props is enough — no reset effect needed.
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState((member.role as string | undefined) ?? 'member');
  const [isActive, setIsActive] = useState((member as { isActive?: boolean }).isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const memberId = member.id;
  const isSelf = Boolean(
    identity?.id && typeof member.user === 'string' && member.user.endsWith(`/${identity.id}`),
  );

  const refresh = () => {
    void invalidate({ resource: 'workspace_members', invalidates: ['list'] });
    void invalidate({ resource: 'users', invalidates: ['list'] });
  };

  const save = async () => {
    if (!memberId) return;
    setBusy(true);
    try {
      // 1) Profile (name / email) — dedicated admin endpoint on the User.
      const profileChanged =
        firstName !== (user?.firstName ?? '') ||
        lastName !== (user?.lastName ?? '') ||
        email.trim() !== (user?.email ?? '');
      if (profileChanged) {
        await api.patch(`/workspace_members/${memberId}/profile`, {
          firstName,
          lastName,
          email: email.trim(),
        });
      }

      // 2) Membership (role / active) — merge-patch on the member.
      const membershipPatch: Record<string, unknown> = {};
      if (role !== ((member.role as string | undefined) ?? 'member')) membershipPatch.role = role;
      if (isActive !== ((member as { isActive?: boolean }).isActive ?? true)) {
        membershipPatch.isActive = isActive;
      }
      if (Object.keys(membershipPatch).length > 0) {
        await api.patch(`/workspace_members/${memberId}`, membershipPatch, {
          headers: { 'Content-Type': 'application/merge-patch+json' },
        });
      }

      toast.success('Mitglied aktualisiert.');
      refresh();
      onOpenChange(false);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Änderungen konnten nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!memberId) return;
    setBusy(true);
    try {
      await api.delete(`/workspace_members/${memberId}`);
      toast.success('Mitglied entfernt.');
      refresh();
      onOpenChange(false);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Mitglied konnte nicht entfernt werden.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mitglied bearbeiten</DialogTitle>
          <DialogDescription>Name, E-Mail, Rolle und Zugang dieses Mitglieds verwalten.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mem-first">Vorname</Label>
              <Input id="mem-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mem-last">Nachname</Label>
              <Input id="mem-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mem-email">E-Mail</Label>
            <Input id="mem-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="text-xs text-muted-foreground">E-Mail ist der Login — muss eindeutig sein.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Rolle</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="mem-active">Aktiv</Label>
              <p className="text-xs text-muted-foreground">
                {isActive ? 'Hat Zugriff auf diesen Workspace.' : 'Gesperrt — kein Zugriff auf diesen Workspace.'}
              </p>
            </div>
            <Switch
              id="mem-active"
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={isSelf}
            />
          </div>
          {isSelf ? (
            <p className="text-xs text-muted-foreground">
              Du kannst deine eigene Mitgliedschaft nicht sperren oder entfernen.
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {isSelf ? (
            <span />
          ) : confirmDelete ? (
            <Button variant="destructive" size="sm" onClick={remove} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Wirklich entfernen?
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              <Trash2 className="size-4" /> Entfernen
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Abbrechen
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Speichern
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
