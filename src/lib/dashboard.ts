import type { LayoutItem } from 'react-grid-layout/legacy';

/**
 * Shape of a single widget instance as persisted in
 * `UserPreferences.dashboardLayout`. `key` matches a registry entry;
 * x/y/w/h are 12-column grid units (react-grid-layout convention).
 *
 * `instanceId` is unique per row so two of the same widget kind (e.g.
 * two "MyTasks" filtered differently) can coexist. Defaults to the
 * widget key when the user only ever places one instance.
 */
export type DashboardWidget = {
  instanceId: string;
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DashboardLayout = {
  version: 1;
  widgets: DashboardWidget[];
};

export const GRID_COLS = 12;
export const GRID_ROW_HEIGHT = 32;

/**
 * Built-in default layout shown to a user who has never customised
 * theirs. Mirrors the awork three-column reference shot: timer left,
 * projects + customer-tasks centre, my-tasks right.
 */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  version: 1,
  widgets: [
    // Left column: the AI assistant is the standard centrepiece, with the
    // AI-planned schedule + role-based offers under it.
    { instanceId: 'ai-assistant', key: 'ai-assistant', x: 0, y: 0, w: 4, h: 10 },
    { instanceId: 'my-schedule', key: 'my-schedule', x: 0, y: 10, w: 4, h: 14 },
    // Middle column.
    { instanceId: 'my-tasks', key: 'my-tasks', x: 4, y: 0, w: 4, h: 18 },
    { instanceId: 'task-offers', key: 'task-offers', x: 4, y: 18, w: 4, h: 12 },
    // Right column.
    { instanceId: 'active-timer', key: 'active-timer', x: 8, y: 0, w: 4, h: 8 },
    { instanceId: 'my-projects', key: 'my-projects', x: 8, y: 8, w: 4, h: 8 },
    { instanceId: 'open-customer-tasks', key: 'open-customer-tasks', x: 8, y: 16, w: 4, h: 10 },
  ],
};

/** Convert our persistence shape to the react-grid-layout Layout array. */
export function toRglLayout(layout: DashboardLayout): LayoutItem[] {
  return layout.widgets.map((w) => ({
    i: w.instanceId,
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
    minW: 2,
    minH: 3,
  }));
}

/** Apply react-grid-layout's new positions to our persistence shape. */
export function fromRglLayout(layout: DashboardLayout, next: readonly LayoutItem[]): DashboardLayout {
  const positions = new Map(next.map((l) => [l.i, l]));
  return {
    ...layout,
    widgets: layout.widgets.map((w) => {
      const p = positions.get(w.instanceId);
      return p ? { ...w, x: p.x, y: p.y, w: p.w, h: p.h } : w;
    }),
  };
}
