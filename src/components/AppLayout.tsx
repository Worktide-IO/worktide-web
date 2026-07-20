import { useMenu } from '@refinedev/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router';

import { resolveNavIcon } from '@/lib/icons';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

import { BrandLogo } from '@/components/BrandLogo';
import { FloatingTimer } from '@/components/FloatingTimer';
import { GlobalSearchDialog } from '@/components/GlobalSearchDialog';
import { MercureStatusPill } from '@/components/MercureStatusPill';
import { MyProjectsSidebar } from '@/components/MyProjectsSidebar';
import { NotificationBell } from '@/components/NotificationBell';
import { NetworkStatusBanner } from '@/components/NetworkStatusBanner';
import { PendingMutationsToast } from '@/components/PendingMutationsToast';
import { QuickAddDialog } from '@/components/QuickAddDialog';
import { FeedbackWidget, openFeedback } from '@/components/feedback/FeedbackWidget';
import { Button } from '@/components/ui/button';
import { MessageSquarePlus } from 'lucide-react';
import { UserMenu } from '@/components/UserMenu';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import { DevToolsBridge } from '@/components/DevToolsBridge';
import { useIdleLogout } from '@/hooks/useIdleLogout';
import { api } from '@/lib/api';
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
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
  const { t } = useTranslation();
  const grouped = groupByCategory(menuItems);

  // Idle-logout reads the user's setting on first mount and re-syncs
  // whenever SecuritySettingsPage saves a new value (Mercure push on
  // /users/<me>/preferences would close the loop better; for now the
  // settings page reloads on save which re-renders this).
  const [idleMinutes, setIdleMinutes] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .get<{ idleTimeoutMinutes: number | null }>('/me/preferences')
      .then(({ data }) => {
        if (alive) setIdleMinutes(data.idleTimeoutMinutes ?? null);
      })
      .catch(() => {
        // Silent — the loop falls back to "disabled" which is the
        // safer default if /me/preferences is unreachable.
      });
    return () => {
      alive = false;
    };
  }, []);
  useIdleLogout(idleMinutes);

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
              <SidebarGroupLabel>{t(CATEGORY_LABEL_KEY[group.label] ?? group.label)}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <NavItem key={item.key} item={item} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
          <MyProjectsSidebar />
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <UserMenu />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <div className="px-2 py-1">
                <MercureStatusPill />
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <NetworkStatusBanner />
        <header className="flex h-14 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-6" />
          <BrandLogo className="h-6 w-auto" />
          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9 rounded-full"
              onClick={() => openFeedback()}
              aria-label={t('feedback.trigger_aria')}
              title={t('feedback.trigger_aria')}
            >
              <MessageSquarePlus className="size-4" />
            </Button>
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </SidebarInset>
      <FloatingTimer />
      <QuickAddDialog />
      <GlobalSearchDialog />
      <PendingMutationsToast />
      <FeedbackWidget />
      <DevToolsBridge />
    </SidebarProvider>
  );
}

function NavItem({ item }: { item: Resource }) {
  const location = useLocation();
  const { t } = useTranslation();
  const subItems = (item.meta as Record<string, unknown>)?.subItems as
    | { name: string; list: string; meta: { label: string; icon: string } }[]
    | undefined;

  const iconName = (item.meta?.icon as string | undefined) ?? 'Circle';
  const Icon = resolveNavIcon(iconName);
  const label = t((item.meta?.label as string | undefined) ?? item.label ?? item.name);

  // Parent item with sub-items → collapsible section
  if (subItems && subItems.length > 0) {
    return <NavGroup label={label} Icon={Icon} subItems={subItems} />;
  }

  // `item.route` may be a path or undefined for resource groups with no list
  // route. Skip those — they wouldn't navigate anywhere.
  const to = item.route;
  if (!to) {
    return null;
  }
  const isActive = location.pathname === to || location.pathname.startsWith(`${to}/`);

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

function NavGroup({
  label,
  Icon,
  subItems,
}: {
  label: string;
  Icon: React.ElementType;
  subItems: { name: string; list: string; meta: { label: string; icon: string } }[];
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const isActive = subItems.some(
    (s) => location.pathname === s.list || location.pathname.startsWith(`${s.list}/`),
  );
  const [open, setOpen] = useState(isActive);

  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={label} isActive={isActive}>
            <Icon className="size-4" />
            <span>{label}</span>
            <ChevronRight
              className={`ml-auto size-4 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {subItems.map((s) => {
              const active =
                location.pathname === s.list || location.pathname.startsWith(`${s.list}/`);
              const SubIcon = resolveNavIcon(s.meta.icon);
              return (
                <SidebarMenuSubItem key={s.name}>
                  <SidebarMenuSubButton asChild isActive={active}>
                    <Link to={s.list}>
                      <SubIcon className="size-4" />
                      <span>{t(s.meta.label)}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

/**
 * Buckets the flat resources list into the labelled groups the sidebar
 * renders. The category lives on `meta.category` and falls back to "App"
 * so adding a new resource without a category is harmless.
 *
 * Section order is fixed (most-used first) rather than alphabetical so
 * users find Projekte / Aufgaben without scanning the whole sidebar.
 */
const CATEGORY_ORDER = ['Arbeit', 'CRM', 'Einstellungen'] as const;

const CATEGORY_LABEL_KEY: Record<string, string> = {
  Arbeit: 'nav.category.work',
  CRM: 'nav.category.crm',
  Einstellungen: 'nav.category.settings',
};

function groupByCategory(items: Resource[]): { label: string; items: Resource[] }[] {
  const buckets = new Map<string, Resource[]>();
  for (const item of items) {
    const cat = (item.meta?.category as string | undefined) ?? 'App';
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat)!.push(item);
  }
  const orderIndex = (label: string) => {
    const i = CATEGORY_ORDER.indexOf(label as (typeof CATEGORY_ORDER)[number]);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  return [...buckets.entries()]
    .sort(([a], [b]) => orderIndex(a) - orderIndex(b) || a.localeCompare(b))
    .map(([label, items]) => ({ label, items }));
}

// Keep the helper exported so callers can compose nested layouts later.
export { groupByCategory };

// re-export utility for tooling
export { cn };
