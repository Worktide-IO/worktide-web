import { useGetIdentity, useList } from '@refinedev/core';
import { FolderKanban } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useLocation } from 'react-router';

import type { CustomerJsonld } from '@/api/types/customer/Jsonld';
import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

type Identity = { id?: string };

/**
 * Pinned/Recent "Meine Projekte" group in the sidebar.
 *
 * Two sub-groups:
 *   - "Eigene" — Sammelprojekte without a customer FK (internal work,
 *     workspace-shared)
 *   - "Kundenprojekte" — sorted by customer-name, customer label
 *     above each project so two clicks tell you which customer's work
 *     you're about to open
 *
 * Limited to the 8 most-recently-updated entries per bucket — full
 * /projects list lives one click away. Workspace-scoped membership
 * comes from the `members.user=` filter the Project entity exposes.
 */
export function MyProjectsSidebar() {
  const { data: identity } = useGetIdentity<Identity>();
  const userIri = identity?.id ? `/v1/users/${identity.id}` : null;

  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
    sorters: [{ field: 'updatedAt', order: 'desc' }],
    filters: userIri
      ? [
          { field: 'members.user', operator: 'eq', value: userIri },
          { field: 'isArchived', operator: 'eq', value: 'false' },
        ]
      : [],
    queryOptions: { enabled: Boolean(userIri) },
  });

  const { result: customers } = useList<Row<CustomerJsonld>>({
    resource: 'customers',
    pagination: { mode: 'off' },
  });

  const customerByIri = useMemo(() => {
    const map: Record<string, Row<CustomerJsonld>> = {};
    for (const c of customers?.data ?? []) {
      if (c['@id']) map[c['@id']] = c;
    }
    return map;
  }, [customers]);

  // Bucket projects into "no customer" (Sammelprojekte) and a per-
  // customer map ordered by customer name.
  const buckets = useMemo(() => {
    const rows = projects?.data ?? [];
    const internal: Row<ProjectJsonld>[] = [];
    const byCustomer = new Map<string, { customer: Row<CustomerJsonld>; items: Row<ProjectJsonld>[] }>();
    for (const p of rows) {
      if (!p.customer) {
        internal.push(p);
        continue;
      }
      const customer = customerByIri[p.customer];
      if (!customer) continue;
      const key = customer['@id'] ?? '';
      if (!byCustomer.has(key)) byCustomer.set(key, { customer, items: [] });
      byCustomer.get(key)!.items.push(p);
    }
    return {
      internal: internal.slice(0, 8),
      customerGroups: [...byCustomer.values()].sort((a, b) =>
        (a.customer.name ?? '').localeCompare(b.customer.name ?? ''),
      ),
    };
  }, [projects, customerByIri]);

  if (!userIri) return null;
  if (buckets.internal.length === 0 && buckets.customerGroups.length === 0) {
    return null;
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Meine Projekte</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {buckets.internal.length > 0 ? (
            <>
              <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Eigene
              </div>
              {buckets.internal.map((p) => (
                <ProjectRow key={p['@id']} project={p} />
              ))}
            </>
          ) : null}
          {buckets.customerGroups.map((group) => (
            <div key={group.customer['@id']} className="mt-2 first:mt-0">
              <div className="truncate px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {group.customer.name}
              </div>
              {group.items.slice(0, 6).map((p) => (
                <ProjectRow key={p['@id']} project={p} />
              ))}
            </div>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function ProjectRow({ project }: { project: Row<ProjectJsonld> }) {
  const location = useLocation();
  if (!project.id) return null;
  const to = `/projects/${project.id}`;
  const isActive = location.pathname === to;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={project.name ?? project.key}
        size="sm"
      >
        <Link to={to} className="gap-2">
          <span
            aria-hidden
            className={cn('size-2 shrink-0 rounded-full')}
            style={{ backgroundColor: project.color ?? '#6366f1' }}
          />
          <span className="flex-1 truncate text-sm">{project.name}</span>
          <span className="font-mono text-[10px] text-muted-foreground/60 group-data-[collapsible=icon]:hidden">
            {project.key}
          </span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// Fallback for the FolderKanban icon when an ancestor wants to render
// a header — exported so AppLayout (or any consumer) can reuse the
// same default colour.
export { FolderKanban };
