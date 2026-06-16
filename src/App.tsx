import { Authenticated, Refine } from '@refinedev/core';
import { DevtoolsPanel, DevtoolsProvider } from '@refinedev/devtools';
import routerProvider from '@refinedev/react-router';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';

import { AppLayout } from '@/components/AppLayout';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { authProvider } from '@/providers/authProvider';
import { dataProvider } from '@/providers/dataProvider';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { ActivityPage } from '@/pages/activity/ActivityPage';
import { CalendarPage } from '@/pages/calendar/CalendarPage';
import { ImportPage } from '@/pages/imports/ImportPage';
import { AccessTokensPage } from '@/pages/access-tokens/AccessTokensPage';
import { DocumentsPage } from '@/pages/documents/DocumentsPage';
import { PermissionsMatrixPage } from '@/pages/permissions/PermissionsMatrixPage';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { TeamMembersListPage } from '@/pages/team-members/TeamMembersListPage';
import { ContactCreatePage } from '@/pages/contacts/ContactCreatePage';
import { ContactEditPage } from '@/pages/contacts/ContactEditPage';
import { ContactsListPage } from '@/pages/contacts/ContactsListPage';
import { CustomerSystemCreatePage } from '@/pages/customer-systems/CustomerSystemCreatePage';
import { CustomerSystemEditPage } from '@/pages/customer-systems/CustomerSystemEditPage';
import { CustomerSystemsListPage } from '@/pages/customer-systems/CustomerSystemsListPage';
import { CustomersListPage } from '@/pages/customers/CustomersListPage';
import { CustomerCreatePage } from '@/pages/customers/CustomerCreatePage';
import { CustomerDetailPage } from '@/pages/customers/CustomerDetailPage';
import { SubscriptionCreatePage } from '@/pages/subscriptions/SubscriptionCreatePage';
import { SubscriptionEditPage } from '@/pages/subscriptions/SubscriptionEditPage';
import { SubscriptionsListPage } from '@/pages/subscriptions/SubscriptionsListPage';
import { ProjectCreatePage } from '@/pages/projects/ProjectCreatePage';
import { ProjectDetailPage } from '@/pages/projects/ProjectDetailPage';
import { ProjectEditPage } from '@/pages/projects/ProjectEditPage';
import { ProjectsListPage } from '@/pages/projects/ProjectsListPage';
import { ProfileSettingsPage } from '@/pages/settings/ProfileSettingsPage';
import { SecuritySettingsPage } from '@/pages/settings/SecuritySettingsPage';
import { WorkspaceSettingsPage } from '@/pages/settings/WorkspaceSettingsPage';
import { WallPage } from '@/pages/wall/WallPage';
import { TasksListPage } from '@/pages/tasks/TasksListPage';
import { TimeEntriesListPage } from '@/pages/timeEntries/TimeEntriesListPage';

/**
 * Top-level wiring. Refine handles auth-gating + data-provider injection;
 * react-router 7 owns the URL → component mapping; AppLayout wraps every
 * authenticated route with the sidebar + header shell.
 *
 * Adding a resource: append it to `resources` below with a `meta.icon`
 * (Lucide name) and `meta.category` ("Arbeit" / "CRM" / "Admin"). Refine's
 * useMenu() then picks it up automatically in the sidebar — no layout
 * change needed. Each entry needs a matching <Route> down below until its
 * dedicated page lands; until then the PlaceholderPage carries the load.
 */
export default function App() {
  return (
    <BrowserRouter>
      <TooltipProvider delayDuration={300}>
      <DevtoolsProvider>
        <Refine
          dataProvider={dataProvider}
          authProvider={authProvider}
          routerProvider={routerProvider}
          resources={[
            // ---- Arbeit ----------------------------------------------------
            {
              name: 'wall',
              list: '/wall',
              meta: { label: 'The Wall', icon: 'LayoutDashboard', category: 'Arbeit' },
            },
            {
              name: 'projects',
              list: '/projects',
              create: '/projects/create',
              edit: '/projects/:id/edit',
              show: '/projects/:id',
              meta: { label: 'Projekte', icon: 'FolderKanban', category: 'Arbeit' },
            },
            {
              name: 'tasks',
              list: '/tasks',
              meta: { label: 'Aufgaben', icon: 'CheckSquare', category: 'Arbeit' },
            },
            {
              name: 'time_entries',
              list: '/time-entries',
              meta: { label: 'Zeiteinträge', icon: 'Clock', category: 'Arbeit' },
            },
            {
              name: 'activity',
              list: '/activity',
              meta: { label: 'Aktivität', icon: 'Activity', category: 'Arbeit' },
            },
            {
              name: 'calendar',
              list: '/calendar',
              meta: { label: 'Kalender', icon: 'CalendarDays', category: 'Arbeit' },
            },
            {
              name: 'documents',
              list: '/documents',
              meta: { label: 'Dokumente', icon: 'FileText', category: 'Arbeit' },
            },
            {
              name: 'team_members',
              list: '/personen',
              meta: { label: 'Personen', icon: 'Users', category: 'Arbeit' },
            },
            {
              name: 'reports',
              list: '/auswertungen',
              meta: { label: 'Auswertungen', icon: 'BarChart3', category: 'Arbeit' },
            },

            // ---- CRM -------------------------------------------------------
            {
              name: 'customers',
              list: '/customers',
              create: '/customers/create',
              edit: '/customers/:id',
              show: '/customers/:id',
              meta: { label: 'Kunden', icon: 'Building2', category: 'CRM' },
            },
            {
              name: 'contacts',
              list: '/contacts',
              create: '/contacts/create',
              edit: '/contacts/:id',
              meta: { label: 'Kontakte', icon: 'Contact', category: 'CRM' },
            },
            {
              name: 'customer_systems',
              list: '/customer-systems',
              create: '/customer-systems/create',
              edit: '/customer-systems/:id',
              meta: { label: 'Systeme', icon: 'Server', category: 'CRM' },
            },
            {
              name: 'service_subscriptions',
              list: '/subscriptions',
              create: '/subscriptions/create',
              edit: '/subscriptions/:id',
              meta: { label: 'Abos', icon: 'Receipt', category: 'CRM' },
            },

            // ---- Admin -----------------------------------------------------
            {
              name: 'workspace_members',
              list: '/workspace-members',
              meta: { label: 'Mitglieder', icon: 'Users', category: 'Admin' },
            },
            {
              name: 'role_permission_overrides',
              list: '/permissions',
              meta: { label: 'Berechtigungen', icon: 'Shield', category: 'Admin' },
            },
            {
              name: 'webhooks',
              list: '/webhooks',
              meta: { label: 'Webhooks', icon: 'Webhook', category: 'Admin' },
            },
            {
              name: 'personal_access_tokens',
              list: '/access-tokens',
              meta: { label: 'API-Tokens', icon: 'KeyRound', category: 'Admin' },
            },
            {
              name: 'imports',
              list: '/imports',
              meta: { label: 'Import', icon: 'Upload', category: 'Admin' },
            },
          ]}
          options={{
            syncWithLocation: true,
            warnWhenUnsavedChanges: true,
            disableTelemetry: true,
          }}
        >
          <Routes>
            <Route
              element={
                <Authenticated key="auth" fallback={<Navigate to="/login" replace />}>
                  <AppLayout>
                    <Outlet />
                  </AppLayout>
                </Authenticated>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="/wall" element={<WallPage />} />
              <Route path="/projects" element={<ProjectsListPage />} />
              <Route path="/projects/create" element={<ProjectCreatePage />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
              <Route path="/projects/:id/edit" element={<ProjectEditPage />} />
              <Route path="/tasks" element={<TasksListPage />} />
              {/* Until each resource has its own page, the placeholder
                  acknowledges the navigation without breaking the layout. */}
              <Route path="/time-entries" element={<TimeEntriesListPage />} />
              <Route path="/activity" element={<ActivityPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/personen" element={<TeamMembersListPage />} />
              <Route path="/auswertungen" element={<ReportsPage />} />
              <Route path="/customers" element={<CustomersListPage />} />
              <Route path="/customers/create" element={<CustomerCreatePage />} />
              <Route path="/customers/:id" element={<CustomerDetailPage />} />
              <Route path="/contacts" element={<ContactsListPage />} />
              <Route path="/contacts/create" element={<ContactCreatePage />} />
              <Route path="/contacts/:id" element={<ContactEditPage />} />
              <Route path="/customer-systems" element={<CustomerSystemsListPage />} />
              <Route path="/customer-systems/create" element={<CustomerSystemCreatePage />} />
              <Route path="/customer-systems/:id" element={<CustomerSystemEditPage />} />
              <Route path="/subscriptions" element={<SubscriptionsListPage />} />
              <Route path="/subscriptions/create" element={<SubscriptionCreatePage />} />
              <Route path="/subscriptions/:id" element={<SubscriptionEditPage />} />
              <Route path="/workspace-members" element={<PlaceholderPage resource="workspace_members" />} />
              <Route path="/permissions" element={<PermissionsMatrixPage />} />
              <Route path="/webhooks" element={<PlaceholderPage resource="webhooks" />} />
              <Route path="/access-tokens" element={<AccessTokensPage />} />
              <Route path="/imports" element={<ImportPage />} />
              <Route path="/settings/profile" element={<ProfileSettingsPage />} />
              <Route path="/settings/security" element={<SecuritySettingsPage />} />
              <Route path="/settings/workspace" element={<WorkspaceSettingsPage />} />
            </Route>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </Refine>
        <Toaster richColors closeButton position="top-right" />
        <DevtoolsPanel />
      </DevtoolsProvider>
      </TooltipProvider>
    </BrowserRouter>
  );
}
