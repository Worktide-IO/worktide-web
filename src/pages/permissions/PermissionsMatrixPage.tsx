import { useInvalidate, useList } from '@refinedev/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Crown,
  Info,
  Loader2,
  RotateCcw,
  Shield,
  ShieldCheck,
  UserCog,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type {
  RolePermissionOverrideJsonld,
  RolePermissionOverrideJsonldCapabilityEnum,
  RolePermissionOverrideJsonldRoleEnum,
} from '@/api/types/rolePermissionOverride/Jsonld';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

type Role = RolePermissionOverrideJsonldRoleEnum;
type Capability = RolePermissionOverrideJsonldCapabilityEnum;

type MatrixResponse = {
  workspaceId: string;
  matrix: Record<Role, Record<Capability, boolean>>;
};

const ROLES: { value: Role; label: string; icon: typeof Crown }[] = [
  { value: 'owner', label: 'Owner', icon: Crown },
  { value: 'admin', label: 'Admin', icon: ShieldCheck },
  { value: 'member', label: 'Member', icon: UserCog },
  { value: 'guest', label: 'Guest', icon: UserCog },
];

const CAP_GROUPS: { label: string; caps: { key: Capability; label: string; hint?: string }[] }[] = [
  {
    label: 'Workspace',
    caps: [
      { key: 'workspace.manage_settings', label: 'Einstellungen verwalten' },
      { key: 'workspace.manage_members', label: 'Mitglieder verwalten' },
      { key: 'workspace.manage_billing', label: 'Abrechnung verwalten' },
    ],
  },
  {
    label: 'Projekte',
    caps: [
      { key: 'project.create', label: 'Anlegen' },
      { key: 'project.update', label: 'Bearbeiten' },
      { key: 'project.archive', label: 'Archivieren' },
      { key: 'project.delete', label: 'Löschen' },
      { key: 'project.manage_members', label: 'Mitglieder verwalten' },
    ],
  },
  {
    label: 'Aufgaben',
    caps: [
      { key: 'task.create', label: 'Anlegen' },
      { key: 'task.update', label: 'Bearbeiten' },
      { key: 'task.assign', label: 'Zuweisen' },
      { key: 'task.delete_own', label: 'Eigene löschen' },
      { key: 'task.delete_others', label: 'Fremde löschen' },
    ],
  },
  {
    label: 'Zeit',
    caps: [
      { key: 'time_entry.create', label: 'Eintrag anlegen' },
      { key: 'time_entry.update_own', label: 'Eigene bearbeiten' },
      { key: 'time_entry.update_others', label: 'Fremde bearbeiten' },
      { key: 'time_entry.delete_own', label: 'Eigene löschen' },
      { key: 'time_entry.delete_others', label: 'Fremde löschen' },
    ],
  },
  {
    label: 'Kommunikation',
    caps: [
      { key: 'file.upload', label: 'Datei hochladen' },
      { key: 'file.delete_others', label: 'Fremde Dateien löschen' },
      { key: 'comment.create', label: 'Kommentar schreiben' },
      { key: 'comment.delete_others', label: 'Fremde Kommentare löschen' },
      { key: 'document.create', label: 'Dokument anlegen' },
      { key: 'document.delete_others', label: 'Fremde Dokumente löschen' },
    ],
  },
  {
    label: 'Automation & Reports',
    caps: [
      { key: 'automation.manage', label: 'Automationen verwalten' },
      { key: 'webhook.manage', label: 'Webhooks verwalten' },
      { key: 'reports.view', label: 'Reports einsehen' },
    ],
  },
];

/**
 * Workspace-Rollen × Capability-Matrix mit Toggle-Bearbeitung.
 *
 * Datenfluss:
 *   - GET /v1/permissions/matrix     → effektive Cells (Default ± Override)
 *   - GET /v1/role_permission_overrides?workspace=…
 *                                    → welche Cells überhaupt einen
 *                                      Override haben (= explizit vom
 *                                      Default abweichen)
 *
 * Cell-Click-Verhalten:
 *   - Cell ist default-granted, User klickt: POST override(false)
 *   - Cell ist default-revoked, User klickt: POST override(true)
 *   - Cell hat schon Override: PATCH (toggle isGranted), oder DELETE
 *     wenn Reset-Button gedrückt wird
 *
 * Owner-Spalte ist nicht editierbar — der Resolver short-circuiteat
 * für Owner immer auf granted, der Backend-Validator verweigert
 * Owner-Overrides.
 */
export function PermissionsMatrixPage() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const workspaceId =
    typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
  const workspaceIri = workspaceId ? `/v1/workspaces/${workspaceId}` : null;

  const { data: matrixData, isLoading: matrixLoading } = useQuery({
    queryKey: ['permissions-matrix', workspaceId],
    queryFn: async (): Promise<MatrixResponse> => {
      const { data } = await api.get<MatrixResponse>('/permissions/matrix', {
        params: { workspace: workspaceId },
      });
      return data;
    },
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });

  const { result: overrides } = useList<Row<RolePermissionOverrideJsonld>>({
    resource: 'role_permission_overrides',
    pagination: { mode: 'off' },
    filters: workspaceIri
      ? [{ field: 'workspace', operator: 'eq', value: workspaceIri }]
      : [],
    queryOptions: { enabled: Boolean(workspaceIri) },
  });

  const overrideIndex = useMemo(() => {
    const map: Record<string, Row<RolePermissionOverrideJsonld>> = {};
    for (const o of overrides?.data ?? []) {
      if (o.role && o.capability) {
        map[`${o.role}:${o.capability}`] = o;
      }
    }
    return map;
  }, [overrides]);

  const [pendingCell, setPendingCell] = useState<string | null>(null);

  const refresh = () => {
    void invalidate({ resource: 'role_permission_overrides', invalidates: ['list'] });
    void qc.invalidateQueries({ queryKey: ['permissions-matrix', workspaceId] });
  };

  const toggle = async (role: Role, capability: Capability, current: boolean) => {
    const cellId = `${role}:${capability}`;
    setPendingCell(cellId);
    try {
      const existing = overrideIndex[cellId];
      if (existing && existing.id) {
        // Es gibt schon einen Override — flip ihn auf den gegenteiligen Wert.
        await api.patch(
          `/role_permission_overrides/${existing.id}`,
          { isGranted: !current },
          { headers: { 'Content-Type': 'application/merge-patch+json' } },
        );
      } else {
        await api.post('/role_permission_overrides', {
          workspace: workspaceIri,
          role,
          capability,
          isGranted: !current,
        });
      }
      refresh();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Konnte Berechtigung nicht ändern.');
    } finally {
      setPendingCell(null);
    }
  };

  const reset = async (role: Role, capability: Capability) => {
    const existing = overrideIndex[`${role}:${capability}`];
    if (!existing?.id) return;
    const cellId = `${role}:${capability}`;
    setPendingCell(cellId);
    try {
      await api.delete(`/role_permission_overrides/${existing.id}`);
      refresh();
      toast.success('Auf Default zurückgesetzt.');
    } catch {
      toast.error('Konnte Default nicht wiederherstellen.');
    } finally {
      setPendingCell(null);
    }
  };

  if (!workspaceId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-destructive">
          Kein aktiver Workspace.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-2xl">
          <Shield className="size-6 text-muted-foreground" />
          Berechtigungen
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Welche Rolle darf was in diesem Workspace. Grün = erlaubt, rot =
          verboten. Klick auf eine Zelle dreht den Default um — abweichende
          Werte sind durch einen kleinen Punkt markiert und lassen sich
          jederzeit auf den Default zurücksetzen.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Matrix</CardTitle>
          <CardDescription>
            <span className="inline-flex items-center gap-1">
              <Crown className="size-3.5 text-amber-500" /> Owner ist immer
              voll-berechtigt und nicht editierbar.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {matrixLoading || !matrixData ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[18rem]">Capability</TableHead>
                    {ROLES.map((r) => {
                      const Icon = r.icon;
                      return (
                        <TableHead key={r.value} className="w-28 text-center">
                          <div className="inline-flex flex-col items-center gap-1">
                            <Icon className="size-4 text-muted-foreground" />
                            <span>{r.label}</span>
                          </div>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {CAP_GROUPS.map((group) => (
                    <React.Fragment key={group.label}>
                      <TableRow>
                        <TableCell
                          colSpan={ROLES.length + 1}
                          className="bg-muted/40 py-1 text-xs font-medium text-muted-foreground"
                        >
                          {group.label}
                        </TableCell>
                      </TableRow>
                      {group.caps.map((cap) => (
                        <TableRow key={cap.key}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1.5">
                              {cap.label}
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {cap.key}
                              </span>
                              {cap.hint ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Info className="size-3 text-muted-foreground" />
                                  </TooltipTrigger>
                                  <TooltipContent>{cap.hint}</TooltipContent>
                                </Tooltip>
                              ) : null}
                            </div>
                          </TableCell>
                          {ROLES.map((r) => {
                            const granted = matrixData.matrix[r.value]?.[cap.key] ?? false;
                            const hasOverride = Boolean(overrideIndex[`${r.value}:${cap.key}`]);
                            const cellId = `${r.value}:${cap.key}`;
                            const isOwner = r.value === 'owner';
                            const busy = pendingCell === cellId;
                            return (
                              <TableCell key={r.value} className="text-center">
                                <button
                                  type="button"
                                  disabled={isOwner || busy}
                                  onClick={() => toggle(r.value, cap.key, granted)}
                                  className={cn(
                                    'group inline-flex size-9 items-center justify-center rounded-md transition-colors',
                                    granted
                                      ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400'
                                      : 'bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400',
                                    isOwner && 'opacity-60 cursor-not-allowed',
                                    busy && 'opacity-40',
                                  )}
                                  aria-label={`${r.label}: ${cap.label} — aktuell ${granted ? 'erlaubt' : 'verboten'}`}
                                  title={isOwner ? 'Owner ist immer voll-berechtigt' : ''}
                                >
                                  {busy ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : granted ? (
                                    <Check className="size-4" />
                                  ) : (
                                    <X className="size-4" />
                                  )}
                                </button>
                                {hasOverride && !isOwner ? (
                                  <div className="flex items-center justify-center gap-1 pt-0.5">
                                    <Badge variant="outline" className="h-4 px-1 text-[9px]">
                                      Override
                                    </Badge>
                                    <button
                                      type="button"
                                      onClick={() => reset(r.value, cap.key)}
                                      disabled={busy}
                                      className="text-muted-foreground hover:text-foreground"
                                      title="Auf Default zurücksetzen"
                                      aria-label="Auf Default zurücksetzen"
                                    >
                                      <RotateCcw className="size-3" />
                                    </button>
                                  </div>
                                ) : null}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// React is referenced via React.Fragment above — import as namespace.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
