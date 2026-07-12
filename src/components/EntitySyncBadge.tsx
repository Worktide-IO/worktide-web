import { ExternalLink, Globe, Ticket, Webhook } from 'lucide-react';
import { intlLocale } from '@/lib/intl';
import { cn } from '@/lib/utils';

/**
 * Tiny logo-tinted chip that signals "this Worktide entity is
 * mirrored in <some external system>". Click opens the external
 * record in a new tab.
 *
 * Renders a compact icon-only variant for kanban cards (where
 * horizontal space is at a premium) and a full label-+-id variant
 * for the task detail sheet (where there's room to actually read
 * the external ID like "LW-403" or "#3537").
 */
type Props = {
  adapterCode: string;
  externalId: string;
  externalUrl?: string | null;
  /** Compact = icon only, full = icon + label + id chip */
  variant?: 'compact' | 'full';
  lastSyncedAt?: string | null;
  lastError?: string | null;
};

/**
 * Per-adapter brand info — Lucide doesn't ship Jira/Redmine logos,
 * so we render a coloured square with a short brand letter. The
 * hex colours match the vendor's own brand-page swatches: Jira
 * Atlassian blue, Redmine maroon-red, GitHub black, generic
 * webhook indigo. New ticket-systems extend this map.
 */
const BRAND: Record<string, { label: string; short: string; color: string; icon?: typeof Ticket }> = {
  redmine: { label: 'Redmine', short: 'R', color: '#b9180a' },
  jira: { label: 'Jira', short: 'J', color: '#0052cc' },
  jira_cloud: { label: 'Jira', short: 'J', color: '#0052cc' },
  github_issues: { label: 'GitHub', short: 'G', color: '#24292e' },
  gitlab_issues: { label: 'GitLab', short: 'L', color: '#fc6d26' },
  linear: { label: 'Linear', short: 'L', color: '#5e6ad2' },
  webhook_generic: { label: 'Webhook', short: '·', color: '#6366f1', icon: Webhook },
  email_imap: { label: 'E-Mail', short: '@', color: '#6b7280' },
  email_graph: { label: 'MS 365', short: 'M', color: '#0078d4' },
  email_gmail: { label: 'Gmail', short: 'G', color: '#ea4335' },
};

export function EntitySyncBadge({
  adapterCode,
  externalId,
  externalUrl,
  variant = 'compact',
  lastSyncedAt,
  lastError,
}: Props) {
  const brand = BRAND[adapterCode] ?? { label: adapterCode, short: '?', color: '#94a3b8' };
  const Icon = brand.icon ?? null;
  const title = [
    `${brand.label} · ${externalId}`,
    lastSyncedAt ? `Letzter Sync: ${new Date(lastSyncedAt).toLocaleString(intlLocale())}` : 'Noch nicht synchronisiert',
    lastError ? `Fehler: ${lastError}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  if (variant === 'compact') {
    const body = (
      <span
        className={cn(
          'inline-flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-white shadow-sm',
          lastError && 'ring-2 ring-destructive/60',
        )}
        style={{ backgroundColor: brand.color }}
        title={title}
        aria-label={`${brand.label} ${externalId}`}
      >
        {Icon ? <Icon className="size-3" /> : brand.short}
      </span>
    );
    return externalUrl ? (
      <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex">
        {body}
      </a>
    ) : (
      body
    );
  }

  // Full variant: icon + label + ID chip
  const inner = (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium',
        lastError ? 'border-destructive/60 text-destructive' : 'border-border text-foreground',
      )}
    >
      <span
        className="inline-flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-white"
        style={{ backgroundColor: brand.color }}
      >
        {Icon ? <Icon className="size-2.5" /> : brand.short}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground">{externalId}</span>
      {externalUrl ? <ExternalLink className="size-3 text-muted-foreground/60" /> : null}
    </span>
  );
  return externalUrl ? (
    <a
      href={externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex no-underline"
      title={title}
    >
      {inner}
    </a>
  ) : (
    <span title={title}>{inner}</span>
  );
}

/**
 * Brand stub for unknown adapters — used when the catalog hasn't
 * been updated to include a vendor yet. Falls back to a generic
 * Globe icon. Catalog-keepers see this and add a proper entry.
 */
export function UnknownAdapterBadge({ code }: { code: string }) {
  return (
    <span
      className="inline-flex size-5 items-center justify-center rounded bg-muted text-muted-foreground"
      title={`Unknown adapter: ${code}`}
    >
      <Globe className="size-3" />
    </span>
  );
}
