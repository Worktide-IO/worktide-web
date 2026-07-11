import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useList } from '@refinedev/core';
import { Check, ChevronsUpDown, Settings } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { Row } from '@/lib/refine';
import type { WorkspaceJsonld } from '@/api/types/workspace/Jsonld';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { WORKSPACE_STORAGE_KEY } from '@/lib/api';

/**
 * Workspace switcher for the sidebar header.
 *
 * - Lists workspaces from `/v1/workspaces` — the backend voter already
 *   restricts the list to ones the current user is a member of, so we
 *   don't need a separate `/v1/users/me/workspaces` endpoint.
 * - Selected workspace persists to localStorage under `wt.workspace`
 *   (the axios interceptor in lib/api.ts stamps that into
 *   `X-Workspace-Id` on every subsequent request).
 * - Switching invalidates every TanStack Query so all currently-rendered
 *   data refetches under the new workspace context. Without that, the
 *   project list would keep showing the old tenant's rows until the user
 *   navigates away.
 */
export function WorkspaceSwitcher() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const activeId = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;

  const { result: workspaces, query } = useList<Row<WorkspaceJsonld>>({
    resource: 'workspaces',
    pagination: { mode: 'off' },
  });

  const active = useMemo(
    () => workspaces?.data?.find((w) => w.id === activeId) ?? workspaces?.data?.[0] ?? null,
    [workspaces, activeId],
  );

  const switchTo = async (ws: Row<WorkspaceJsonld>) => {
    if (!ws.id || ws.id === activeId) {
      setOpen(false);
      return;
    }
    localStorage.setItem(WORKSPACE_STORAGE_KEY, ws.id);
    await qc.invalidateQueries(); // refetch everything under the new tenant
    toast.success(t('toast.workspace_switched', { name: ws.name ?? ws.slug }));
    setOpen(false);
  };

  if (query.isLoading) {
    return <SidebarMenuButton size="lg" disabled>Lade…</SidebarMenuButton>;
  }
  if (!workspaces?.data?.length) {
    return <SidebarMenuButton size="lg" disabled>Keine Workspaces</SidebarMenuButton>;
  }

  const initials = workspaceInitials(active?.name ?? active?.slug);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SidebarMenuButton
          size="lg"
          aria-label="Workspace wechseln"
          className="data-[state=open]:bg-sidebar-accent"
        >
          <Avatar className="size-7 rounded-md">
            <AvatarFallback className="rounded-md text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col items-start gap-0.5 leading-tight">
            <span className="text-sm font-medium truncate">{active?.name ?? active?.slug ?? '—'}</span>
            <span className="text-xs text-muted-foreground truncate">
              {workspaces.data.length} Workspace{workspaces.data.length === 1 ? '' : 's'}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" sideOffset={8}>
        <Command>
          <CommandInput placeholder="Workspace suchen…" />
          <CommandList>
            <CommandEmpty>Keine Treffer.</CommandEmpty>
            <CommandGroup>
              {workspaces.data.map((ws) => (
                <CommandItem
                  key={ws.id}
                  value={`${ws.name ?? ''} ${ws.slug ?? ''}`}
                  onSelect={() => void switchTo(ws)}
                >
                  <Avatar className="size-6 rounded-md mr-2">
                    <AvatarFallback className="rounded-md text-[10px]">
                      {workspaceInitials(ws.name ?? ws.slug)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span>{ws.name}</span>
                    {ws.slug ? (
                      <span className="text-xs text-muted-foreground font-mono">{ws.slug}</span>
                    ) : null}
                  </div>
                  <Check
                    className={cn(
                      'ml-auto size-4',
                      ws.id === active?.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup>
              {/*
                Navigate via onSelect, NOT asChild + <Link>. Wrapping a
                Link that holds multiple children inside Radix's Slot
                throws "Primitive.div failed to slot onto its children"
                synchronously during render — the Popover portal then
                crashes the whole app tree (no error boundary above it).
              */}
              <CommandItem
                value="settings"
                onSelect={() => {
                  setOpen(false);
                  navigate('/settings/workspace');
                }}
              >
                <Settings className="size-4 mr-2" />
                Workspace-Einstellungen
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function workspaceInitials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || name.slice(0, 2).toUpperCase();
}
