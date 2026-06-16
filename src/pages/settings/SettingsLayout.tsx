import { Building2, ShieldCheck, UserCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router';

import { cn } from '@/lib/utils';

type NavEntry = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV: NavEntry[] = [
  { to: '/settings/profile', label: 'Profil', icon: UserCircle },
  { to: '/settings/security', label: 'Sicherheit', icon: ShieldCheck },
  { to: '/settings/workspace', label: 'Workspace', icon: Building2 },
];

/**
 * Two-pane shell for /settings/* — vertical nav on the left, page content
 * on the right. Mirrors the GitHub / Linear settings pattern so users
 * with prior experience don't need a tour.
 *
 * Children supply page-level Heading + Cards; this layout owns only the
 * outer rail.
 */
export function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <nav className="space-y-0.5">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                active
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              <Icon className="size-4" /> {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-6">{children}</div>
    </div>
  );
}
