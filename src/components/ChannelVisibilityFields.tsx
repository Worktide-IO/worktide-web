import { useGetIdentity } from '@refinedev/core';
import { Lock, Users } from 'lucide-react';
import { useEffect } from 'react';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useUserDirectory, userDisplayName } from '@/hooks/useUserDirectory';
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole';

/** Value shape the form fields control: mirrors the Channel API fields. */
export type ChannelVisibility = { isShared: boolean; ownerUser: string | null };

/**
 * Team-vs-personal visibility fields for a Channel (mailbox / source).
 *
 * - Admins/owners toggle between a shared team channel and a personal one,
 *   and — for a personal one — pick which user owns it.
 * - Plain members may only create personal channels owned by themselves, so
 *   the control collapses to a read-only hint and self-owns the channel.
 *
 * Enforcement is server-side (ChannelVoter); this is UX guidance only.
 */
export function ChannelVisibilityFields({
  value,
  onChange,
}: {
  value: ChannelVisibility;
  onChange: (v: ChannelVisibility) => void;
}) {
  const { isAdmin, isLoading } = useWorkspaceRole();
  const { data: identity } = useGetIdentity<{ id?: string }>();
  const { users } = useUserDirectory();
  const selfIri = identity?.id ? `/v1/users/${identity.id}` : null;

  // Non-admins can only own their own personal mailbox — force that state
  // once the role resolves (backend rejects anything else anyway).
  useEffect(() => {
    if (isLoading || isAdmin) return;
    if (value.isShared || (selfIri && value.ownerUser !== selfIri)) {
      onChange({ isShared: false, ownerUser: selfIri });
    }
  }, [isAdmin, isLoading, selfIri, value.isShared, value.ownerUser, onChange]);

  if (!isLoading && !isAdmin) {
    return (
      <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Persönliches Postfach — nur für Dich (und Workspace-Admins) sichtbar.
          Geteilte Team-Kanäle können nur Admins anlegen.
        </span>
      </div>
    );
  }

  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Sichtbarkeit
      </legend>
      <label className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm">
          <Users className="size-4 text-muted-foreground" />
          {value.isShared ? 'Team-Kanal (ganzes Workspace)' : 'Persönliches Postfach'}
        </span>
        <Switch
          checked={value.isShared}
          onCheckedChange={(checked) =>
            onChange({ isShared: checked, ownerUser: checked ? null : (value.ownerUser ?? selfIri) })
          }
        />
      </label>
      <p className="text-xs text-muted-foreground">
        {value.isShared
          ? 'Alle internen Mitglieder sehen und nutzen diesen Kanal.'
          : 'Nur der zugewiesene Besitzer (und Admins) sehen diesen Kanal.'}
      </p>

      {!value.isShared ? (
        <div className="space-y-1.5 pt-1">
          <Label htmlFor="channel-owner">Besitzer</Label>
          <Select
            value={value.ownerUser ?? selfIri ?? undefined}
            onValueChange={(iri) => onChange({ isShared: false, ownerUser: iri })}
          >
            <SelectTrigger id="channel-owner">
              <SelectValue placeholder="Benutzer wählen" />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u['@id']} value={u['@id'] ?? ''}>
                  {userDisplayName(u)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </fieldset>
  );
}
