import { type ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Shared chrome for every report tab — header + date-range pickers +
 * an extras slot for tab-specific filters (project picker, bucket
 * select, …). Keeps the four new analytics tabs visually consistent
 * with the existing TimeReport tab without forcing each one to
 * reinvent the layout.
 */
export function ReportShell({
  title,
  description,
  from,
  to,
  onFromChange,
  onToChange,
  extras,
  children,
}: {
  title: string;
  description: string;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  extras?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rep-from" className="text-xs">Von</Label>
            <Input
              id="rep-from"
              type="date"
              value={from}
              onChange={(e) => onFromChange(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-to" className="text-xs">Bis</Label>
            <Input
              id="rep-to"
              type="date"
              value={to}
              onChange={(e) => onToChange(e.target.value)}
              className="w-40"
            />
          </div>
          {extras}
        </CardContent>
      </Card>
      {children}
    </div>
  );
}
