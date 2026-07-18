import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

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
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Props = { contactIri: string };

type EmailRow = { '@id': string; address: string; primary: boolean; verified: boolean; label?: string | null };
type PhoneRow = { '@id': string; number: string; category: string; primary: boolean; label?: string | null };
type SocialRow = { '@id': string; platform: string; url: string; handle?: string | null; label?: string | null };

const PHONE_CATEGORIES = ['business', 'private', 'mobile', 'fax'] as const;
const SOCIAL_PLATFORMS = [
  'facebook', 'instagram', 'tiktok', 'linkedin', 'x', 'youtube', 'xing', 'github', 'mastodon', 'website', 'other',
] as const;

function members<T>(data: unknown): T[] {
  const d = data as Record<string, unknown>;
  return ((d?.member ?? d?.['hydra:member'] ?? []) as T[]) ?? [];
}

/**
 * Manage a contact's multiple email addresses, phone numbers (categorised) and
 * social profiles against the child resources (/contact_emails, /contact_phones,
 * /social_profiles). Edit-mode only — the contact must already exist.
 */
export function ContactChannelsCard({ contactIri }: Props) {
  const { t } = useTranslation();
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [phones, setPhones] = useState<PhoneRow[]>([]);
  const [socials, setSocials] = useState<SocialRow[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const q = `?contact=${encodeURIComponent(contactIri)}`;
    const [e, p, s] = await Promise.all([
      api.get(`/contact_emails${q}`),
      api.get(`/contact_phones${q}`),
      api.get(`/social_profiles${q}`),
    ]);
    setEmails(members<EmailRow>(e.data));
    setPhones(members<PhoneRow>(p.data));
    setSocials(members<SocialRow>(s.data));
  }, [contactIri]);

  useEffect(() => { void reload(); }, [reload]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await reload(); } catch { toast.error(t('channels.failed')); } finally { setBusy(false); }
  };

  const patch = (iri: string, body: Record<string, unknown>) =>
    api.patch(iri, body, { headers: { 'Content-Type': 'application/merge-patch+json' } });

  // add-forms
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPhoneCat, setNewPhoneCat] = useState<string>('business');
  const [newSocialPlatform, setNewSocialPlatform] = useState<string>('linkedin');
  const [newSocialUrl, setNewSocialUrl] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t('channels.title')}
          {busy ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Emails */}
        <section className="space-y-2">
          <Label>{t('channels.emails')}</Label>
          {emails.map((row) => (
            <div key={row['@id']} className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm">{row.address}</span>
              <PrimaryButton active={row.primary} onClick={() => run(() => patch(row['@id'], { primary: true }))} />
              <DeleteButton onClick={() => run(() => api.delete(row['@id']))} />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input type="email" placeholder="name@firma.de" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <AddButton
              disabled={!newEmail.includes('@')}
              onClick={() => run(async () => { await api.post('/contact_emails', { contact: contactIri, address: newEmail, primary: emails.length === 0 }); setNewEmail(''); })}
            />
          </div>
        </section>

        {/* Phones */}
        <section className="space-y-2">
          <Label>{t('channels.phones')}</Label>
          {phones.map((row) => (
            <div key={row['@id']} className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm">{row.number}</span>
              <span className="text-xs text-muted-foreground">{t(`phone_category.${row.category}`)}</span>
              <PrimaryButton active={row.primary} onClick={() => run(() => patch(row['@id'], { primary: true }))} />
              <DeleteButton onClick={() => run(() => api.delete(row['@id']))} />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input placeholder="+49 …" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            <Select value={newPhoneCat} onValueChange={setNewPhoneCat}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PHONE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`phone_category.${c}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <AddButton
              disabled={newPhone.trim() === ''}
              onClick={() => run(async () => { await api.post('/contact_phones', { contact: contactIri, number: newPhone, category: newPhoneCat, primary: phones.filter((p) => p.category === newPhoneCat).length === 0 }); setNewPhone(''); })}
            />
          </div>
        </section>

        {/* Social */}
        <section className="space-y-2">
          <Label>{t('channels.social')}</Label>
          {socials.map((row) => (
            <div key={row['@id']} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{t(`social_platform.${row.platform}`)}</span>
              <a href={row.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-sm text-primary hover:underline">
                {row.handle || row.url}
              </a>
              <DeleteButton onClick={() => run(() => api.delete(row['@id']))} />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Select value={newSocialPlatform} onValueChange={setNewSocialPlatform}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOCIAL_PLATFORMS.map((p) => <SelectItem key={p} value={p}>{t(`social_platform.${p}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="https://…" value={newSocialUrl} onChange={(e) => setNewSocialUrl(e.target.value)} />
            <AddButton
              disabled={!/^https?:\/\//.test(newSocialUrl)}
              onClick={() => run(async () => { await api.post('/social_profiles', { contact: contactIri, platform: newSocialPlatform, url: newSocialUrl }); setNewSocialUrl(''); })}
            />
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function PrimaryButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button type="button" variant="ghost" size="icon" onClick={onClick} title={t('channels.set_primary')} aria-label={t('channels.set_primary')}>
      <Star className={cn('size-3.5', active ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
    </Button>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" onClick={onClick}>
      <Trash2 className="size-3.5 text-muted-foreground" />
    </Button>
  );
}

function AddButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="outline" size="icon" onClick={onClick} disabled={disabled}>
      <Plus className="size-3.5" />
    </Button>
  );
}
