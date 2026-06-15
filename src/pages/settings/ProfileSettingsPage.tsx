import { useGetIdentity } from '@refinedev/core';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

import { SettingsLayout } from './SettingsLayout';

type ProfileSnapshot = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  roles: string[];
  lastLoginAt: string | null;
};

/**
 * `/settings/profile` — user-self profile editor.
 *
 * Hits `/v1/me/profile` (GET + PATCH) and `/v1/me/password` (POST) rather
 * than PATCHing `/v1/users/{id}` so the URL is the authorisation: the
 * backend won't let you edit anyone else's profile through these paths,
 * irrespective of voter config.
 *
 * Email is shown read-only — verification flow + handling of the
 * security ramifications (existing JWTs, sessions, refresh-tokens) is its
 * own story and lives outside this MVP.
 */
export function ProfileSettingsPage() {
  return (
    <SettingsLayout>
      <div>
        <h2 className="text-2xl">Profil</h2>
        <p className="text-sm text-muted-foreground">Deine Account-Daten und Sicherheit.</p>
      </div>
      <ProfileForm />
      <PasswordForm />
    </SettingsLayout>
  );
}

function ProfileForm() {
  const { refetch: refetchIdentity } = useGetIdentity();
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await api.get<ProfileSnapshot>('/me/profile');
        if (cancelled) return;
        setProfile(data);
        setFirstName(data.firstName ?? '');
        setLastName(data.lastName ?? '');
      } catch (err) {
        console.warn('ProfileSettingsPage: load failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch<ProfileSnapshot>('/me/profile', {
        firstName,
        lastName,
      });
      setProfile(data);
      // Identity is cached by Refine — invalidate so the sidebar avatar
      // initials and topbar greeting pick up the new name immediately.
      await refetchIdentity?.();
      toast.success('Profil gespeichert.');
    } catch (err) {
      console.warn('ProfileSettingsPage: save failed', err);
      toast.error('Konnte nicht speichern.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Persönliche Daten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-40" />
        </CardContent>
      </Card>
    );
  }
  if (!profile) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-destructive">Profil konnte nicht geladen werden.</p>
        </CardContent>
      </Card>
    );
  }

  const dirty = firstName !== (profile.firstName ?? '') || lastName !== (profile.lastName ?? '');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Persönliche Daten</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">Vorname</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Nachname</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={80}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={profile.email} readOnly disabled />
          <p className="text-xs text-muted-foreground">
            Email-Wechsel ist noch nicht implementiert.
          </p>
        </div>
        <div>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || !dirty}>
            {saving ? 'Speichere…' : 'Speichern'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordRepeat, setNewPasswordRepeat] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChange = async () => {
    if (newPassword !== newPasswordRepeat) {
      toast.error('Die neuen Passwörter stimmen nicht überein.');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Mindestens 8 Zeichen.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/me/password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordRepeat('');
      toast.success('Passwort geändert.');
    } catch (err) {
      const message =
        ((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail) ??
        'Passwort konnte nicht geändert werden.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passwort ändern</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="currentPassword">Aktuelles Passwort</Label>
          <Input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">Neues Passwort</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPasswordRepeat">Wiederholen</Label>
            <Input
              id="newPasswordRepeat"
              type="password"
              value={newPasswordRepeat}
              onChange={(e) => setNewPasswordRepeat(e.target.value)}
              autoComplete="new-password"
              minLength={8}
            />
          </div>
        </div>
        <div>
          <Button
            type="button"
            onClick={() => void handleChange()}
            disabled={saving || !currentPassword || !newPassword}
          >
            {saving ? 'Speichere…' : 'Passwort ändern'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
