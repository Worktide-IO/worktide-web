import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';

type Props = {
  /** 'contact' or 'customer' — which owner FK to set on the profile. */
  owner: 'contact' | 'customer';
  ownerIri: string;
};

type SocialRow = { '@id': string; platform: string; url: string; handle?: string | null };

const SOCIAL_PLATFORMS = [
  'facebook', 'instagram', 'tiktok', 'linkedin', 'x', 'youtube', 'xing', 'github', 'mastodon', 'website', 'other',
] as const;

function members(data: unknown): SocialRow[] {
  const d = data as Record<string, unknown>;
  return ((d?.member ?? d?.['hydra:member'] ?? []) as SocialRow[]) ?? [];
}

/** Manage the social/web profiles of a contact or customer (/social_profiles). */
export function SocialProfilesCard({ owner, ownerIri }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<SocialRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState<string>('linkedin');
  const [url, setUrl] = useState('');

  const reload = useCallback(async () => {
    const res = await api.get(`/social_profiles?${owner}=${encodeURIComponent(ownerIri)}`);
    setRows(members(res.data));
  }, [owner, ownerIri]);

  useEffect(() => { void reload(); }, [reload]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await reload(); } catch { toast.error(t('channels.failed')); } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t('channels.social')}
          {busy ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <div key={row['@id']} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs text-muted-foreground">{t(`social_platform.${row.platform}`)}</span>
            <a href={row.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-sm text-primary hover:underline">
              {row.handle || row.url}
            </a>
            <Button type="button" variant="ghost" size="icon" onClick={() => run(() => api.delete(row['@id']))}>
              <Trash2 className="size-3.5 text-muted-foreground" />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOCIAL_PLATFORMS.map((p) => <SelectItem key={p} value={p}>{t(`social_platform.${p}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={!/^https?:\/\//.test(url)}
            onClick={() => run(async () => { await api.post('/social_profiles', { [owner]: ownerIri, platform, url }); setUrl(''); })}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
