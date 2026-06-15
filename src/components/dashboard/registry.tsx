import { Clock, FolderKanban, ListChecks, ListTodo, type LucideIcon } from 'lucide-react';

import { ActiveTimerWidget } from './widgets/ActiveTimerWidget';
import { MyProjectsWidget } from './widgets/MyProjectsWidget';
import { MyTasksWidget } from './widgets/MyTasksWidget';
import { OpenCustomerTasksWidget } from './widgets/OpenCustomerTasksWidget';

/**
 * Widget catalog. Every renderable dashboard tile must have an entry
 * here keyed by a stable string (persisted in UserPreferences). Adding
 * a new widget = append a row; removing one = leave the row out and the
 * dashboard silently drops unknown keys from old layouts.
 *
 * `defaultSize` is in 12-col grid units and used when a user picks the
 * widget from the "+ Hinzufügen" menu.
 */
export type WidgetDefinition = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  defaultSize: { w: number; h: number };
  Component: React.ComponentType<{ instanceId: string }>;
};

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  'active-timer': {
    key: 'active-timer',
    label: 'Zeiterfassung',
    description: 'Laufende Stoppuhr + heutige Summe',
    icon: Clock,
    defaultSize: { w: 3, h: 8 },
    Component: ActiveTimerWidget,
  },
  'my-projects': {
    key: 'my-projects',
    label: 'Meine Projekte',
    description: 'Projekte mit mir als Mitglied',
    icon: FolderKanban,
    defaultSize: { w: 5, h: 8 },
    Component: MyProjectsWidget,
  },
  'open-customer-tasks': {
    key: 'open-customer-tasks',
    label: 'Offene Kunden-Aufgaben',
    description: 'Cross-Projekt offene Tasks der Kundenprojekte',
    icon: ListChecks,
    defaultSize: { w: 5, h: 10 },
    Component: OpenCustomerTasksWidget,
  },
  'my-tasks': {
    key: 'my-tasks',
    label: 'Meine Aufgaben',
    description: 'Mir zugewiesene Tasks, gefiltert nach Fälligkeit',
    icon: ListTodo,
    defaultSize: { w: 4, h: 18 },
    Component: MyTasksWidget,
  },
};

export const WIDGET_KEYS = Object.keys(WIDGET_REGISTRY);
