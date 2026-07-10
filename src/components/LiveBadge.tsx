import { Wifi, WifiOff } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

/**
 * Connectivity pill for resource pages — "Live" when the Mercure stream is
 * connected, "offline" otherwise. Extracted from four verbatim copies
 * (Customers/Projects/Tasks/TimeEntries list pages) so the look stays in sync.
 */
export function LiveBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <Badge variant="secondary" className="gap-1 text-xs">
      <Wifi className="size-3" /> Live
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
      <WifiOff className="size-3" /> offline
    </Badge>
  );
}
