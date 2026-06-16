import { useList } from '@refinedev/core';
import { useMemo } from 'react';

import type { WorkflowTransitionJsonld } from '@/api/types/workflowTransition/Jsonld';
import type { Row } from '@/lib/refine';

/**
 * Workspace-wide directory of WorkflowTransition rules.
 *
 * The backend enforces the gate; this hook lets the SPA precompute
 * which status moves are valid for a given (tracker, fromStatus) pair
 * so the dropdown can grey out (or omit) the illegal options before
 * the user wastes a click.
 *
 * Default-open semantics mirror the backend:
 *   - No rows for the pair → every status is allowed.
 *   - Per-tracker rows shadow tracker=null baseline rows.
 *
 * Role-filtering is not done here — the SPA shows the structurally
 * legal moves regardless of the current user's role, and lets the
 * server bounce a forbidden move with a toast. Doing role-aware
 * filtering twice (here AND in WorkflowPolicy) would just risk drift.
 */
export function useWorkflowTransitions() {
  const { result, query } = useList<Row<WorkflowTransitionJsonld>>({
    resource: 'workflow_transitions',
    pagination: { mode: 'off' },
  });

  const all = result?.data ?? [];

  /**
   * Returns the set of `toStatus` IRIs reachable from `fromStatusIri`
   * for the given `trackerIri` (nullable).  When the workspace has
   * no rules for the pair, returns null — caller should treat that as
   * "no constraint, all statuses allowed".
   */
  const allowedToStatuses = useMemo(() => {
    return (
      trackerIri: string | null | undefined,
      fromStatusIri: string | null | undefined,
    ): Set<string> | null => {
      if (!fromStatusIri) return null;

      let rows = all.filter((t) => t.fromStatus === fromStatusIri);
      if (rows.length === 0) return null;

      const perTracker = rows.filter((t) => t.tracker && t.tracker === trackerIri);
      const baseline = rows.filter((t) => !t.tracker);
      const effective = perTracker.length > 0 ? perTracker : baseline;
      if (effective.length === 0) return null;

      return new Set(
        effective.map((t) => t.toStatus).filter((x): x is string => typeof x === 'string'),
      );
    };
  }, [all]);

  return { transitions: all, allowedToStatuses, isLoading: query.isLoading };
}
