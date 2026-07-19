import { Authenticated, Refine, useParsed } from '@refinedev/core';
import { DevtoolsPanel, DevtoolsProvider } from '@refinedev/devtools';
import routerProvider from '@refinedev/react-router';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';

import i18n from '@/i18n';
import { i18nProvider } from '@/i18n/refine';
import { resolveDocumentTitle } from '@/lib/documentTitle';
import { useActiveLocale } from '@/lib/languages';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AppLayout } from '@/components/AppLayout';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { authProvider } from '@/providers/authProvider';
import { BrandingProvider } from '@/providers/BrandingProvider';
import { dataProvider } from '@/providers/dataProvider';
import { LoginPage } from '@/pages/LoginPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { AcceptInvitationPage } from '@/pages/AcceptInvitationPage';
import { AcceptProjectSharePage } from '@/pages/AcceptProjectSharePage';
import { SetupWizardPage } from '@/pages/setup/SetupWizardPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ActivityPage } from '@/pages/activity/ActivityPage';
import { CalendarPage } from '@/pages/calendar/CalendarPage';
import { ImportPage } from '@/pages/imports/ImportPage';
import { AccessTokensPage } from '@/pages/access-tokens/AccessTokensPage';
import { DocumentsPage } from '@/pages/documents/DocumentsPage';
import { PermissionsMatrixPage } from '@/pages/permissions/PermissionsMatrixPage';
import { WorkflowEditorPage } from '@/pages/workflow/WorkflowEditorPage';
import { AiCostDashboardPage } from '@/pages/ai-costs/AiCostDashboardPage';
import { ConversationDetailPage } from '@/pages/inbox/ConversationDetailPage';
import { ConversationsListPage } from '@/pages/inbox/ConversationsListPage';
import { TeamPlannerPage } from '@/pages/planner/TeamPlannerPage';
import { SprintsPage } from '@/pages/sprints/SprintsPage';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { SourcesPage } from '@/pages/sources/SourcesPage';
import { DiscoveredRecordsPage } from '@/pages/discovered/DiscoveredRecordsPage';
import { TeamMembersListPage } from '@/pages/team-members/TeamMembersListPage';
import { ContactCreatePage } from '@/pages/contacts/ContactCreatePage';
import { ContactEditPage } from '@/pages/contacts/ContactEditPage';
import { ContactsListPage } from '@/pages/contacts/ContactsListPage';
import { ResearchMissionsListPage } from '@/pages/research/ResearchMissionsListPage';
import { ResearchMissionCreatePage } from '@/pages/research/ResearchMissionCreatePage';
import { ResearchMissionDetailPage } from '@/pages/research/ResearchMissionDetailPage';
import { LeadsListPage } from '@/pages/research/LeadsListPage';
import { CustomerSystemCreatePage } from '@/pages/customer-systems/CustomerSystemCreatePage';
import { CustomerSystemEditPage } from '@/pages/customer-systems/CustomerSystemEditPage';
import { CustomerSystemsListPage } from '@/pages/customer-systems/CustomerSystemsListPage';
import { CustomersListPage } from '@/pages/customers/CustomersListPage';
import { CustomerCreatePage } from '@/pages/customers/CustomerCreatePage';
import { CustomerDetailPage } from '@/pages/customers/CustomerDetailPage';
import { SubscriptionsListPage } from '@/pages/subscriptions/SubscriptionsListPage';
import { ProjectCreatePage } from '@/pages/projects/ProjectCreatePage';
import { ProjectDetailPage } from '@/pages/projects/ProjectDetailPage';
import { ProjectEditPage } from '@/pages/projects/ProjectEditPage';
import { ProjectsListPage } from '@/pages/projects/ProjectsListPage';
import { PortalSettingsPage } from '@/pages/settings/PortalSettingsPage';
import { ProfileSettingsPage } from '@/pages/settings/ProfileSettingsPage';
import { SecuritySettingsPage } from '@/pages/settings/SecuritySettingsPage';
import { TimeTrackingSettingsPage } from '@/pages/settings/TimeTrackingSettingsPage';
import { WorkspaceSettingsPage } from '@/pages/settings/WorkspaceSettingsPage';
import { WallPage } from '@/pages/wall/WallPage';
import { SocialPostsListPage } from '@/pages/social/SocialPostsListPage';
import { SocialPostCreatePage } from '@/pages/social/SocialPostCreatePage';
import { SocialPostEditPage } from '@/pages/social/SocialPostEditPage';
import { ProductsListPage } from '@/pages/products/ProductsListPage';
import { ProductCreatePage } from '@/pages/products/ProductCreatePage';
import { ProductEditPage } from '@/pages/products/ProductEditPage';
import { ServicesListPage } from '@/pages/services/ServicesListPage';
import { ServiceCreatePage } from '@/pages/services/ServiceCreatePage';
import { ServiceEditPage } from '@/pages/services/ServiceEditPage';
import { IndustriesPage } from '@/pages/industries/IndustriesPage';
import { NewslettersPage } from '@/pages/newsletters/NewslettersPage';
import { FeedbackBoardPage } from '@/pages/feedback/FeedbackBoardPage';
import { MeetingTypesPage } from '@/pages/meetings/MeetingTypesPage';
import { FormsPage } from '@/pages/forms/FormsPage';
import { BookingsPage } from '@/pages/meetings/BookingsPage';
import { CalendarSyncPage } from '@/pages/meetings/CalendarSyncPage';
import { AbsencesPage } from '@/pages/AbsencesPage';
import { TasksListPage } from '@/pages/tasks/TasksListPage';
import { TimeEntriesListPage } from '@/pages/timeEntries/TimeEntriesListPage';
import { AiAgentsOverviewPage } from '@/pages/ai-agents/AiAgentsOverviewPage';
import { NotificationsListPage } from '@/pages/notifications/NotificationsListPage';

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

/** Keeps i18next's active language in sync with the user's stored preference. */
function LocaleSync() {
  const locale = useActiveLocale();
  useEffect(() => {
    void i18n.changeLanguage(locale);
  }, [locale]);
  return null;
}

/**
 * Sets the browser tab title per route (see lib/documentTitle.ts). We resolve
 * the title ourselves from Refine's current resource (whose ORIGINAL meta.label
 * is the `nav.*` i18n key) — the built-in <DocumentTitleHandler> rewrites that
 * label before handing it over, so it can't be used here. Re-runs on locale
 * change so the title tracks DE/EN.
 */
function RouteTitle() {
  const { resource, pathname } = useParsed();
  const locale = useActiveLocale();
  useEffect(() => {
    document.title = resolveDocumentTitle({ resource, pathname });
  }, [resource, pathname, locale]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <BrandingProvider>
      <TooltipProvider delayDuration={300}>
      <DevtoolsGate>
        <LocaleSync />
        <Refine
          dataProvider={dataProvider}
          authProvider={authProvider}
          routerProvider={routerProvider}
          i18nProvider={i18nProvider}
          resources={[
            // ---- Arbeit ----------------------------------------------------
            {
              name: 'dashboard',
              list: '/',
              meta: { label: 'nav.dashboard', icon: 'Gauge', category: 'Arbeit' },
            },
            {
              name: 'feedback',
              list: '/feedback',
              meta: { label: 'nav.feedback', icon: 'MessageSquarePlus', category: 'App' },
            },
            {
              name: 'wall',
              list: '/wall',
              meta: { label: 'nav.wall', icon: 'LayoutDashboard', category: 'Arbeit' },
            },
            {
              name: 'projects',
              list: '/projects',
              create: '/projects/create',
              edit: '/projects/:id/edit',
              show: '/projects/:id',
              meta: { label: 'nav.projects', icon: 'FolderKanban', category: 'Arbeit' },
            },
            {
              name: 'tasks',
              list: '/tasks',
              meta: { label: 'nav.tasks', icon: 'CheckSquare', category: 'Arbeit' },
            },
            {
              name: 'ai_agents',
              list: '/ki-agenten',
              meta: { label: 'nav.ai_agents', icon: 'Sparkles', category: 'Arbeit' },
            },
            {
              name: 'time_entries',
              list: '/time-entries',
              meta: { label: 'nav.time_entries', icon: 'Clock', category: 'Arbeit' },
            },
            {
              name: 'activity',
              list: '/activity',
              meta: { label: 'nav.activity', icon: 'Activity', category: 'Arbeit' },
            },
            {
              name: 'calendar',
              list: '/calendar',
              meta: { label: 'nav.calendar', icon: 'CalendarDays', category: 'Arbeit' },
            },
            {
              name: 'planner',
              list: '/planner',
              meta: { label: 'nav.planner', icon: 'CalendarRange', category: 'Arbeit' },
            },
            {
              name: 'sprints',
              list: '/sprints',
              meta: { label: 'nav.sprints', icon: 'Zap', category: 'Arbeit' },
            },
            {
              name: 'documents',
              list: '/documents',
              meta: { label: 'nav.documents', icon: 'FileText', category: 'Arbeit' },
            },
            {
              name: 'team_members',
              list: '/personen',
              meta: { label: 'nav.team_members', icon: 'Users', category: 'Admin' },
            },
            {
              name: 'reports',
              list: '/auswertungen',
              meta: { label: 'nav.reports', icon: 'BarChart3', category: 'Arbeit' },
            },
            {
              name: 'conversations',
              list: '/inbox',
              show: '/inbox/:id',
              meta: { label: 'nav.conversations', icon: 'Inbox', category: 'Arbeit' },
            },
            {
              name: 'sources',
              list: '/sources',
              meta: { label: 'nav.sources', icon: 'Plug', category: 'Admin' },
            },
            {
              name: 'discovered_external_records',
              list: '/discovered',
              meta: { label: 'nav.discovered_records', icon: 'PackageSearch', category: 'Admin' },
            },

            // ---- CRM -------------------------------------------------------
            {
              name: 'customers',
              list: '/customers',
              create: '/customers/create',
              edit: '/customers/:id',
              show: '/customers/:id',
              meta: { label: 'nav.customers', icon: 'Building2', category: 'CRM' },
            },
            {
              name: 'contacts',
              list: '/contacts',
              create: '/contacts/create',
              edit: '/contacts/:id',
              meta: { label: 'nav.contacts', icon: 'Contact', category: 'CRM' },
            },
            {
              name: 'customer_systems',
              list: '/customer-systems',
              create: '/customer-systems/create',
              edit: '/customer-systems/:id',
              meta: { label: 'nav.customer_systems', icon: 'Server', category: 'CRM' },
            },
            {
              name: 'service_subscriptions',
              list: '/subscriptions',
              meta: { label: 'nav.service_subscriptions', icon: 'Receipt', category: 'CRM' },
            },
            {
              name: 'services',
              list: '/services',
              create: '/services/create',
              edit: '/services/:id',
              meta: { label: 'nav.services', icon: 'ConciergeBell', category: 'CRM' },
            },
            {
              name: 'social_posts',
              list: '/social',
              create: '/social/create',
              edit: '/social/:id',
              meta: { label: 'nav.social_posts', icon: 'Megaphone', category: 'CRM' },
            },
            {
              name: 'products',
              list: '/produkte',
              create: '/produkte/create',
              edit: '/produkte/:id',
              meta: { label: 'nav.products', icon: 'Boxes', category: 'CRM' },
            },
            {
              name: 'industries',
              list: '/branchen',
              meta: { label: 'nav.industries', icon: 'Building', category: 'CRM' },
            },
            {
              name: 'newsletters',
              list: '/newsletter',
              meta: { label: 'nav.newsletters', icon: 'Mail', category: 'CRM' },
            },
            {
              name: 'meeting_types',
              list: '/terminarten',
              meta: { label: 'nav.meeting_types', icon: 'CalendarClock', category: 'CRM' },
            },
            {
              name: 'public_forms',
              list: '/formulare',
              meta: { label: 'nav.forms', icon: 'ClipboardList', category: 'CRM' },
            },
            {
              name: 'bookings',
              list: '/buchungen',
              meta: { label: 'nav.bookings', icon: 'CalendarDays', category: 'CRM' },
            },
            {
              name: 'staff_calendar_connections',
              list: '/kalender-sync',
              meta: { label: 'nav.staff_calendar_connections', icon: 'RefreshCw', category: 'CRM' },
            },
            {
              name: 'absences',
              list: '/abwesenheiten',
              meta: { label: 'nav.absences', icon: 'CalendarOff', category: 'CRM' },
            },
            {
              name: 'research_missions',
              list: '/research/missions',
              create: '/research/missions/create',
              show: '/research/missions/:id',
              meta: { label: 'nav.research_missions', icon: 'Compass', category: 'CRM' },
            },
            {
              name: 'leads',
              list: '/research/leads',
              meta: { label: 'nav.leads', icon: 'Target', category: 'CRM' },
            },

            // ---- Admin -----------------------------------------------------
            {
              name: 'role_permission_overrides',
              list: '/permissions',
              meta: { label: 'nav.role_permission_overrides', icon: 'Shield', category: 'Admin' },
            },
            {
              name: 'workflow_transitions',
              list: '/workflow',
              meta: { label: 'nav.workflow', icon: 'Workflow', category: 'Admin' },
            },
            {
              name: 'ai_costs',
              list: '/ki-kosten',
              meta: { label: 'nav.ai_costs', icon: 'Coins', category: 'Admin' },
            },
            {
              name: 'webhooks',
              list: '/webhooks',
              meta: { label: 'nav.webhooks', icon: 'Webhook', category: 'Admin' },
            },
            {
              name: 'personal_access_tokens',
              list: '/access-tokens',
              meta: { label: 'nav.personal_access_tokens', icon: 'KeyRound', category: 'Admin' },
            },
            {
              name: 'imports',
              list: '/imports',
              meta: { label: 'nav.imports', icon: 'Upload', category: 'Admin' },
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
                <Authenticated
                  key="auth"
                  fallback={<Navigate to="/login" replace />}
                  loading={
                    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
                      {i18n.t('app.loading')}
                    </div>
                  }
                >
                  <AppLayout>
                    <AppErrorBoundary>
                      <Outlet />
                    </AppErrorBoundary>
                  </AppLayout>
                </Authenticated>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="/feedback" element={<FeedbackBoardPage />} />
              <Route path="/benachrichtigungen" element={<NotificationsListPage />} />
              <Route path="/wall" element={<WallPage />} />
              <Route path="/projects" element={<ProjectsListPage />} />
              <Route path="/projects/create" element={<ProjectCreatePage />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
              <Route path="/projects/:id/edit" element={<ProjectEditPage />} />
              <Route path="/tasks" element={<TasksListPage />} />
              <Route path="/ki-agenten" element={<AiAgentsOverviewPage />} />
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
              <Route path="/discovered" element={<DiscoveredRecordsPage />} />
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
              <Route path="/social" element={<SocialPostsListPage />} />
              <Route path="/social/create" element={<SocialPostCreatePage />} />
              <Route path="/social/:id" element={<SocialPostEditPage />} />
              <Route path="/produkte" element={<ProductsListPage />} />
              <Route path="/produkte/create" element={<ProductCreatePage />} />
              <Route path="/produkte/:id" element={<ProductEditPage />} />
              <Route path="/services" element={<ServicesListPage />} />
              <Route path="/services/create" element={<ServiceCreatePage />} />
              <Route path="/services/:id" element={<ServiceEditPage />} />
              <Route path="/branchen" element={<IndustriesPage />} />
              <Route path="/newsletter" element={<NewslettersPage />} />
              <Route path="/terminarten" element={<MeetingTypesPage />} />
              <Route path="/formulare" element={<FormsPage />} />
              <Route path="/buchungen" element={<BookingsPage />} />
              <Route path="/kalender-sync" element={<CalendarSyncPage />} />
              <Route path="/abwesenheiten" element={<AbsencesPage />} />
              <Route path="/research/missions" element={<ResearchMissionsListPage />} />
              <Route path="/research/missions/create" element={<ResearchMissionCreatePage />} />
              <Route path="/research/missions/:id" element={<ResearchMissionDetailPage />} />
              <Route path="/research/leads" element={<LeadsListPage />} />
              <Route path="/permissions" element={<PermissionsMatrixPage />} />
              <Route path="/workflow" element={<WorkflowEditorPage />} />
              <Route path="/ki-kosten" element={<AiCostDashboardPage />} />
              <Route path="/webhooks" element={<PlaceholderPage resource="webhooks" />} />
              <Route path="/access-tokens" element={<AccessTokensPage />} />
              <Route path="/imports" element={<ImportPage />} />
              <Route path="/settings/profile" element={<ProfileSettingsPage />} />
              <Route path="/settings/security" element={<SecuritySettingsPage />} />
              <Route path="/settings/workspace" element={<WorkspaceSettingsPage />} />
              <Route path="/settings/time-tracking" element={<TimeTrackingSettingsPage />} />
              <Route path="/settings/portal" element={<PortalSettingsPage />} />
              {/* Unknown authenticated route → branded 404 inside the shell. */}
              <Route path="*" element={<NotFoundPage />} />
            </Route>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<SetupWizardPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
            <Route path="/accept-project-share" element={<AcceptProjectSharePage />} />
          </Routes>
          <RouteTitle />
        </Refine>
        <Toaster richColors closeButton position="top-right" />
      </DevtoolsGate>
      </TooltipProvider>
      </BrandingProvider>
    </BrowserRouter>
  );
}
