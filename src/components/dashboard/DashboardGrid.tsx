import { X } from 'lucide-react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout/legacy';

import type { DashboardLayout } from '@/lib/dashboard';
import { GRID_COLS, GRID_ROW_HEIGHT, fromRglLayout, toRglLayout } from '@/lib/dashboard';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

import { WIDGET_REGISTRY } from './registry';

import 'react-grid-layout/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

type Props = {
  layout: DashboardLayout;
  editing: boolean;
  onLayoutChange: (next: DashboardLayout) => void;
  onRemoveWidget: (instanceId: string) => void;
};

/**
 * react-grid-layout wrapper that drives off our DashboardLayout shape.
 *
 * Two render modes:
 *  - read mode: drag/resize disabled, widgets render their normal UI
 *  - edit mode: grab-cursor, resize handles visible, X-button to remove
 *
 * Layout changes are forwarded as our own DashboardLayout (mapped back
 * from RGL's x/y/w/h via fromRglLayout). The parent owns persistence
 * via useDashboardLayout().
 *
 * Unknown widget keys (e.g. registry entry removed after an old layout
 * was saved) render nothing instead of crashing the grid.
 */
export function DashboardGrid({ layout, editing, onLayoutChange, onRemoveWidget }: Props) {
  const visibleWidgets = layout.widgets.filter((w) => WIDGET_REGISTRY[w.key]);

  return (
    <ResponsiveGridLayout
      className={cn('dashboard-grid', editing && 'dashboard-grid--editing')}
      layouts={{ lg: toRglLayout(layout), xxs: toRglLayout(layout) }}
      cols={{ lg: GRID_COLS, xxs: 1 }}
      breakpoints={{ lg: 880, xxs: 0 }}
      rowHeight={GRID_ROW_HEIGHT}
      margin={[16, 16]}
      isDraggable={editing}
      isResizable={editing}
      draggableCancel=".widget-no-drag"
      // Persist ONLY on user-driven move/resize. onLayoutChange would
      // also fire on responsive breakpoint flips (compactor rewrites
      // x/y to fit narrower columns), so listening to it overwrites the
      // canonical wide layout with a mobile collapse.
      onDragStop={(next: Layout) => onLayoutChange(fromRglLayout(layout, next))}
      onResizeStop={(next: Layout) => onLayoutChange(fromRglLayout(layout, next))}
    >
      {visibleWidgets.map((w) => {
        const def = WIDGET_REGISTRY[w.key]!;
        const Component = def.Component;
        return (
          <div key={w.instanceId} className="relative">
            {editing ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="widget-no-drag absolute right-2 top-2 z-10 size-6 rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveWidget(w.instanceId);
                }}
                aria-label={`${def.label} entfernen`}
              >
                <X className="size-3" />
              </Button>
            ) : null}
            <Component instanceId={w.instanceId} />
          </div>
        );
      })}
    </ResponsiveGridLayout>
  );
}
