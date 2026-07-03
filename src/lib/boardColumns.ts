import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import type { Row } from '@/lib/refine';

/**
 * Persisted board-column configuration (stored in Workspace.settings.boardColumns).
 * A board column groups one or more TaskStatuses; dragging a card onto the column
 * moves it to {@link primaryStatusId} (the "primary" status of the group).
 */
export type BoardColumnConfig = {
  id: string; // stable client-generated id (droppable id)
  name: string;
  color?: string;
  statusIds: string[]; // TaskStatus @id IRIs grouped into this column
  primaryStatusId: string; // drop target status IRI
};

/** A column ready to render: statuses resolved to a fast lookup set. */
export type ResolvedColumn = {
  id: string;
  name: string;
  color: string;
  statusIris: Set<string>;
  primaryStatusIri: string;
};

const DEFAULT_COLOR = '#94a3b8';

/**
 * Turn the workspace status list + optional saved config into the columns to
 * render. With a config, each group becomes one column and any status NOT
 * covered by a group is appended as its own single-status column — so a task
 * can never become invisible because its status was left out of the config.
 * Without a config, we fall back to one column per status (the original board).
 */
export function resolveBoardColumns(
  statuses: Row<TaskStatusJsonld>[],
  config: BoardColumnConfig[] | null | undefined,
): ResolvedColumn[] {
  const ordered = statuses.filter((s) => Boolean(s['@id']));

  const single = (s: Row<TaskStatusJsonld>): ResolvedColumn => ({
    id: s['@id'] as string,
    name: s.name ?? '',
    color: s.color ?? DEFAULT_COLOR,
    statusIris: new Set([s['@id'] as string]),
    primaryStatusIri: s['@id'] as string,
  });

  if (!config || config.length === 0) {
    return ordered.map(single);
  }

  const byIri = new Map<string, Row<TaskStatusJsonld>>();
  for (const s of ordered) byIri.set(s['@id'] as string, s);

  const covered = new Set<string>();
  const cols: ResolvedColumn[] = [];
  for (const g of config) {
    const iris = (g.statusIds ?? []).filter((iri) => byIri.has(iri));
    if (iris.length === 0) continue;
    iris.forEach((iri) => covered.add(iri));
    cols.push({
      id: g.id,
      name: g.name,
      color: g.color ?? DEFAULT_COLOR,
      statusIris: new Set(iris),
      primaryStatusIri: byIri.has(g.primaryStatusId) ? g.primaryStatusId : iris[0],
    });
  }

  // Append any status not placed in a group so nothing is hidden.
  for (const s of ordered) {
    if (!covered.has(s['@id'] as string)) cols.push(single(s));
  }

  return cols;
}
