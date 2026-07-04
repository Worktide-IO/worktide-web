import { Gauge } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

/** One ticket's computed priority signal (materialized on the task server-side). */
export type PriorityScoreEntry = {
  score: number;
  blocked: boolean;
  parts: { label: string; contribution: number }[];
};

/** The stored priority-score fields on a task row. */
type ScoredTask = {
  priorityScore?: number | null;
  priorityScoreBlocked?: boolean;
  priorityScoreParts?: { label: string; contribution: number }[] | null;
};

/**
 * Build a score entry from the task's stored fields. Returns undefined when the
 * task has not been scored yet (worktide:priority:recompute hasn't run for it).
 */
export function scoreEntryFromTask(task: ScoredTask | undefined | null): PriorityScoreEntry | undefined {
  if (!task || task.priorityScore == null) return undefined;
  return {
    score: task.priorityScore,
    blocked: task.priorityScoreBlocked ?? false,
    parts: task.priorityScoreParts ?? [],
  };
}

function tone(score: number): string {
  return score >= 70
    ? 'text-red-600 dark:text-red-400'
    : score >= 40
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-muted-foreground';
}

function tooltip(entry: PriorityScoreEntry): string {
  return (
    `Prioritäts-Score ${entry.score}/100 (interner Rechenwert)` +
    (entry.blocked ? ' · blockiert' : '') +
    (entry.parts.length ? '\n' + entry.parts.map((p) => `${p.label}: +${p.contribution}`).join('\n') : '')
  );
}

/**
 * The internal priority-score badge — a computed signal that complements the
 * manual priority. Renders nothing when there is no score for the ticket.
 * `compact` drops the "Score" label for tight spots like board cards.
 */
export function PriorityScoreBadge({
  entry,
  compact = false,
  className,
}: {
  entry: PriorityScoreEntry | undefined;
  compact?: boolean;
  className?: string;
}) {
  if (!entry) return null;
  return (
    <Badge
      variant="outline"
      className={cn('cursor-help gap-1 text-[10px]', tone(entry.score), className)}
      title={tooltip(entry)}
    >
      <Gauge className="size-3" />
      {compact ? entry.score : <>Score {entry.score}</>}
    </Badge>
  );
}
