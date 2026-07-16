import { Activity, Bot, CalendarClock, Clock, FolderKanban, Inbox, ListChecks, ListTodo, type LucideIcon } from 'lucide-react';

import { ActiveTimerWidget } from './widgets/ActiveTimerWidget';
import { MyProjectsWidget } from './widgets/MyProjectsWidget';
import { MyTasksWidget } from './widgets/MyTasksWidget';
import { MyScheduleWidget } from './widgets/MyScheduleWidget';
import { TaskOffersWidget } from './widgets/TaskOffersWidget';
import { AiAssistantWidget } from './widgets/AiAssistantWidget';
import { OpenCustomerTasksWidget } from './widgets/OpenCustomerTasksWidget';
import { RecentStatusUpdatesWidget } from './widgets/RecentStatusUpdatesWidget';

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
    label: 'widget.active_timer.label',
    description: 'widget.active_timer.desc',
    icon: Clock,
    defaultSize: { w: 3, h: 8 },
    Component: ActiveTimerWidget,
  },
  'my-projects': {
    key: 'my-projects',
    label: 'widget.my_projects.label',
    description: 'widget.my_projects.desc',
    icon: FolderKanban,
    defaultSize: { w: 5, h: 8 },
    Component: MyProjectsWidget,
  },
  'open-customer-tasks': {
    key: 'open-customer-tasks',
    label: 'widget.open_customer_tasks.label',
    description: 'widget.open_customer_tasks.desc',
    icon: ListChecks,
    defaultSize: { w: 5, h: 10 },
    Component: OpenCustomerTasksWidget,
  },
  'my-tasks': {
    key: 'my-tasks',
    label: 'widget.my_tasks.label',
    description: 'widget.my_tasks.desc',
    icon: ListTodo,
    defaultSize: { w: 4, h: 18 },
    Component: MyTasksWidget,
  },
  'my-schedule': {
    key: 'my-schedule',
    label: 'widget.my_schedule.label',
    description: 'widget.my_schedule.desc',
    icon: CalendarClock,
    defaultSize: { w: 4, h: 14 },
    Component: MyScheduleWidget,
  },
  'task-offers': {
    key: 'task-offers',
    label: 'widget.task_offers.label',
    description: 'widget.task_offers.desc',
    icon: Inbox,
    defaultSize: { w: 4, h: 12 },
    Component: TaskOffersWidget,
  },
  'ai-assistant': {
    key: 'ai-assistant',
    label: 'widget.assistant.label',
    description: 'widget.assistant.desc',
    icon: Bot,
    defaultSize: { w: 4, h: 10 },
    Component: AiAssistantWidget,
  },
  'recent-status-updates': {
    key: 'recent-status-updates',
    label: 'widget.recent_status_updates.label',
    description: 'widget.recent_status_updates.desc',
    icon: Activity,
    defaultSize: { w: 4, h: 10 },
    Component: RecentStatusUpdatesWidget,
  },
};

export const WIDGET_KEYS = Object.keys(WIDGET_REGISTRY);
