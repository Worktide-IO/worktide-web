import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';

import { api } from '@/lib/api';
import { intlLocale } from '@/lib/intl';
import { topicFor, useMercureTopic } from '@/lib/mercure';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type Absence = {
  startsOn: string;
  endsOn: string;
  type: string;
  availabilityPercent: number;
  description: string | null;
  sourceWorkspace: { id: string; name: string };
};

type CapacityMinutes = {
  mon: number;
  tue: number;
  wed: number;
  thu: number;
  fri: number;
  sat: number;
  sun: number;
};

type TeamMember = {
  user: { id: string; firstName: string; lastName: string };
  absences: Absence[];
  capacityMinutes: CapacityMinutes | null;
};

const TEAM_AVAILABILITY_KEY = ['dashboard', 'team-availability'] as const;

const ABSENCE_TYPE_LABEL: Record<string, string> = {
  vacation: 'Urlaub',
  sick: 'Krank',
  child_sick: 'Kind krank',
  personal: 'Persönlich',
  holiday: 'Feiertag',
  other: 'Sonstiges',
};

const FULL_WEEKLY_MINUTES = 2400; // 5 × 480

function userInitials(firstName: string, lastName: string): string {
  return ((firstName?.[0] ?? '') + (lastName?.[0] ?? '')).toUpperCase() || '?';
}

function userDisplayName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim() || 'Unbekannt';
}

function weeklyMinutes(cap: CapacityMinutes | null): number {
  if (!cap) return FULL_WEEKLY_MINUTES;
  return cap.mon + cap.tue + cap.wed + cap.thu + cap.fri + cap.sat + cap.sun;
}

function formatRange(startsOn: string, endsOn: string): string {
  const locale = intlLocale();
  const start = new Date(startsOn);
  const end = new Date(endsOn);
  return `${start.toLocaleDateString(locale, { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString(locale, { day: '2-digit', month: 'short' })}`;
}

function AbsenceTypeBadge({ type }: { type: string }) {
  const { t } = useTranslation();
  const variant: 'destructive' | 'secondary' | 'outline' =
    type === 'sick' ? 'destructive' : type === 'vacation' ? 'secondary' : 'outline';
  const label = t(`widget.team_availability.type_${type}`, ABSENCE_TYPE_LABEL[type] ?? type);
  return (
    <Badge variant={variant} className="text-[10px]">
      {label}
    </Badge>
  );
}

/**
 * "Mitarbeiter-Verfügbarkeit" — shows team members of the current workspace
 * who have limited availability (absences from ANY of their workspaces, or
 * reduced UserCapacity). Cross-workspace: absences recorded in other workspaces
 * appear with a source-workspace badge.
 */
export function TeamAvailabilityWidget() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: TEAM_AVAILABILITY_KEY,
    queryFn: async () => {
      const { data } = await api.get<{ members: TeamMember[]; capped: boolean }>(
        '/dashboard/team-availability',
      );
      return data;
    },
  });

  // Live: refetch when absences or users change.
  useMercureTopic(topicFor('absences'), {
    onMessage: () => void queryClient.invalidateQueries({ queryKey: TEAM_AVAILABILITY_KEY }),
  });
  useMercureTopic(topicFor('users'), {
    onMessage: () => void queryClient.invalidateQueries({ queryKey: TEAM_AVAILABILITY_KEY }),
  });

  const members = query.data?.members ?? [];

  // Sort: most limited first (fewer weekly minutes = more limited).
  const sorted = useMemo(
    () =>
      [...members].sort((a, b) => {
        // Members with active absences first.
        const aHasAbsence = a.absences.length > 0 ? 0 : 1;
        const bHasAbsence = b.absences.length > 0 ? 0 : 1;
        if (aHasAbsence !== bHasAbsence) return aHasAbsence - bHasAbsence;
        // Then by capacity (ascending = most limited first).
        return weeklyMinutes(a.capacityMinutes) - weeklyMinutes(b.capacityMinutes);
      }),
    [members],
  );

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4 text-muted-foreground" />
          {t('widget.team_availability.label')}
          {members.length > 0 ? (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {members.length}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[calc(100%-3rem)] overflow-y-auto px-2 pb-2">
        {query.isLoading ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-5/6" />
            <Skeleton className="h-14 w-4/5" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {t('widget.team_availability.empty')}
          </p>
        ) : (
          <ul className="divide-y">
            {sorted.map((m) => {
              const initials = userInitials(m.user.firstName, m.user.lastName);
              const name = userDisplayName(m.user.firstName, m.user.lastName);
              const cap = weeklyMinutes(m.capacityMinutes);
              const capacityPercent = Math.round((cap / FULL_WEEKLY_MINUTES) * 100);
              const isReduced = cap < FULL_WEEKLY_MINUTES;

              return (
                <li key={m.user.id} className="py-2 px-2">
                  <div className="flex items-start gap-2.5">
                    <Avatar size="sm">
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{name}</span>
                        {isReduced && !m.absences.length ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {capacityPercent}%
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t('widget.team_availability.capacity_hint', {
                                minutes: cap,
                                defaultValue: `${cap} Min./Woche`,
                              })}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>

                      {m.absences.length > 0 ? (
                        <div className="space-y-1">
                          {m.absences.map((abs, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 text-xs">
                              <AbsenceTypeBadge type={abs.type} />
                              <span className="text-muted-foreground">
                                {formatRange(abs.startsOn, abs.endsOn)}
                              </span>
                              {abs.availabilityPercent > 0 ? (
                                <span className="text-muted-foreground">
                                  · {abs.availabilityPercent}%
                                </span>
                              ) : null}
                              {abs.sourceWorkspace.id !== '' ? (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] px-1 py-0 h-4"
                                    >
                                      {abs.sourceWorkspace.name}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t('widget.team_availability.source_workspace', {
                                      name: abs.sourceWorkspace.name,
                                      defaultValue: `Erfasst in ${abs.sourceWorkspace.name}`,
                                    })}
                                  </TooltipContent>
                                </Tooltip>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {isReduced && m.capacityMinutes ? (
                        <div className="flex items-center gap-2">
                          <Progress
                            value={capacityPercent}
                            className="h-1.5 flex-1"
                          />
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {cap} min
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
