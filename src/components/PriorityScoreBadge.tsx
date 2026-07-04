import { useQuery } from '@tanstack/react-query';
import { Gauge } from 'lucide-react';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

/** One ticket's computed priority signal, as returned by /reports/priority-scores. */
export type PriorityScoreEntry = {
  score: number;
  blocked: boolean;
  parts: { label: string; contribution: number }[];
};

/**
 * Shared fetch for the internal priority score. Keyed by project so a board
 * (one project) shares a single request across all its cards; the task list
 * omits `projectUuid` to score the whole workspace in one call. Either way the
 * result is a map of task-IRI → score entry.
 */
export function usePriorityScores(projectUuid?: string) {
  const { data } = useQuery({
    queryKey: ['priority-scores', projectUuid ?? 'workspace'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await api.get<{ scores: Record<string, PriorityScoreEntry> }>(
        '/reports/priority-scores',
        { params: projectUuid ? { project: projectUuid } : undefined },
      );
      return data.scores;
    },
  });
  const scores = data ?? {};
  return {
    scores,
    scoreFor: (iri?: string | null): PriorityScoreEntry | undefined =>
      iri ? scores[iri] : undefined,
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
