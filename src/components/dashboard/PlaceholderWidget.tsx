import type { LucideIcon } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Props = {
  title: string;
  instanceId: string;
  icon: LucideIcon;
};

/**
 * Stand-in for not-yet-implemented widgets. Renders a card with the
 * widget's name + icon so the grid can be exercised end-to-end (layout
 * persistence, edit mode, add/remove) before the real widgets land.
 */
export function PlaceholderWidget({ title, instanceId, icon: Icon }: Props) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex h-full items-center justify-center pb-6">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Widget folgt</p>
          <p className="font-mono text-[10px] text-muted-foreground/60 mt-1">{instanceId}</p>
        </div>
      </CardContent>
    </Card>
  );
}
