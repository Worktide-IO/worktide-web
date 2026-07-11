import { useTranslation } from 'react-i18next';
import { Pencil, Plus, RotateCcw, Save } from 'lucide-react';
import { useState } from 'react';

import { DashboardGrid } from '@/components/dashboard/DashboardGrid';
import { WIDGET_REGISTRY } from '@/components/dashboard/registry';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardLayout } from '@/hooks/useDashboardLayout';
import type { DashboardLayout, DashboardWidget } from '@/lib/dashboard';

/**
 * Configurable widget dashboard.
 *
 * Reads/writes the user's layout from `/v1/me/preferences` via
 * `useDashboardLayout()`. In read mode the grid is locked; pressing
 * "Bearbeiten" flips edit mode, exposing drag handles, resize corners,
 * the X-remove button on each widget, and an "+ Hinzufügen" dropdown
 * with every registered widget the user doesn't already have.
 *
 * "Zurücksetzen" wipes the user's customisations and rolls back to the
 * shipped default layout. Saves happen automatically via the hook's
 * debounce — the explicit "Speichern" button just exits edit mode (the
 * commit already landed milliseconds ago).
 */
export function DashboardPage() {
  const { t } = useTranslation();
  const { layout, setLayout, resetToDefault, isLoading } = useDashboardLayout();
  const [editing, setEditing] = useState(false);

  const handleLayoutChange = (next: DashboardLayout) => {
    setLayout(next);
  };

  const handleRemove = (instanceId: string) => {
    setLayout({
      ...layout,
      widgets: layout.widgets.filter((w) => w.instanceId !== instanceId),
    });
  };

  const handleAdd = (key: string) => {
    const def = WIDGET_REGISTRY[key];
    if (!def) return;
    const newWidget: DashboardWidget = {
      instanceId: `${key}-${Date.now()}`,
      key,
      x: 0,
      y: Infinity, // RGL pushes it to the end
      w: def.defaultSize.w,
      h: def.defaultSize.h,
    };
    setLayout({ ...layout, widgets: [...layout.widgets, newWidget] });
  };

  const handleReset = () => {
    if (confirm(t('dashboard.reset_confirm'))) {
      resetToDefault();
    }
  };

  const usedKeys = new Set(layout.widgets.map((w) => w.key));
  const addable = Object.values(WIDGET_REGISTRY).filter((d) => !usedKeys.has(d.key));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl">Dashboard</h2>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" disabled={addable.length === 0}>
                    <Plus className="size-4" /> {t('dashboard.add_widget')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {addable.map((d) => {
                    const Icon = d.icon;
                    return (
                      <DropdownMenuItem key={d.key} onClick={() => handleAdd(d.key)}>
                        <Icon className="size-4" /> {d.label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
                <RotateCcw className="size-4" /> {t('dashboard.reset')}
              </Button>
              <Button type="button" size="sm" onClick={() => setEditing(false)}>
                <Save className="size-4" /> {t('dashboard.done')}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> {t('action.edit')}
            </Button>
          )}
        </div>
      </div>

      <DashboardGrid
        layout={layout}
        editing={editing}
        onLayoutChange={handleLayoutChange}
        onRemoveWidget={handleRemove}
      />
    </div>
  );
}
