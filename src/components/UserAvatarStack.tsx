import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { userDisplayName, userInitials, useUserDirectory } from '@/hooks/useUserDirectory';
import { cn } from '@/lib/utils';

type Size = 'sm' | 'default' | 'lg';

type Props = {
  /** IRIs of users to render, in display order. */
  iris: string[] | null | undefined;
  /** Max number of avatar bubbles before collapsing into "+N". Default: 3. */
  max?: number;
  /** Avatar size — matches shadcn `<Avatar size="...">`. */
  size?: Size;
  /** Extra classes on the wrapping group. */
  className?: string;
};

/**
 * Overlapping avatar stack for "who's assigned to this task / project".
 *
 * Resolves user IRIs through the shared `useUserDirectory()` cache — so
 * rendering 20 task cards with 3 assignees each still costs just one
 * /v1/users fetch. Beyond `max`, the rest collapse into a "+N" pill
 * with a tooltip listing the hidden names.
 *
 * Unknown IRIs (user left the workspace, stale cache) render as a "?"
 * fallback instead of disappearing — keeps the visual count honest.
 */
export function UserAvatarStack({ iris, max = 3, size = 'default', className }: Props) {
  const { byIri } = useUserDirectory();
  const list = (iris ?? []).filter(Boolean);

  if (list.length === 0) {
    return (
      <span
        className={cn('text-xs text-muted-foreground/70', className)}
        aria-label="Niemand zugewiesen"
      >
        —
      </span>
    );
  }

  const visible = list.slice(0, max);
  const overflow = list.slice(max);

  return (
    <AvatarGroup className={className} data-size={size}>
      {visible.map((iri) => {
        const u = byIri[iri];
        const name = u ? userDisplayName(u) : 'Unbekannt';
        return (
          <Tooltip key={iri}>
            <TooltipTrigger asChild>
              <Avatar size={size}>
                <AvatarFallback>{u ? userInitials(u) : '?'}</AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>{name}</TooltipContent>
          </Tooltip>
        );
      })}
      {overflow.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <AvatarGroupCount data-size={size}>+{overflow.length}</AvatarGroupCount>
          </TooltipTrigger>
          <TooltipContent>
            <ul className="text-xs">
              {overflow.map((iri) => (
                <li key={iri}>{byIri[iri] ? userDisplayName(byIri[iri]) : 'Unbekannt'}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </AvatarGroup>
  );
}
