import { useList, useOne, useUpdate } from '@refinedev/core';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { WorkspaceJsonld } from '@/api/types/workspace/Jsonld';
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
import { WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';

import { SettingsLayout } from './SettingsLayout';

const LOCALES = [
  { value: 'de', label: 'Deutsch (de)' },
  { value: 'en', label: 'English (en)' },
  { value: 'fr', label: 'Français (fr)' },
];

// Curated short list of zones — covers most agency setups; "Europe/Berlin"
// is the seed default. Full IANA-list would be 400+ entries.
const TIMEZONES = [
  'Europe/Berlin',
  'Europe/Vienna',
  'Europe/Zurich',
  'Europe/London',
  'Europe/Madrid',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'UTC',
];

/**
 * `/settings/workspace` — workspace-level configuration for the active
 * tenant. The save call hits PATCH /v1/workspaces/{id} which is guarded
 * by the WorkspaceVoter (EDIT permission); non-admins see a 403 toast.
 *
 * The id is taken from localStorage (`wt.workspace`), the same key the
 * axios interceptor uses to stamp X-Workspace-Id — single source of truth.
 */
export function WorkspaceSettingsPage() {
  return (
    <SettingsLayout>
      <div>
        <h2 className="text-2xl">Workspace</h2>
        <p className="text-sm text-muted-foreground">
          Stammdaten dieses Mandanten — nur Workspace-Admins können hier speichern.
        </p>
      </div>
      <WorkspaceForm />
      <WorkspaceStats />
    </SettingsLayout>
  );
}

function WorkspaceForm() {
  const stored = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
  // If the user logged in before the workspace was persisted (or cleared
  // their storage), fall back to the first workspace the API returns —
  // same pattern WorkspaceSwitcher uses to pick a default.
  const { result: workspaces } = useList<Row<WorkspaceJsonld>>({
    resource: 'workspaces',
    pagination: { mode: 'off' },
    queryOptions: { enabled: !stored },
  });
  const id = stored ?? workspaces?.data?.[0]?.id ?? null;

  const { result: workspace, query } = useOne<Row<WorkspaceJsonld>>({
    resource: 'workspaces',
    id: id ?? '',
    queryOptions: { enabled: Boolean(id) },
  });
  const { mutate: update, mutation } = useUpdate<Row<WorkspaceJsonld>>();
  const saving = mutation.isPending;

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [locale, setLocale] = useState('de');
  const [timezone, setTimezone] = useState('Europe/Berlin');

  useEffect(() => {
    if (workspace) {
      setName(workspace.name ?? '');
      setSlug(workspace.slug ?? '');
      setLocale(workspace.locale ?? 'de');
      setTimezone(workspace.timezone ?? 'Europe/Berlin');
    }
  }, [workspace]);

  if (!id) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-destructive">
            Kein aktiver Workspace ausgewählt.
          </p>
        </CardContent>
      </Card>
    );
  }
  if (query.isLoading || !workspace) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-40" />
        </CardContent>
      </Card>
    );
  }

  const dirty =
    name !== (workspace.name ?? '') ||
    slug !== (workspace.slug ?? '') ||
    locale !== (workspace.locale ?? 'de') ||
    timezone !== (workspace.timezone ?? 'Europe/Berlin');

  const handleSave = () => {
    update(
      {
        resource: 'workspaces',
        id,
        values: { name, slug, locale, timezone },
        successNotification: false,
      },
      {
        onSuccess: () => toast.success('Workspace gespeichert.'),
        onError: (err) => {
          const status = (err as { response?: { status?: number } })?.response?.status;
          toast.error(
            status === 403
              ? 'Keine Berechtigung — nur Admins können Workspace-Einstellungen ändern.'
              : 'Konnte nicht speichern.',
          );
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stammdaten</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ws-name">Name</Label>
          <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ws-slug">Slug</Label>
          <Input
            id="ws-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            URL-Identifier, z. B. für Sub-Domain. Lowercase + Bindestriche.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Sprache</Label>
            <Select value={locale} onValueChange={setLocale}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Zeitzone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Button type="button" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? 'Speichere…' : 'Speichern'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkspaceStats() {
  // Cheap "pagination off + read totalItems" trick — would scale ugly past
  // tens of thousands of rows but agency workspaces stay well below that.
  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
  });
  const { result: tasks } = useList<Row<TaskJsonld>>({
    resource: 'tasks',
    pagination: { mode: 'off' },
  });

  const projectCount = projects?.data?.length ?? 0;
  const taskCount = tasks?.data?.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Statistiken</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Stat label="Projekte" value={projectCount} />
          <Stat label="Aufgaben" value={taskCount} />
        </dl>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      <dt className="text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}
