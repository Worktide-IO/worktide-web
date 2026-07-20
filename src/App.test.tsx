import { describe, expect, it } from 'vitest';

/**
 * Architectural guard: every resource in the Refine `resources[]` array must
 * have a corresponding `<Route>` and vice versa. When you add a new page
 * update BOTH lists below. The test fails if they don't match, preventing
 * orphaned sidebar entries or dead routes.
 */
const RESOURCE_PATHS = new Set([
  '/',
  '/feedback',
  '/wall',
  '/projects',
  '/projects/create',
  '/projects/:id',
  '/projects/:id/edit',
  '/tasks',
  '/ki-agenten',
  '/time-entries',
  '/activity',
  '/calendar',
  '/planner',
  '/sprints',
  '/documents',
  '/personen',
  '/auswertungen',
  '/inbox',
  '/inbox/:id',
  '/sources',
  '/discovered',
  '/customers',
  '/customers/create',
  '/customers/:id',
  '/contacts',
  '/contacts/create',
  '/contacts/:id',
  '/customer-systems',
  '/customer-systems/create',
  '/customer-systems/:id',
  '/subscriptions',
  '/social',
  '/social/create',
  '/social/:id',
  '/produkte',
  '/produkte/create',
  '/produkte/:id',
  '/services',
  '/services/create',
  '/services/:id',
  '/branchen',
  '/newsletter',
  '/terminarten',
  '/formulare',
  '/buchungen',
  '/kalender-sync',
  '/abwesenheiten',
  '/research/missions',
  '/research/missions/create',
  '/research/missions/:id',
  '/research/leads',
  '/permissions',
  '/workflow',
  '/ki-kosten',
  '/webhooks',
  '/access-tokens',
  '/imports',
]);

const ROUTE_PATHS = new Set([
  '/',
  '/feedback',
  '/benachrichtigungen',
  '/wall',
  '/projects',
  '/projects/create',
  '/projects/:id',
  '/projects/:id/edit',
  '/tasks',
  '/ki-agenten',
  '/time-entries',
  '/activity',
  '/calendar',
  '/planner',
  '/sprints',
  '/documents',
  '/personen',
  '/auswertungen',
  '/inbox',
  '/inbox/:id',
  '/sources',
  '/discovered',
  '/customers',
  '/customers/create',
  '/customers/:id',
  '/contacts',
  '/contacts/create',
  '/contacts/:id',
  '/customer-systems',
  '/customer-systems/create',
  '/customer-systems/:id',
  '/subscriptions',
  '/social',
  '/social/create',
  '/social/:id',
  '/produkte',
  '/produkte/create',
  '/produkte/:id',
  '/services',
  '/services/create',
  '/services/:id',
  '/branchen',
  '/newsletter',
  '/terminarten',
  '/formulare',
  '/buchungen',
  '/kalender-sync',
  '/abwesenheiten',
  '/research/missions',
  '/research/missions/create',
  '/research/missions/:id',
  '/research/leads',
  '/permissions',
  '/workflow',
  '/ki-kosten',
  '/webhooks',
  '/access-tokens',
  '/imports',
]);

describe('route completeness', () => {
  it('every resource path has a matching Route', () => {
    const missing = [...RESOURCE_PATHS].filter((p) => !ROUTE_PATHS.has(p));
    expect(missing, `Resources without Route: ${missing.join(', ')}`).toEqual([]);
  });

  it('every Route path has a matching resource (excluding settings, auth, 404)', () => {
    const settings = ['/settings/profile', '/settings/security', '/settings/workspace', '/settings/time-tracking', '/settings/portal'];
    const auth = ['/login', '/setup', '/forgot-password', '/reset-password', '/accept-invitation', '/accept-project-share'];
    const ignored = new Set([...settings, ...auth, '/benachrichtigungen', '*']);

    const missing = [...ROUTE_PATHS].filter((p) => !RESOURCE_PATHS.has(p) && !ignored.has(p));
    expect(missing, `Routes without Resource: ${missing.join(', ')}`).toEqual([]);
  });
});
