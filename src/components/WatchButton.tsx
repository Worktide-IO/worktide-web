import { Eye, EyeOff } from 'lucide-react';

import { useWatch, type WatchableTarget } from '@/hooks/useWatch';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Props = {
  target: WatchableTarget;
  targetId: string | null | undefined;
  /** Compact mode: icon-only, no count, smaller tap area — fits on cards. */
  variant?: 'default' | 'compact';
  className?: string;
};

/**
 * Eye-icon toggle subscribing the current user to a polymorphic target.
 *
 * Two visual modes:
 *   - default  – pill with icon + "Watching/Watch" + count
 *   - compact  – square icon-only button for task cards or row toolbars
 *
 * The count is workspace-scoped (shows total watchers regardless of who
 * I am). When I'm watching, the icon is filled-style; otherwise hollow.
 */
export function WatchButton({ target, targetId, variant = 'default', className }: Props) {
  const { watching, watchersCount, isLoading, toggle } = useWatch(target, targetId);
  const Icon = watching ? Eye : EyeOff;

  if (variant === 'compact') {
    return (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn('size-7', className)}
        disabled={isLoading || !targetId}
        onClick={(e) => {
          e.stopPropagation();
          void toggle();
        }}
        title={watching ? 'Beobachtung aufheben' : 'Beobachten'}
        aria-label={watching ? 'Beobachtung aufheben' : 'Beobachten'}
        aria-pressed={watching}
      >
        <Icon className={cn('size-4', watching && 'text-primary')} />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={watching ? 'default' : 'outline'}
      className={cn('gap-1.5', className)}
      disabled={isLoading || !targetId}
      onClick={() => void toggle()}
      aria-pressed={watching}
    >
      <Icon className="size-3.5" />
      {watching ? 'Beobachte' : 'Beobachten'}
      {watchersCount > 0 ? (
        <span className="ml-1 inline-flex items-center justify-center rounded-full bg-background/70 px-1.5 text-[10px] font-medium">
          {watchersCount}
        </span>
      ) : null}
    </Button>
  );
}
