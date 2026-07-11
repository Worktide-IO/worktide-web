import { useInvalidate, useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { Activity, CheckCircle2, Loader2, Plug, Power, Trash2, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { ChannelJsonld } from '@/api/types/channel/Jsonld';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

import { CATEGORY_ICON, CATEGORY_LABEL, findSourceType, SOURCE_CATALOG, type SourceCategory } from './catalog';
import { SourceWizard } from './SourceWizard';

const CATEGORIES: SourceCategory[] = ['mail', 'ticketing', 'chat', 'monitoring', 'webhook', 'voice'];

/**
 * Top-level Quellen-Page. Two-pane layout:
 *
 *   Left  — Category-grouped tile catalog. Click a tile → wizard.
 *   Right — Active sources for this workspace + their sync state.
 *
 * Built on the same /v1/channels API the WorkspaceChannelsCard uses,
 * just a more discoverable Top-Level UX. The settings card stays for
 * admins who land there expecting it, but new users hit /sources.
 */
export function SourcesPage() {
  const [wizardCode, setWizardCode] = useState<string | null>(null);
  const [wizardChannelId, setWizardChannelId] = useState<string | null>(null);

  const invalidate = useInvalidate();

  // Sync state (lastSyncedAt / lastSyncError) is updated by the backend
  // scheduler in the background, so an open overview would otherwise show stale
  // status forever. Refetch when the tab regains focus and on a slow interval so
  // a source that just started (or stopped) working updates on its own.
  const { result, query } = useList<Row<ChannelJsonld>>({
    resource: 'channels',
    pagination: { mode: 'off' },
    sorters: [{ field: 'name', order: 'asc' }],
    queryOptions: {
      refetchOnWindowFocus: true,
      refetchInterval: 30_000,
    },
  });
  const channels = result?.data ?? [];

  const tilesByCategory = useMemo(() => {
    const map: Record<SourceCategory, typeof SOURCE_CATALOG> = {
      mail: [], chat: [], monitoring: [], webhook: [], voice: [], ai: [], ticketing: [],
    };
    for (const t of SOURCE_CATALOG) {
      map[t.category].push(t);
    }
    return map;
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl flex items-center gap-2">
          <Plug className="size-6 text-muted-foreground" />
          Quellen
        </h2>
        <p className="text-sm text-muted-foreground">
          Worktide nimmt aus jeder verknüpften Quelle Events entgegen — Mails,
          Webhooks, Chat-Nachrichten — und verarbeitet sie zentral im Inbox-Stream.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Neue Quelle hinzufügen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {CATEGORIES.map((cat) => {
              const tiles = tilesByCategory[cat];
              if (!tiles.length) return null;
              const Icon = CATEGORY_ICON[cat];
              return (
                <div key={cat} className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Icon className="size-3" />
                    {CATEGORY_LABEL[cat]}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                    {tiles.map((t) => {
                      const TileIcon = t.icon;
                      return (
                        <button
                          key={t.code}
                          type="button"
                          onClick={() => t.available && setWizardCode(t.code)}
                          disabled={!t.available}
                          className={cn(
                            'group relative rounded-lg border bg-card p-3 text-left transition-shadow',
                            t.available
                              ? 'hover:shadow-md hover:border-primary/50 cursor-pointer'
                              : 'cursor-not-allowed opacity-60',
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <TileIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium">{t.label}</span>
                                {!t.available ? (
                                  <Badge variant="outline" className="text-[9px]">
                                    Demnächst
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                                {t.description}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Aktive Quellen</span>
              <Badge variant="outline">{channels.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {query.isLoading ? (
              <>
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </>
            ) : channels.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Noch keine Quellen. Wähle links eine Vorlage aus.
              </p>
            ) : (
              channels.map((c) => (
                <ActiveSourceRow
                  key={c['@id']}
                  channel={c}
                  onEdit={() => {
                    setWizardCode(c.adapterCode ?? null);
                    setWizardChannelId(c.id ?? null);
                  }}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {wizardCode ? (
        <SourceWizard
          adapterCode={wizardCode}
          existingChannelId={wizardChannelId}
          onClose={() => {
            setWizardCode(null);
            setWizardChannelId(null);
            // Reflect any just-saved edit (rename, re-auth, cleared error).
            void invalidate({ resource: 'channels', invalidates: ['list'] });
          }}
        />
      ) : null}
    </div>
  );
}

function ActiveSourceRow({
  channel,
  onEdit,
}: {
  channel: Row<ChannelJsonld>;
  onEdit: () => void;
}) {
  const invalidate = useInvalidate();
  const [deleting, setDeleting] = useState(false);
  const def = findSourceType(channel.adapterCode);
  const Icon = def?.icon ?? Plug;
  const enabled = (channel as unknown as { enabled?: boolean }).enabled === true;
  const error = (channel as unknown as { lastSyncError?: string | null }).lastSyncError;
  const lastSynced = (channel as unknown as { lastSyncedAt?: string | null }).lastSyncedAt;

  const remove = async () => {
  const { t: translate } = useTranslation();
    if (!channel.id) return;
    if (!window.confirm(`Quelle „${channel.name}" löschen? Konversationen + Events werden mit gelöscht.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/channels/${channel.id}`);
      void invalidate({ resource: 'channels', invalidates: ['list'] });
      toast.success(translate('toast.source_deleted'));
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Konnte Quelle nicht löschen.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex items-start gap-2 rounded-md border p-2 hover:bg-muted/30 transition-colors">
      <Icon className={cn('mt-0.5 size-4 shrink-0', enabled ? 'text-emerald-500' : 'text-muted-foreground/40')} />
      <button type="button" onClick={onEdit} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{channel.name}</span>
          {(channel as unknown as { isShared?: boolean }).isShared === false ? (
            <Badge variant="outline" className="text-[9px]">Persönlich</Badge>
          ) : null}
          {!enabled ? <Power className="size-3 text-muted-foreground/50" /> : null}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {def?.label ?? channel.adapterCode}
          {channel.address ? ` · ${channel.address}` : ''}
        </div>
        {error ? (
          <div className="mt-0.5 flex items-center gap-1 text-xs text-destructive truncate" title={error}>
            <XCircle className="size-3 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
        ) : lastSynced ? (
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Activity className="size-3 shrink-0" />
            Letzter Sync: {new Date(lastSynced).toLocaleString('de-DE')}
          </div>
        ) : (
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3 shrink-0" />
            Bereit, noch nicht synchronisiert
          </div>
        )}
      </button>
      <Button variant="ghost" size="icon" className="size-7" onClick={remove} disabled={deleting} aria-label="Löschen">
        {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      </Button>
    </div>
  );
}
