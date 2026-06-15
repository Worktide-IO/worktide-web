import { useGetIdentity, useLogout } from '@refinedev/core';
import { ChevronsUpDown, LogOut, Settings, UserCircle } from 'lucide-react';
import { Link } from 'react-router';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';

type Identity = {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
};

/**
 * Footer-positioned dropdown for the current user. Identity comes from the
 * authProvider's getIdentity() which hits /v1/auth/me. Logout invalidates
 * the JWT + refresh token via /v1/auth/logout and clears local storage.
 *
 * The "Profile" and "Settings" items are stubs for now — they'll start
 * routing to /me and /settings once those pages exist.
 */
export function UserMenu() {
  const { data: identity } = useGetIdentity<Identity>();
  const { mutate: logout } = useLogout();
  const { isMobile } = useSidebar();

  const display = identity?.name ?? identity?.email ?? 'Anonymous';
  const initials = display
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent"
        >
          <Avatar className="size-7">
            {identity?.avatar ? <AvatarImage src={identity.avatar} alt={display} /> : null}
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col items-start gap-0.5 leading-tight">
            <span className="text-sm font-medium truncate">{display}</span>
            {identity?.email && identity?.name ? (
              <span className="text-xs text-muted-foreground truncate">{identity.email}</span>
            ) : null}
          </div>
          <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56"
        side={isMobile ? 'bottom' : 'right'}
        align="end"
        sideOffset={6}
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col">
            <span className="font-medium">{display}</span>
            {identity?.email ? (
              <span className="text-xs text-muted-foreground">{identity.email}</span>
            ) : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/settings/profile">
              <UserCircle className="size-4" /> Profil
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/settings/workspace">
              <Settings className="size-4" /> Workspace-Einstellungen
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logout()}>
          <LogOut className="size-4" /> Abmelden
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
