import { useInvalidate, useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
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
    label: 'perm.group_workspace',
    caps: [
      { key: 'workspace.manage_settings', label: 'perm.cap.manage_settings' },
      { key: 'workspace.manage_members', label: 'perm.cap.manage_members' },
      { key: 'workspace.manage_billing', label: 'perm.cap.manage_billing' },
    ],
  },
  {
    label: 'perm.group_projects',
    caps: [
      { key: 'project.create', label: 'perm.cap.create' },
      { key: 'project.update', label: 'action.edit' },
      { key: 'project.archive', label: 'perm.cap.archive' },
      { key: 'project.delete', label: 'action.delete' },
      { key: 'project.manage_members', label: 'perm.cap.manage_members' },
    ],
  },
  {
    label: 'perm.group_tasks',
    caps: [
      { key: 'task.create', label: 'perm.cap.create' },
      { key: 'task.update', label: 'action.edit' },
      { key: 'task.assign', label: 'perm.cap.assign' },
      { key: 'task.delete_own', label: 'perm.cap.delete_own' },
      { key: 'task.delete_others', label: 'perm.cap.delete_others' },
    ],
  },
  {
    label: 'perm.group_time',
    caps: [
      { key: 'time_entry.create', label: 'perm.cap.entry_create' },
      { key: 'time_entry.update_own', label: 'perm.cap.update_own' },
      { key: 'time_entry.update_others', label: 'perm.cap.update_others' },
      {
        key: 'time_entry.toggle_billed_own',
        label: 'perm.cap.toggle_billed_own',
        hint: 'perm.hint.toggle_billed_own',
      },
      { key: 'time_entry.delete_own', label: 'perm.cap.delete_own' },
      { key: 'time_entry.delete_others', label: 'perm.cap.delete_others' },
    ],
  },
  {
    label: 'perm.group_communication',
    caps: [
      { key: 'file.upload', label: 'perm.cap.file_upload' },
      { key: 'file.delete_others', label: 'perm.cap.file_delete_others' },
      { key: 'comment.create', label: 'perm.cap.comment_create' },
      { key: 'comment.delete_others', label: 'perm.cap.comment_delete_others' },
      { key: 'document.create', label: 'perm.cap.document_create' },
      { key: 'document.delete_others', label: 'perm.cap.document_delete_others' },
    ],
  },
  {
    label: 'perm.group_automation',
    caps: [
      { key: 'automation.manage', label: 'perm.cap.automation_manage' },
      { key: 'webhook.manage', label: 'perm.cap.webhook_manage' },
      { key: 'reports.view', label: 'perm.cap.reports_view' },
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
  const { t } = useTranslation();
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
      toast.error(detail ?? t('toast.could_not_change_permission'));
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
      toast.success(t('toast.reset_to_default'));
    } catch {
      toast.error(t('toast.could_not_restore_default'));
    } finally {
      setPendingCell(null);
    }
  };

  if (!workspaceId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-destructive">
          {t('perm.no_workspace')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-2xl">
          <Shield className="size-6 text-muted-foreground" />
          {t('perm.heading')}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t('perm.intro')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Matrix</CardTitle>
          <CardDescription>
            <span className="inline-flex items-center gap-1">
              <Crown className="size-3.5 text-amber-500" /> {t('perm.owner_note')}
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
                          {t(group.label)}
                        </TableCell>
                      </TableRow>
                      {group.caps.map((cap) => (
                        <TableRow key={cap.key}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1.5">
                              {t(cap.label)}
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {cap.key}
                              </span>
                              {cap.hint ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Info className="size-3 text-muted-foreground" />
                                  </TooltipTrigger>
                                  <TooltipContent>{t(cap.hint)}</TooltipContent>
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
                                  aria-label={`${r.label}: ${t(cap.label)} — ${granted ? t('perm.state_allowed') : t('perm.state_denied')}`}
                                  title={isOwner ? t('perm.owner_full') : ''}
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
                                      title={t('perm.reset_to_default')}
                                      aria-label={t('perm.reset_to_default')}
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
