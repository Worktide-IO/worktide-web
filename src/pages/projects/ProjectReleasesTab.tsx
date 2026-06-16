import { useInvalidate } from '@refinedev/core';
import { CalendarDays, CheckCircle2, Loader2, Lock, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { ProjectVersionJsonld } from '@/api/types/projectVersion/Jsonld';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useProjectVersions } from '@/hooks/useProjectVersions';
import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';

const STATUS_OPTIONS = [
  { value: 'open', label: 'Offen', icon: Tag },
  { value: 'locked', label: 'Eingefroren', icon: Lock },
  { value: 'closed', label: 'Veröffentlicht', icon: CheckCircle2 },
];

const SHARING_OPTIONS = [
  { value: 'none', label: 'Nur dieses Projekt' },
  { value: 'system', label: 'Workspace-weit (alle Projekte)' },
];

/**
 * Per-project release / version management.
 *
 * Versions tag tasks ("fixed in 1.2.0") and serve as the X-axis for
 * future release-burndown reports. The MVP UI is intentionally a
 * single table — name + planned ship date + status + sharing —
 * sufficient for the bluemine-style release workflow without
 * over-engineering the picker.
 *
 * Sharing dropdown currently exposes only "none" and "system" — the
 * descendants/hierarchy/tree options exist in the enum so the column
 * doesn't need a migration when sub-project trees land in a future
 * phase.
 */
export function ProjectReleasesTab({
  projectIri,
  projectId,
}: {
  projectIri: string;
  projectId: string;
}) {
  const { forProject, isLoading } = useProjectVersions(projectIri);
  const [editing, setEditing] = useState<Row<ProjectVersionJsonld> | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="size-5 text-muted-foreground" />
          Releases
        </CardTitle>
        <CardDescription>
          Plane Releases / Versionen und hänge Aufgaben über das
          „Release / Version"-Feld im Aufgaben-Sheet daran. Geschlossene
          Releases bleiben sichtbar — die Auswahl in Pickern verschwindet
          aber.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Neues Release
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : forProject.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Noch keine Releases. Lege das erste an, um Aufgaben zu
            bündeln.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-32">Ship-Datum</TableHead>
                <TableHead className="w-36">Status</TableHead>
                <TableHead className="w-44">Sichtbarkeit</TableHead>
                <TableHead className="w-20 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {forProject.map((v) => (
                <VersionRow
                  key={v['@id']}
                  version={v}
                  onEdit={() => setEditing(v)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {creating ? (
        <VersionDialog
          mode="create"
          projectIri={projectIri}
          projectId={projectId}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {editing ? (
        <VersionDialog
          mode="edit"
          projectIri={projectIri}
          projectId={projectId}
          version={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

function VersionRow({
  version,
  onEdit,
}: {
  version: Row<ProjectVersionJsonld>;
  onEdit: () => void;
}) {
  const invalidate = useInvalidate();
  const [deleting, setDeleting] = useState(false);
  const status = (version.status as string) ?? 'open';
  const sharing = (version.sharing as string) ?? 'none';
  const StatusIcon =
    status === 'closed' ? CheckCircle2 : status === 'locked' ? Lock : Tag;

  const remove = async () => {
    if (!version.id) return;
    if (
      !window.confirm(
        `Release "${version.name}" wirklich löschen? Verknüpfte Aufgaben bleiben erhalten, verlieren aber die Zuordnung.`,
      )
    )
      return;
    setDeleting(true);
    try {
      await api.delete(`/project_versions/${version.id}`);
      void invalidate({ resource: 'project_versions', invalidates: ['list'] });
      toast.success(`Release "${version.name}" gelöscht.`);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Konnte Release nicht löschen.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{version.name}</TableCell>
      <TableCell className="text-muted-foreground">
        {version.effectiveDate ? (
          <span className="inline-flex items-center gap-1 text-xs">
            <CalendarDays className="size-3" />
            {new Date(version.effectiveDate).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-xs">—</span>
        )}
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1 text-xs">
          <StatusIcon className="size-3" />
          {STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status}
        </span>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {SHARING_OPTIONS.find((o) => o.value === sharing)?.label ?? sharing}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="icon" className="size-7" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={remove}
          disabled={deleting}
        >
          {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      </TableCell>
    </TableRow>
  );
}

type DialogProps =
  | {
      mode: 'create';
      projectIri: string;
      projectId: string;
      onClose: () => void;
    }
  | {
      mode: 'edit';
      projectIri: string;
      projectId: string;
      version: Row<ProjectVersionJsonld>;
      onClose: () => void;
    };

function VersionDialog(props: DialogProps) {
  const invalidate = useInvalidate();
  const isEdit = props.mode === 'edit';
  const initial = isEdit ? props.version : null;

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [effectiveDate, setEffectiveDate] = useState(
    initial?.effectiveDate ? new Date(initial.effectiveDate).toISOString().slice(0, 10) : '',
  );
  const [status, setStatus] = useState((initial?.status as string) ?? 'open');
  const [sharing, setSharing] = useState((initial?.sharing as string) ?? 'none');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit && props.version) {
      setName(props.version.name ?? '');
      setDescription(props.version.description ?? '');
      setEffectiveDate(
        props.version.effectiveDate
          ? new Date(props.version.effectiveDate).toISOString().slice(0, 10)
          : '',
      );
      setStatus((props.version.status as string) ?? 'open');
      setSharing((props.version.sharing as string) ?? 'none');
    }
  }, [isEdit, props]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: trimmed,
        description: description.trim() || null,
        effectiveDate: effectiveDate || null,
        status,
        sharing,
      };
      if (isEdit && props.version.id) {
        await api.patch(`/project_versions/${props.version.id}`, body, {
          headers: { 'Content-Type': 'application/merge-patch+json' },
        });
        toast.success(`Release "${trimmed}" aktualisiert.`);
      } else {
        const workspaceId =
          typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
        if (!workspaceId) throw new Error('Kein aktiver Workspace.');
        await api.post('/project_versions', {
          ...body,
          project: props.projectIri,
          workspace: `/v1/workspaces/${workspaceId}`,
        });
        toast.success(`Release "${trimmed}" angelegt.`);
      }
      void invalidate({ resource: 'project_versions', invalidates: ['list'] });
      props.onClose();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Konnte Release nicht speichern.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Release "${initial?.name}" bearbeiten` : 'Neues Release anlegen'}
          </DialogTitle>
          <DialogDescription>
            Name, geplantes Ship-Datum und Status. Aufgaben werden über
            das Sheet hinzugefügt — nicht hier.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ver-name">Name</Label>
            <Input
              id="ver-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. 1.2.0 oder Q3-Release"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ver-desc">Beschreibung (optional)</Label>
            <Textarea
              id="ver-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-20 text-sm"
              placeholder="Highlights, Migrations-Hinweise, …"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ver-date">Ship-Datum</Label>
              <Input
                id="ver-date"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ver-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="ver-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ver-sharing">Sichtbarkeit</Label>
            <Select value={sharing} onValueChange={setSharing}>
              <SelectTrigger id="ver-sharing">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHARING_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <em>Workspace-weit</em> macht das Release in jedem Projekt
              auswählbar — sinnvoll für organisationsweite Release-Trains.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : isEdit ? <Pencil className="size-4" /> : <Plus className="size-4" />}
            {isEdit ? 'Speichern' : 'Anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
