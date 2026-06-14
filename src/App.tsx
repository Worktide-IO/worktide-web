import { Authenticated, Refine } from '@refinedev/core';
import { DevtoolsPanel, DevtoolsProvider } from '@refinedev/devtools';
import routerProvider, { NavigateToResource } from '@refinedev/react-router';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router';

import { Toaster } from '@/components/ui/sonner';
import { authProvider } from '@/providers/authProvider';
import { dataProvider } from '@/providers/dataProvider';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';

/**
 * Top-level wiring. Refine handles auth-gating + data-provider injection;
 * react-router 7 owns the URL → component mapping.
 *
 * Resources are registered here so Refine can compute navigation, default
 * action paths and breadcrumbs — but in v0 only "projects" is wired up.
 * As CRUD pages get built each entity (customers, contacts,
 * customer_systems, service_subscriptions, …) appears here and Refine
 * auto-generates its sidebar entry.
 */
export default function App() {
  return (
    <BrowserRouter>
      <DevtoolsProvider>
        <Refine
          dataProvider={dataProvider}
          authProvider={authProvider}
          routerProvider={routerProvider}
          resources={[
            {
              name: 'projects',
              list: '/projects',
              meta: { label: 'Projekte', canDelete: false },
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
                <Authenticated key="auth" fallback={<NavigateToResource resource="login" />}>
                  <Outlet />
                </Authenticated>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="/projects" element={<DashboardPage />} />
            </Route>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </Refine>
        <Toaster richColors closeButton position="top-right" />
        <DevtoolsPanel />
      </DevtoolsProvider>
    </BrowserRouter>
  );
}
