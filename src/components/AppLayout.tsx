import { useMenu } from '@refinedev/core';
import { Link, useLocation } from 'react-router';
import * as Icons from 'lucide-react';

import { UserMenu } from '@/components/UserMenu';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

/**
 * Authenticated app shell — left sidebar with the resource navigation, top
 * bar with the trigger + breadcrumb hook, and the Outlet for routed pages.
 *
 * Sidebar nav is derived from `useMenu()` which reads the `resources` array
 * on the Refine root. Each resource may carry a `meta.icon` string that
 * names a Lucide icon (resolved at render time so adding resources stays
 * a single-line change). Items without `meta.label` fall back to the
 * resource name.
 *
 * The two interactive blocks — WorkspaceSwitcher (header) and UserMenu
 * (footer) — live in dedicated files; this shell stays presentational.
 */
type Resource = ReturnType<typeof useMenu>['menuItems'][number];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { menuItems } = useMenu();
  const grouped = groupByCategory(menuItems);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <WorkspaceSwitcher />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {grouped.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <NavItem key={item.key} item={item} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <UserMenu />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-6" />
          <h1 className="text-sm font-medium text-muted-foreground">Worktide</h1>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function NavItem({ item }: { item: Resource }) {
  const location = useLocation();
  // `item.route` may be a path or undefined for resource groups with no list
  // route. Skip those — they wouldn't navigate anywhere.
  const to = item.route;
  if (!to) {
    return null;
  }
  const isActive = location.pathname === to || location.pathname.startsWith(`${to}/`);
  const iconName = (item.meta?.icon as string | undefined) ?? 'Circle';
  const Icon =
    (Icons[iconName as keyof typeof Icons] as React.ElementType | undefined) ??
    Icons.Circle;
  const label = (item.meta?.label as string | undefined) ?? item.label ?? item.name;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
        <Link to={to}>
          <Icon className="size-4" />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * Buckets the flat resources list into the labelled groups the sidebar
 * renders. The category lives on `meta.category` and falls back to "App"
 * so adding a new resource without a category is harmless.
 */
function groupByCategory(items: Resource[]): { label: string; items: Resource[] }[] {
  const buckets = new Map<string, Resource[]>();
  for (const item of items) {
    const cat = (item.meta?.category as string | undefined) ?? 'App';
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat)!.push(item);
  }
  // Preserve a deterministic order: App first, then categories alphabetically.
  return [...buckets.entries()]
    .sort(([a], [b]) => (a === 'App' ? -1 : b === 'App' ? 1 : a.localeCompare(b)))
    .map(([label, items]) => ({ label, items }));
}

// Keep the helper exported so callers can compose nested layouts later.
export { groupByCategory };

// re-export utility for tooling
export { cn };
