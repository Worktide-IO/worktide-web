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
import { CustomersListPage } from '@/pages/customers/CustomersListPage';
import { CustomerCreatePage } from '@/pages/customers/CustomerCreatePage';
import { CustomerEditPage } from '@/pages/customers/CustomerEditPage';
import { ProjectsListPage } from '@/pages/projects/ProjectsListPage';
import { TasksListPage } from '@/pages/tasks/TasksListPage';

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
              name: 'projects',
              list: '/projects',
              meta: { label: 'Projekte', icon: 'FolderKanban', category: 'Arbeit', canDelete: false },
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
              name: 'documents',
              list: '/documents',
              meta: { label: 'Dokumente', icon: 'FileText', category: 'Arbeit' },
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
              meta: { label: 'Kontakte', icon: 'Contact', category: 'CRM' },
            },
            {
              name: 'customer_systems',
              list: '/customer-systems',
              meta: { label: 'Systeme', icon: 'Server', category: 'CRM' },
            },
            {
              name: 'service_subscriptions',
              list: '/subscriptions',
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
              <Route path="/projects" element={<ProjectsListPage />} />
              <Route path="/tasks" element={<TasksListPage />} />
              {/* Until each resource has its own page, the placeholder
                  acknowledges the navigation without breaking the layout. */}
              <Route path="/time-entries" element={<PlaceholderPage resource="time_entries" />} />
              <Route path="/documents" element={<PlaceholderPage resource="documents" />} />
              <Route path="/customers" element={<CustomersListPage />} />
              <Route path="/customers/create" element={<CustomerCreatePage />} />
              <Route path="/customers/:id" element={<CustomerEditPage />} />
              <Route path="/contacts" element={<PlaceholderPage resource="contacts" />} />
              <Route path="/customer-systems" element={<PlaceholderPage resource="customer_systems" />} />
              <Route path="/subscriptions" element={<PlaceholderPage resource="service_subscriptions" />} />
              <Route path="/workspace-members" element={<PlaceholderPage resource="workspace_members" />} />
              <Route path="/permissions" element={<PlaceholderPage resource="role_permission_overrides" />} />
              <Route path="/webhooks" element={<PlaceholderPage resource="webhooks" />} />
              <Route path="/access-tokens" element={<PlaceholderPage resource="personal_access_tokens" />} />
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
