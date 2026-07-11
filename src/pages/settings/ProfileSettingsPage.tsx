import { useGetIdentity } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { languageLabel, resetI18nProfileCache } from '@/lib/languages';

import { SettingsLayout } from './SettingsLayout';

type ProfileSnapshot = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  roles: string[];
  lastLoginAt: string | null;
  // Preferred display language (a supported-locale code) or null = follow the
  // workspace / app default. `supportedLanguages` is the server's allow-list.
  preferredLanguage: string | null;
  supportedLanguages: string[];
};

// Radix Select has no concept of an empty value, so "no preference" gets a
// sentinel that maps to null on the wire.
const AUTO_LANGUAGE = '__auto__';

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
  const { t } = useTranslation();
  return (
    <SettingsLayout>
      <div>
        <h2 className="text-2xl">{t('profile.heading')}</h2>
        <p className="text-sm text-muted-foreground">{t('profile.subtitle')}</p>
      </div>
      <ProfileForm />
      <PasswordForm />
    </SettingsLayout>
  );
}

function ProfileForm() {
  const { t } = useTranslation();
  const { refetch: refetchIdentity } = useGetIdentity();
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<string | null>(null);
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
        setPreferredLanguage(data.preferredLanguage ?? null);
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
        preferredLanguage,
      });
      setProfile(data);
      setPreferredLanguage(data.preferredLanguage ?? null);
      // The active-locale + supported-languages cache keys off the profile;
      // drop it so translatable content re-resolves in the new language.
      resetI18nProfileCache();
      // Identity is cached by Refine — invalidate so the sidebar avatar
      // initials and topbar greeting pick up the new name immediately.
      await refetchIdentity?.();
      toast.success(t('toast.profile_saved'));
    } catch (err) {
      console.warn('ProfileSettingsPage: save failed', err);
      toast.error(t('toast.could_not_save'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.personal_data')}</CardTitle>
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
          <p className="text-sm text-destructive">{t('profile.load_failed')}</p>
        </CardContent>
      </Card>
    );
  }

  const dirty =
    firstName !== (profile.firstName ?? '') ||
    lastName !== (profile.lastName ?? '') ||
    preferredLanguage !== (profile.preferredLanguage ?? null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.personal_data')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">{t('profile.first_name')}</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">{t('profile.last_name')}</Label>
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
            {t('profile.email_change_note')}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="preferredLanguage">{t('profile.language')}</Label>
          <Select
            value={preferredLanguage ?? AUTO_LANGUAGE}
            onValueChange={(value) =>
              setPreferredLanguage(value === AUTO_LANGUAGE ? null : value)
            }
          >
            <SelectTrigger id="preferredLanguage" className="sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO_LANGUAGE}>{t('profile.auto_language')}</SelectItem>
              {profile.supportedLanguages.map((code) => (
                <SelectItem key={code} value={code}>
                  {languageLabel(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('profile.language_hint')}
          </p>
        </div>
        <div>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || !dirty}>
            {saving ? t('profile.saving') : t('action.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordForm() {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordRepeat, setNewPasswordRepeat] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChange = async () => {
    if (newPassword !== newPasswordRepeat) {
      toast.error(t('toast.passwords_mismatch'));
      return;
    }
    if (newPassword.length < 8) {
      toast.error(t('toast.min_8_chars'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/me/password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordRepeat('');
      toast.success(t('toast.password_changed'));
    } catch (err) {
      const message =
        ((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail) ??
        t('profile.password_change_failed');
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.change_password')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="currentPassword">{t('profile.current_password')}</Label>
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
            <Label htmlFor="newPassword">{t('profile.new_password')}</Label>
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
            <Label htmlFor="newPasswordRepeat">{t('profile.repeat_password')}</Label>
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
            {saving ? t('profile.saving') : t('profile.change_password')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
