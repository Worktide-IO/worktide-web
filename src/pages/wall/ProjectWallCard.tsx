import { Check } from 'lucide-react';
import { useNavigate } from 'react-router';

import { UserAvatarStack } from '@/components/UserAvatarStack';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { timeAgo } from '@/lib/time';

/** The minimal project shape The Wall read-model returns for a card. */
export type WallProject = {
  '@id': string;
  id: string;
  name: string;
  key: string;
  description: string | null;
  color: string;
  updatedAt: string | null;
  status: string;
  customer: { id: string; name: string } | null;
  totalTasks: number;
  openTasks: number;
  memberIris: string[];
};

type Props = {
  project: WallProject;
};

/**
 * Compact project tile shown on /wall.
 *
 * Visual hierarchy:
 *   - Color dot + project name top-left, key (mono) top-right
 *   - Customer name (or "intern") under the name
 *   - Progress bar showing closed-tasks / total-tasks ratio
 *   - Bottom row: team avatars left, "vor 2 h" updated-timestamp right
 *
 * Tasks count "closed / total" is the percentage; "0 von 0" reads as
 * "no tasks yet" rather than 100% which would be visually misleading.
 */
export function ProjectWallCard({ project }: Props) {
  const navigate = useNavigate();
  const { totalTasks, openTasks, customer, memberIris } = project;
  const closed = Math.max(0, totalTasks - openTasks);
  const pct = totalTasks > 0 ? (closed / totalTasks) * 100 : 0;

  return (
    <Card
      className="group cursor-pointer transition hover:shadow-md"
      onClick={() => project.id && navigate(`/projects/${project.id}`)}
    >
      <CardContent className="space-y-3 px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: project.color ?? '#6366f1' }}
            />
            <span className="truncate text-sm font-medium">{project.name}</span>
          </div>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {project.key}
          </span>
        </div>

        <div className="truncate text-xs text-muted-foreground">
          {customer ? customer.name : '— Intern —'}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Check className="size-3" /> {closed} / {totalTasks}
            </span>
            {totalTasks > 0 ? <span>{Math.round(pct)}%</span> : <span>keine Aufgaben</span>}
          </div>
          {totalTasks > 0 ? <Progress value={pct} className="h-1.5" /> : null}
        </div>

        <div className="flex items-center justify-between">
          <UserAvatarStack iris={memberIris} size="sm" max={4} />
          <span className="text-[10px] text-muted-foreground">{timeAgo(project.updatedAt ?? undefined)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
