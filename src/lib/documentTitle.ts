import type { IResourceItem } from '@refinedev/core';

import i18n from '@/i18n';
import { readCachedBranding } from '@/lib/branding';

/**
 * Resolves the browser tab title (`document.title`) for the current route,
 * called by the <RouteTitle> component in App.tsx. The bulk of the pages are
 * Refine resources — their translated `meta.label` (a `nav.*` i18n key) becomes
 * the title. The handful of non-resource routes (settings, notifications) map
 * their pathname to an existing i18n key here.
 *
 * Format: `"<page> · <brand>"`, falling back to just the brand name for pages
 * without a known label (auth screens, 404). The brand name is read from the
 * applied branding so a white-labelled instance shows its own name.
 */

/** Non-resource routes → i18n key for their page title. */
const PATH_TITLE_KEYS: Record<string, string> = {
  '/benachrichtigungen': 'notifications.title',
  '/settings/profile': 'profile.heading',
  '/settings/security': 'pagetitle.security',
  '/settings/workspace': 'workspace_switcher.settings',
  '/settings/time-tracking': 'tt_settings.heading',
  '/settings/portal': 'portal_settings.title',
};

export function resolveDocumentTitle(opts: {
  resource?: IResourceItem;
  pathname?: string;
}): string {
  const brand = readCachedBranding().name || 'Worktide';

  const labelKey =
    (opts.resource?.meta?.label as string | undefined) ??
    (opts.pathname ? PATH_TITLE_KEYS[opts.pathname] : undefined);
  if (!labelKey) return brand;

  const label = i18n.t(labelKey);
  // i18next returns the key itself when it has no translation → treat as unknown.
  if (!label || label === labelKey) return brand;

  return `${label} · ${brand}`;
}
