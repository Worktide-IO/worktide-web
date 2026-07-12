import { useOne } from '@refinedev/core';
import { ArrowLeft, Pencil, Share2, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProjectStarButton } from '@/components/ProjectStarButton';
import { ProjectShareDialog } from '@/components/ProjectShareDialog';
import { TagChips } from '@/components/TagChips';
import { useNavigate, useParams } from 'react-router';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { ProjectStatusJsonld } from '@/api/types/projectStatus/Jsonld';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { useCustomerLookup } from '@/lib/useCustomerLookup';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useList } from '@refinedev/core';
import { WatchButton } from '@/components/WatchButton';

import { ProjectBoardTab } from './ProjectBoardTab';
import { ProjectOverviewTab } from './ProjectOverviewTab';
import { ProjectReleasesTab } from './ProjectReleasesTab';
import { ProjectStatusUpdatesTab } from './ProjectStatusUpdatesTab';

/**
 * Project detail page — header + tabbed body.
 *
 * Lookup tables (project_statuses, customers) are fetched once at this
 * level and forwarded to the tabs as `Record<iri, …>` maps so individual
 * tab components don't each re-fetch on switch. The Board tab on its own
 * still owns its task-status + tasks queries (those are scoped to the
 * project and are the heart of its UX, not header decoration).
 */
export function ProjectDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);

  const { result: project, query: projectQuery } = useOne<Row<ProjectJsonld>>({
    resource: 'projects',
    id: id ?? '',
    queryOptions: { enabled: Boolean(id) },
  });

  const { connected: liveConnected } = useLiveResource('projects');

  const { result: statuses } = useList<Row<ProjectStatusJsonld>>({
    resource: 'project_statuses',
    pagination: { mode: 'off' },
  });
  const customerByIri = useCustomerLookup([project?.customer]);

  if (!id) {
    return <p className="text-sm text-destructive">{t('project_detail.no_id')}</p>;
  }
  if (projectQuery.isLoading || !project) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const p = project;
  const status = (statuses?.data ?? []).find((s) => s['@id'] === p.status);
  const customer = p.customer ? customerByIri[p.customer] : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 -ml-2 gap-1"
              onClick={() => navigate('/projects')}
            >
              <ArrowLeft className="size-3" /> {t('project_detail.back_projects')}
            </Button>
            <span>/</span>
            <span className="font-mono">{p.key}</span>
            {(p as { number?: string | null }).number ? (
              <>
                <span>·</span>
                <span className="font-mono">
                  {t('project_detail.number', { number: (p as { number?: string | null }).number })}
                </span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="size-3 rounded-full"
              style={{ backgroundColor: p.color ?? '#6366f1' }}
            />
            <h2 className="text-2xl">{p.name}</h2>
            {liveConnected ? (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Wifi className="size-3" /> Live
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                <WifiOff className="size-3" /> offline
              </Badge>
            )}
            <WatchButton target="project" targetId={p.id} className="ml-2" />
            <ProjectStarButton projectId={p.id} variant="full" className="ml-auto" />
            <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
              <Share2 className="size-4" /> {t('project_detail.share')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => p.id && navigate(`/projects/${p.id}/edit`)}
            >
              <Pencil className="size-4" /> {t('action.edit')}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {status ? (
              <Badge variant={status.isCompleted ? 'secondary' : 'outline'} className="text-xs">
                {status.name}
              </Badge>
            ) : null}
            {customer ? (
              <span>
                {t('project_detail.customer_label')} <span className="text-foreground">{customer.name}</span>
              </span>
            ) : (
              <span>{t('project_detail.internal')}</span>
            )}
            {p.isArchived ? (
              <Badge variant="outline" className="text-xs">{t('project_detail.archived')}</Badge>
            ) : null}
            {p.isPrivate ? (
              <Badge variant="outline" className="text-xs">{t('project_detail.private')}</Badge>
            ) : null}
            {p.tags && p.tags.length > 0 ? <TagChips iris={p.tags} /> : null}
          </div>
        </div>
      </div>

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="overview">{t('project_detail.tab_overview')}</TabsTrigger>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="status-updates">{t('widget.recent_status_updates.label')}</TabsTrigger>
          <TabsTrigger value="releases">Releases</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          <ProjectOverviewTab project={p} customer={customer ?? null} />
        </TabsContent>
        <TabsContent value="board" className="pt-4">
          <ProjectBoardTab projectIri={p['@id'] ?? ''} />
        </TabsContent>
        <TabsContent value="status-updates" className="pt-4">
          <ProjectStatusUpdatesTab projectIri={p['@id'] ?? ''} />
        </TabsContent>
        <TabsContent value="releases" className="pt-4">
          <ProjectReleasesTab projectIri={p['@id'] ?? ''} projectId={p.id ?? ''} />
        </TabsContent>
      </Tabs>

      {p.id ? (
        <ProjectShareDialog
          projectId={p.id}
          projectName={p.name ?? t('project_detail.fallback_name')}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      ) : null}
    </div>
  );
}
