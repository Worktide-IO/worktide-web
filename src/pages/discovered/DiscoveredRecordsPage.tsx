import { useInvalidate, useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { ExternalLink, PackageSearch } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { formatDate } from '@/lib/intl';
import type { ChannelJsonld } from '@/api/types/channel/Jsonld';
import type { Row } from '@/lib/refine';
import { ProjectCombobox } from '@/components/ProjectCombobox';
import { TaskCombobox } from '@/components/TaskCombobox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// No generated type yet (entity is read-only over the API and post-dates the
// last codegen), so the curated shape lives here — see the DiscoveredExternalRecord
// entity + DiscoveredExternalRecordActionsController on the backend.
type DiscoveredParticipant = {
  externalUserId?: string | null;
  email?: string | null;
  role?: string | null;
};
type DiscoveredRecord = {
  '@id'?: string;
  id?: string;
  title?: string;
  entityType?: string;
  externalId?: string;
  externalUrl?: string | null;
  channel?: string; // IRI
  participants?: DiscoveredParticipant[];
  state?: 'pending' | 'imported' | 'linked' | 'dismissed';
  importedEntityId?: string | null;
  createdAt?: string;
};

const STATE_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  imported: 'bg-green-100 text-green-700',
  linked: 'bg-blue-100 text-blue-700',
  dismissed: 'bg-slate-100 text-slate-500',
};

const STATE_FILTERS = ['pending', 'imported', 'linked', 'dismissed', 'all'] as const;
type StateFilter = (typeof STATE_FILTERS)[number];

function DiscoveredRecordCard({
  record,
  channelName,
  onChanged,
}: {
  record: DiscoveredRecord;
  channelName: string | null;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'idle' | 'import' | 'link'>('idle');
  const [projectIri, setProjectIri] = useState<string | null>(null);
  const [taskIri, setTaskIri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const id = record.id ?? record['@id']?.split('/').pop();
  const pending = record.state === 'pending';

  async function act(action: 'import' | 'link' | 'dismiss', body?: Record<string, unknown>) {
    if (!id) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ state?: string; taskIdentifier?: string }>(
        `/discovered_external_records/${id}/${action}`,
        body ?? {},
      );
      const ref = data?.taskIdentifier ? ` (${data.taskIdentifier})` : '';
      toast.success(t(`discovered.toast_${action}ed`) + ref);
      onChanged();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(status === 409 ? t('discovered.toast_conflict') : t('toast.action_failed'));
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{record.title || t('discovered.untitled')}</CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{record.externalId}</span>
              {channelName ? <span>{channelName}</span> : null}
              {record.entityType ? <Badge variant="outline">{record.entityType}</Badge> : null}
              {record.createdAt ? <span>{formatDate(record.createdAt, { dateStyle: 'medium' })}</span> : null}
              {record.externalUrl ? (
                <a
                  href={record.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="size-3.5" /> {t('discovered.open_external')}
                </a>
              ) : null}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATE_BADGE[record.state ?? 'pending']}`}
          >
            {t(`discovered.state_${record.state ?? 'pending'}`)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {record.participants && record.participants.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {record.participants.map((p, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {p.email || p.externalUserId || '?'}
                {p.role ? <span className="text-[10px] uppercase opacity-70">{p.role}</span> : null}
              </span>
            ))}
          </div>
        ) : null}

        {pending ? (
          mode === 'import' ? (
            <div className="space-y-2">
              <ProjectCombobox value={projectIri} onChange={setProjectIri} className="max-w-sm" />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy || !projectIri}
                  onClick={() => act('import', { project: projectIri })}
                >
                  {busy ? t('discovered.importing') : t('discovered.confirm_import')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>
                  {t('action.cancel')}
                </Button>
              </div>
            </div>
          ) : mode === 'link' ? (
            <div className="space-y-2">
              <TaskCombobox value={taskIri} onChange={setTaskIri} className="max-w-sm" />
              <div className="flex gap-2">
                <Button size="sm" disabled={busy || !taskIri} onClick={() => act('link', { task: taskIri })}>
                  {busy ? t('discovered.linking') : t('discovered.confirm_link')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>
                  {t('action.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setMode('import')}>
                {t('discovered.action_import')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMode('link')}>
                {t('discovered.action_link')}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => act('dismiss')}>
                {t('discovered.action_dismiss')}
              </Button>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Discovered-inbox (C.7.6): external Jira/Redmine tickets that involve a
 * workspace person but have no EntitySync mapping yet. The operator imports one
 * as a new task, links it to an existing task, or dismisses it. Read-only list
 * (/v1/discovered_external_records) + the three action endpoints.
 */
export function DiscoveredRecordsPage() {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [stateFilter, setStateFilter] = useState<StateFilter>('pending');

  const { result, query } = useList<Row<DiscoveredRecord>>({
    resource: 'discovered_external_records',
    filters: stateFilter === 'all' ? [] : [{ field: 'state', operator: 'eq', value: stateFilter }],
    sorters: [{ field: 'createdAt', order: 'desc' }],
    pagination: { currentPage: 1, pageSize: 50 },
  });
  const records = result?.data ?? [];

  // Resolve channel IRIs → names for display (small set, load all).
  const { result: channels } = useList<Row<ChannelJsonld>>({
    resource: 'channels',
    pagination: { mode: 'off' },
  });
  const channelName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of channels?.data ?? []) if (c['@id'] && c.name) m[c['@id']] = c.name;
    return m;
  }, [channels]);

  const refresh = () => void invalidate({ resource: 'discovered_external_records', invalidates: ['list'] });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl">
            <PackageSearch className="size-6 text-muted-foreground" /> {t('discovered.page_title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('discovered.page_subtitle')}</p>
        </div>
        <Select value={stateFilter} onValueChange={(v) => setStateFilter(v as StateFilter)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATE_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`discovered.filter_${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query?.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('app.loading')}</p>
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('discovered.empty')}</p>
      ) : (
        <div className="grid gap-3">
          {records.map((r) => (
            <DiscoveredRecordCard
              key={r.id ?? r['@id']}
              record={r}
              channelName={r.channel ? (channelName[r.channel] ?? null) : null}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}
