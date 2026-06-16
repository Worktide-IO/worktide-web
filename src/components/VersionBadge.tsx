import { CheckCircle2, Lock, Tag } from 'lucide-react';

import type { ProjectVersionJsonld } from '@/api/types/projectVersion/Jsonld';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

type Props = {
  version: Row<ProjectVersionJsonld> | null | undefined;
  className?: string;
};

const STATUS_TONE: Record<string, string> = {
  open: 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  locked: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  closed: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

/**
 * "Fixed in version 1.2.0" chip — shown on tasks that have been
 * targeted at a Release. The icon switches by status so the user can
 * tell at a glance whether the release is still open for new work,
 * frozen for last-minute fixes, or already shipped.
 */
export function VersionBadge({ version, className }: Props) {
  if (!version) return null;
  const status = (version.status as string) ?? 'open';
  const Icon = status === 'closed' ? CheckCircle2 : status === 'locked' ? Lock : Tag;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.7rem] font-medium',
        STATUS_TONE[status] ?? STATUS_TONE.open,
        className,
      )}
      title={version.effectiveDate ? `Geplant für ${new Date(version.effectiveDate).toLocaleDateString()}` : version.name}
    >
      <Icon className="size-3" strokeWidth={2.25} />
      {version.name}
    </span>
  );
}
