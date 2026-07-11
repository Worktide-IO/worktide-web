import { useGetIdentity, useInvalidate } from '@refinedev/core';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, Loader2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import type { UserJsonld } from '@/api/types/user/Jsonld';
import type { WorkspaceMemberJsonld } from '@/api/types/workspaceMember/Jsonld';
import { userInitials } from '@/hooks/useUserDirectory';
import { api } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { AuthedAvatar } from '@/components/AuthedAvatar';
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

/** Value the "reassign to" select uses to mean "leave the tasks unassigned". */
const UNASSIGN = '__unassign__';

type Candidate = { userId: string; label: string };

type Props = {
  member: Row<WorkspaceMemberJsonld>;
  user: Row<UserJsonld> | null;
  /** Other active members this member's tasks can be handed over to on removal. */
  reassignCandidates: Candidate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Admin edit of a workspace member. Name + email go to the dedicated
 * PATCH /v1/workspace_members/{id}/profile (writes the linked User); role +
 * active flag are a merge-patch on the member itself. Removal opens a handover
 * step: the member's assigned tasks are reassigned to another member (or cleared)
 * before the membership is deleted, so no task is left orphaned. You can't
 * deactivate or remove your own membership (self-lockout guard).
 */
export function MemberEditDialog({ member, user, reassignCandidates, open, onOpenChange }: Props) {
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  const { data: identity } = useGetIdentity<{ id?: string }>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // The parent mounts this dialog fresh per open, so props-initialised state is enough.
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState((member.role as string | undefined) ?? 'member');
  const [isActive, setIsActive] = useState((member as { isActive?: boolean }).isActive ?? true);
  const [busy, setBusy] = useState(false);

  // Removal / handover sub-view.
  const [removeMode, setRemoveMode] = useState(false);
  const [assignedCount, setAssignedCount] = useState<number | null>(null);
  const [reassignTo, setReassignTo] = useState(reassignCandidates[0]?.userId ?? UNASSIGN);

  const memberId = member.id;
  const isSelf = Boolean(
    identity?.id && typeof member.user === 'string' && member.user.endsWith(`/${identity.id}`),
  );

  const refresh = () => {
    void invalidate({ resource: 'workspace_members', invalidates: ['list'] });
    void invalidate({ resource: 'users', invalidates: ['list'] });
    void invalidate({ resource: 'tasks', invalidates: ['list'] });
  };

  const save = async () => {
    if (!memberId) return;
    setBusy(true);
    try {
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

  const uploadAvatar = async (file: File) => {
    if (!memberId) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      // Let the browser set multipart/form-data + boundary (the api instance
      // otherwise defaults Content-Type to application/ld+json).
      await api.post(`/workspace_members/${memberId}/avatar`, form, {
        headers: { 'Content-Type': undefined },
      });
      toast.success('Foto aktualisiert.');
      void queryClient.invalidateQueries({ queryKey: ['member-avatar', memberId] });
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Foto konnte nicht hochgeladen werden.');
    } finally {
      setUploading(false);
    }
  };

  const openRemove = async () => {
    if (!memberId) return;
    setRemoveMode(true);
    setAssignedCount(null);
    try {
      const { data } = await api.get<{ assignedTaskCount?: number }>(
        `/workspace_members/${memberId}/assignments`,
      );
      setAssignedCount(data.assignedTaskCount ?? 0);
    } catch {
      setAssignedCount(0); // fall back to 0 — removal still works, just no count shown
    }
  };

  const remove = async () => {
    if (!memberId) return;
    setBusy(true);
    try {
      await api.post(`/workspace_members/${memberId}/remove`, {
        reassignTo: reassignTo === UNASSIGN ? null : reassignTo,
      });
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
        {removeMode ? (
          <>
            <DialogHeader>
              <DialogTitle>Mitglied entfernen</DialogTitle>
              <DialogDescription>
                {user?.firstName || user?.lastName
                  ? `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()
                  : (user?.email ?? 'Dieses Mitglied')}{' '}
                aus dem Workspace entfernen.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {assignedCount === null ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Zugewiesene Aufgaben werden geprüft …
                </div>
              ) : assignedCount === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Diesem Mitglied sind keine Aufgaben zugewiesen.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm">
                    <span className="font-medium">{assignedCount}</span>{' '}
                    {assignedCount === 1 ? 'zugewiesene Aufgabe' : 'zugewiesene Aufgaben'}. Übertragen
                    an:
                  </p>
                  <Select value={reassignTo} onValueChange={setReassignTo}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {reassignCandidates.map((c) => (
                        <SelectItem key={c.userId} value={c.userId}>
                          {c.label}
                        </SelectItem>
                      ))}
                      <SelectItem value={UNASSIGN}>— Nicht zuweisen —</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="ghost" onClick={() => setRemoveMode(false)} disabled={busy}>
                <ArrowLeft className="size-4" /> Zurück
              </Button>
              <Button variant="destructive" onClick={remove} disabled={busy || assignedCount === null}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Entfernen
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Mitglied bearbeiten</DialogTitle>
              <DialogDescription>Name, E-Mail, Rolle und Zugang dieses Mitglieds verwalten.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <AuthedAvatar
                  memberId={memberId}
                  fallback={user ? userInitials(user) : '?'}
                  size="lg"
                  className="shrink-0"
                />
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadAvatar(f);
                    e.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                  Foto ändern
                </Button>
              </div>
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
                    {isActive
                      ? 'Hat Zugriff auf diesen Workspace.'
                      : 'Gesperrt — kein Zugriff auf diesen Workspace.'}
                  </p>
                </div>
                <Switch id="mem-active" checked={isActive} onCheckedChange={setIsActive} disabled={isSelf} />
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
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={openRemove}
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
