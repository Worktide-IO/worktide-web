import * as Icons from 'lucide-react';

/**
 * Registry of every icon used in sidebar navigation resources. Keyed by the
 * same string the `meta.icon` field references in App.tsx. TypeScript
 * type-checks every key so a typo like `'Guage'` instead of `'Gauge'` is a
 * compile error instead of a silent fallback to Circle.
 *
 * Add new icons here when adding a resource to the sidebar.
 */
export const NAV_ICONS = {
  Activity: Icons.Activity,
  BarChart3: Icons.BarChart3,
  Boxes: Icons.Boxes,
  Building: Icons.Building,
  Building2: Icons.Building2,
  CalendarClock: Icons.CalendarClock,
  CalendarDays: Icons.CalendarDays,
  CalendarOff: Icons.CalendarOff,
  CalendarRange: Icons.CalendarRange,
  CheckSquare: Icons.CheckSquare,
  ClipboardList: Icons.ClipboardList,
  Clock: Icons.Clock,
  Coins: Icons.Coins,
  Compass: Icons.Compass,
  ConciergeBell: Icons.ConciergeBell,
  Contact: Icons.Contact,
  FileText: Icons.FileText,
  FolderKanban: Icons.FolderKanban,
  Gauge: Icons.Gauge,
  Inbox: Icons.Inbox,
  KeyRound: Icons.KeyRound,
  LayoutDashboard: Icons.LayoutDashboard,
  Mail: Icons.Mail,
  Megaphone: Icons.Megaphone,
  MessageSquarePlus: Icons.MessageSquarePlus,
  PackageSearch: Icons.PackageSearch,
  Plug: Icons.Plug,
  Receipt: Icons.Receipt,
  RefreshCw: Icons.RefreshCw,
  Server: Icons.Server,
  Shield: Icons.Shield,
  Sparkles: Icons.Sparkles,
  Target: Icons.Target,
  Upload: Icons.Upload,
  Users: Icons.Users,
  Webhook: Icons.Webhook,
  Workflow: Icons.Workflow,
  Zap: Icons.Zap,
  Circle: Icons.Circle,
} as const;

export type NavIconName = keyof typeof NAV_ICONS;

export function resolveNavIcon(name: string): Icons.LucideIcon {
  if (name in NAV_ICONS) return NAV_ICONS[name as NavIconName];
  return NAV_ICONS.Circle;
}
