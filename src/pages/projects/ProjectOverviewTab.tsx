import { CalendarDays, Coins, Receipt, Timer, User2, Users } from 'lucide-react';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { CustomerJsonld } from '@/api/types/customer/Jsonld';
import type { Row } from '@/lib/refine';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Props = {
  project: Row<ProjectJsonld>;
  customer: Row<CustomerJsonld> | null;
};

function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

function formatHoursFromMinutes(min: number | null | undefined): string {
  if (min == null) return '—';
  const hours = Math.round((min / 60) * 10) / 10;
  return `${hours} h`;
}

export function ProjectOverviewTab({ project, customer }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Beschreibung</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
          {project.description?.trim() ? project.description : 'Keine Beschreibung hinterlegt.'}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eckdaten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <DataRow icon={<Users className="size-4" />} label="Kunde">
            {customer ? customer.name : '— Intern —'}
          </DataRow>
          <DataRow icon={<User2 className="size-4" />} label="Owner">
            {project.owner ? (
              <span className="font-mono text-xs text-muted-foreground">{project.owner.split('/').pop()}</span>
            ) : (
              '—'
            )}
          </DataRow>
          <DataRow icon={<CalendarDays className="size-4" />} label="Startet am">
            {formatDate(project.startsOn)}
          </DataRow>
          <DataRow icon={<CalendarDays className="size-4" />} label="Fällig am">
            {formatDate(project.dueOn)}
          </DataRow>
          <DataRow icon={<Timer className="size-4" />} label="Budget">
            {formatHoursFromMinutes(project.budgetMinutes)}
          </DataRow>
          <DataRow icon={<Coins className="size-4" />} label="Abrechnung">
            <div className="flex flex-wrap gap-2">
              {project.isBillableByDefault ? (
                <Badge variant="secondary" className="text-xs">abrechenbar (Default)</Badge>
              ) : (
                <Badge variant="outline" className="text-xs">nicht abrechenbar</Badge>
              )}
              {project.isRetainer ? (
                <Badge variant="outline" className="text-xs">Retainer</Badge>
              ) : null}
              {project.deductNonBillableHours ? (
                <Badge variant="outline" className="text-xs">Non-billable zieht Budget</Badge>
              ) : null}
            </div>
          </DataRow>
          <DataRow icon={<Receipt className="size-4" />} label="Mehrfach-Assignment">
            {project.isMultiAssignmentAllowed ? 'erlaubt' : 'gesperrt'}
          </DataRow>
        </CardContent>
      </Card>
    </div>
  );
}

function DataRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1 grid grid-cols-[8rem_1fr] gap-2">
        <div className="text-muted-foreground">{label}</div>
        <div className="text-foreground">{children}</div>
      </div>
    </div>
  );
}
