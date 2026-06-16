import { useList } from '@refinedev/core';
import { useMemo } from 'react';

import type { ProjectVersionJsonld } from '@/api/types/projectVersion/Jsonld';
import type { Row } from '@/lib/refine';

/**
 * Workspace-wide ProjectVersion directory (Releases).
 *
 * Returns every version the user can see in one shot — small table,
 * fetching once is cheaper than per-project lookups. Consumers narrow
 * to their project via the `byProject` map.
 *
 * Pass a `project` IRI to get back only that project's versions
 * (sorted by effectiveDate ascending so picker drop-downs read as a
 * timeline).
 */
export function useProjectVersions(project?: string | null) {
  const { result, query } = useList<Row<ProjectVersionJsonld>>({
    resource: 'project_versions',
    pagination: { mode: 'off' },
    sorters: [{ field: 'effectiveDate', order: 'asc' }],
  });

  const all = result?.data ?? [];

  const byIri = useMemo(() => {
    const map: Record<string, Row<ProjectVersionJsonld>> = {};
    for (const v of all) if (v['@id']) map[v['@id']] = v;
    return map;
  }, [all]);

  const byProject = useMemo(() => {
    const map: Record<string, Row<ProjectVersionJsonld>[]> = {};
    for (const v of all) {
      const p = v.project;
      if (!p) continue;
      (map[p] ||= []).push(v);
    }
    return map;
  }, [all]);

  const forProject = useMemo(
    () => (project ? byProject[project] ?? [] : []),
    [byProject, project],
  );

  return { versions: all, byIri, byProject, forProject, isLoading: query.isLoading };
}
