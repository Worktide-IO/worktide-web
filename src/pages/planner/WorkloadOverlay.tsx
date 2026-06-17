import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type WorkloadDay = {
  date: string;
  capacityMinutes: number;
  absenceMinutes: number;
  availableMinutes: number;
  trackedMinutes: number;
  utilization: number;
};

type WorkloadUser = {
  userId: string;
  days: WorkloadDay[];
};

type WorkloadResponse = {
  from: string;
  to: string;
  users: WorkloadUser[];
};

/**
 * Renders the capacity-utilisation strip that sits under each user's
 * avatar header on the Team-Planner. Reuses the existing
 * /v1/reports/workload endpoint — no new backend.
 *
 * The strip is a horizontal sequence of day-cells, one per visible
 * day in the planner's current range. Each cell is colour-coded by
 * utilisation:
 *   < 80%   → emerald  (good)
 *   80-100% → amber    (busy)
 *   > 100%  → red      (overbooked)
 *
 * Click on a cell fires `onDayClick(userIri, isoDate)` so a future
 * iteration can drill into the per-day TimeReport without the
 * planner having to know that endpoint exists.
 */
export function WorkloadOverlay({
  userIris,
  from,
  to,
  onDayClick,
}: {
  userIris: string[];
  from: Date;
  to: Date;
  onDayClick?: (userIri: string, isoDate: string) => void;
}) {
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const userIds = useMemo(
    () => userIris.map((iri) => iri.split('/').pop()).filter(Boolean).join(','),
    [userIris],
  );

  const { data } = useQuery({
    queryKey: ['planner-workload', fromIso, toIso, userIds],
    queryFn: async (): Promise<WorkloadResponse> => {
      const params: Record<string, string> = { from: fromIso, to: toIso };
      if (userIds) params.userIds = userIds;
      const { data } = await api.get<WorkloadResponse>('/reports/workload', { params });
      return data;
    },
    enabled: userIris.length > 0,
    staleTime: 30_000,
  });

  const byUser = useMemo(() => {
    const m: Record<string, WorkloadDay[]> = {};
    for (const u of data?.users ?? []) {
      m[`/v1/users/${u.userId}`] = u.days;
    }
    return m;
  }, [data]);

  return (
    <div className="space-y-0.5 px-1">
      {userIris.map((iri) => {
        const days = byUser[iri] ?? [];
        return (
          <div key={iri} className="flex items-center gap-px">
            {days.map((d) => {
              const tone = utilisationTone(d.utilization);
              return (
                <button
                  type="button"
                  key={`${iri}-${d.date}`}
                  className={cn(
                    'h-1.5 flex-1 transition-colors hover:opacity-80',
                    tone,
                  )}
                  title={`${d.date}: ${Math.round(d.trackedMinutes / 60 * 10) / 10}h / ${Math.round(d.availableMinutes / 60 * 10) / 10}h (${Math.round(d.utilization * 100)}%)`}
                  onClick={() => onDayClick?.(iri, d.date)}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Maps utilisation ratio to a Tailwind background-colour class.
 * The strip is muted on purpose — strong colours fight with the
 * calendar grid behind it. Use the tooltip for the exact numbers.
 */
function utilisationTone(util: number): string {
  if (util > 1.0) return 'bg-rose-500/70';
  if (util >= 0.8) return 'bg-amber-400/70';
  if (util > 0) return 'bg-emerald-500/60';
  return 'bg-muted/40';
}
