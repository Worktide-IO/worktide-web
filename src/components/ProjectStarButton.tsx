import { Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useFavoriteProjects } from '@/hooks/useFavoriteProjects';
import { cn } from '@/lib/utils';

type Props = {
  projectId: string | null | undefined;
  /** "icon" = bare star button, "compact" = icon-only sm, "full" = with label. */
  variant?: 'icon' | 'compact' | 'full';
  className?: string;
};

/**
 * Star/unstar a project. Reads + writes via useFavoriteProjects which
 * shares its cache key across the whole SPA, so toggling here also
 * lights up the sidebar group + list column without any prop drilling.
 *
 * onClick stops propagation because the button sits inside a clickable
 * table row in ProjectsListPage — without that, every star click would
 * navigate away.
 */
export function ProjectStarButton({ projectId, variant = 'icon', className }: Props) {
  const { isFavorite, toggle } = useFavoriteProjects();
  const active = isFavorite(projectId);

  if (!projectId) return null;

  const handle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggle(projectId);
  };

  const label = active ? 'Favorit entfernen' : 'Als Favorit markieren';

  if (variant === 'full') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handle}
        aria-pressed={active}
        className={className}
      >
        <Star
          className={cn('size-4', active ? 'fill-amber-400 text-amber-500' : '')}
        />
        {active ? 'Favorit' : 'Favorisieren'}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size={variant === 'icon' ? 'icon' : 'sm'}
      onClick={handle}
      aria-label={label}
      aria-pressed={active}
      className={className}
    >
      <Star
        className={cn(
          'size-4 transition-colors',
          active ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground',
        )}
      />
    </Button>
  );
}
