import { DynamicIcon } from 'lucide-react/dynamic';
import type { CSSProperties } from 'react';

import type { TrackerJsonld } from '@/api/types/tracker/Jsonld';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

type Props = {
  tracker: Row<TrackerJsonld> | null | undefined;
  /** "chip" = full label + icon, "icon" = icon-only (compact lists), "dot" = just colored dot */
  variant?: 'chip' | 'icon' | 'dot';
  className?: string;
};

/**
 * Render a Tracker (Bug / Feature / Story / Support / …) as a colored
 * pill — icon comes from the dynamic lucide loader so we don't ship
 * 1000 icons in the bundle. Renders nothing if the tracker is null
 * (workspaces that haven't opted into trackers leave tasks blank).
 *
 * The chip uses the tracker's color for the icon foreground and a
 * 12%-alpha tint of it for the background — gives every tracker a
 * recognizable hue without bringing six new colors into the SPA's
 * neutral grayscale UI.
 */
export function TrackerChip({ tracker, variant = 'chip', className }: Props) {
  if (!tracker) return null;
  const iconName = (tracker.icon ?? 'circle') as Parameters<typeof DynamicIcon>[0]['name'];
  const color = tracker.color ?? '#94a3b8';
  const tintStyle: CSSProperties = {
    color,
    backgroundColor: `${color}1f`, // ~12% alpha hex
    borderColor: `${color}40`,
  };

  if (variant === 'dot') {
    return (
      <span
        title={tracker.name}
        className={cn('inline-block size-2 shrink-0 rounded-full', className)}
        style={{ backgroundColor: color }}
      />
    );
  }

  if (variant === 'icon') {
    return (
      <span
        title={tracker.name}
        className={cn('inline-flex size-5 shrink-0 items-center justify-center rounded-md border', className)}
        style={tintStyle}
      >
        <DynamicIcon name={iconName} className="size-3" strokeWidth={2.25} />
      </span>
    );
  }

  return (
    <span
      title={tracker.name}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.7rem] font-medium',
        className,
      )}
      style={tintStyle}
    >
      <DynamicIcon name={iconName} className="size-3" strokeWidth={2.25} />
      {tracker.name}
    </span>
  );
}
