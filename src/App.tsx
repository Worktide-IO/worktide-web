import { Authenticated, Refine } from '@refinedev/core';
import { DevtoolsPanel, DevtoolsProvider } from '@refinedev/devtools';
import routerProvider from '@refinedev/react-router';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';

import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AppLayout } from '@/components/AppLayout';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { authProvider } from '@/providers/authProvider';
import { dataProvider } from '@/providers/dataProvider';
import { LoginPage } from '@/pages/LoginPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { ActivityPage } from '@/pages/activity/ActivityPage';
import { CalendarPage } from '@/pages/calendar/CalendarPage';
import { ImportPage } from '@/pages/imports/ImportPage';
import { AccessTokensPage } from '@/pages/access-tokens/AccessTokensPage';
import { DocumentsPage } from '@/pages/documents/DocumentsPage';
import { PermissionsMatrixPage } from '@/pages/permissions/PermissionsMatrixPage';
import { ConversationDetailPage } from '@/pages/inbox/ConversationDetailPage';
import { ConversationsListPage } from '@/pages/inbox/ConversationsListPage';
import { TeamPlannerPage } from '@/pages/planner/TeamPlannerPage';
import { SprintsPage } from '@/pages/sprints/SprintsPage';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { SourcesPage } from '@/pages/sources/SourcesPage';
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
import { SocialPostsListPage } from '@/pages/social/SocialPostsListPage';
import { SocialPostCreatePage } from '@/pages/social/SocialPostCreatePage';
import { SocialPostEditPage } from '@/pages/social/SocialPostEditPage';
import { ProductsListPage } from '@/pages/products/ProductsListPage';
import { ProductCreatePage } from '@/pages/products/ProductCreatePage';
import { ProductEditPage } from '@/pages/products/ProductEditPage';
import { IndustriesPage } from '@/pages/industries/IndustriesPage';
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
/**
 * Refine DevTools open a WebSocket to the local devtools server (localhost:5001,
 * started via `refine devtools`). That server isn't running in the ddev setup,
 * so mounting it unconditionally floods the console with ERR_CONNECTION_REFUSED
 * retries. Gate it behind an explicit opt-in: only in a dev build AND when
 * VITE_REFINE_DEVTOOLS=true. Production never ships it; everyday dev is quiet.
 */
function DevtoolsGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const enabled =
    import.meta.env.DEV && import.meta.env.VITE_REFINE_DEVTOOLS === 'true';
  if (!enabled) {
    return <>{children}</>;
  }
  return (
    <DevtoolsProvider>
      {children}
      <DevtoolsPanel />
    </DevtoolsProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TooltipProvider delayDuration={300}>
      <DevtoolsGate>
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
              name: 'planner',
              list: '/planner',
              meta: { label: 'Planer', icon: 'CalendarRange', category: 'Arbeit' },
            },
            {
              name: 'sprints',
              list: '/sprints',
              meta: { label: 'Sprints', icon: 'Zap', category: 'Arbeit' },
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
            {
              name: 'conversations',
              list: '/inbox',
              show: '/inbox/:id',
              meta: { label: 'Inbox', icon: 'Inbox', category: 'Arbeit' },
            },
            {
              name: 'sources',
              list: '/sources',
              meta: { label: 'Quellen', icon: 'Plug', category: 'Admin' },
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
            {
              name: 'social_posts',
              list: '/social',
              create: '/social/create',
              edit: '/social/:id',
              meta: { label: 'Social Posts', icon: 'Megaphone', category: 'CRM' },
            },
            {
              name: 'products',
              list: '/produkte',
              create: '/produkte/create',
              edit: '/produkte/:id',
              meta: { label: 'Produkte', icon: 'Boxes', category: 'CRM' },
            },
            {
              name: 'industries',
              list: '/branchen',
              meta: { label: 'Branchen', icon: 'Building', category: 'CRM' },
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
                    <AppErrorBoundary>
                      <Outlet />
                    </AppErrorBoundary>
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
              <Route path="/planner" element={<TeamPlannerPage />} />
              <Route path="/sprints" element={<SprintsPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/personen" element={<TeamMembersListPage />} />
              <Route path="/auswertungen" element={<ReportsPage />} />
              <Route path="/inbox" element={<ConversationsListPage />} />
              <Route path="/inbox/:id" element={<ConversationDetailPage />} />
              <Route path="/sources" element={<SourcesPage />} />
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
              <Route path="/social" element={<SocialPostsListPage />} />
              <Route path="/social/create" element={<SocialPostCreatePage />} />
              <Route path="/social/:id" element={<SocialPostEditPage />} />
              <Route path="/produkte" element={<ProductsListPage />} />
              <Route path="/produkte/create" element={<ProductCreatePage />} />
              <Route path="/produkte/:id" element={<ProductEditPage />} />
              <Route path="/branchen" element={<IndustriesPage />} />
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
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Routes>
        </Refine>
        <Toaster richColors closeButton position="top-right" />
      </DevtoolsGate>
      </TooltipProvider>
    </BrowserRouter>
  );
}
