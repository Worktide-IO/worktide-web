import { useOne, useUpdate } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { toast } from 'sonner';

import type { WorkspaceJsonld } from '@/api/types/workspace/Jsonld';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readAuth, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';

// Mirrors PriorityScorer::DEFAULT_WEIGHTS on the backend.
const DEFAULT_WEIGHTS: Record<string, number> = {
  priority: 30,
  customer: 25,
  timeCrit: 20,
  blocker: 10,
  demand: 8,
  aging: 7,
};

const FIELDS: { key: string; label: string; hint: string }[] = [
  { key: 'priority', label: 'Manuelle Priorität', hint: 'Das menschliche Grundsignal' },
  { key: 'customer', label: 'Kundenwert', hint: 'Umsatz / Retainer des Kunden' },
  { key: 'timeCrit', label: 'Fälligkeit', hint: 'Nähe zum Abgabedatum' },
  { key: 'blocker', label: 'Blocker-Hebel', hint: 'Blockiert andere Tickets' },
  { key: 'demand', label: 'Nachfrage', hint: 'Verknüpfte Konversationen' },
  { key: 'aging', label: 'Alter', hint: 'Anti-Starvation für offene Tickets' },
];

type Settings = Record<string, unknown> & {
  priorityScoring?: { weights?: Record<string, number> };
};

/**
 * Tune the weights of the internal ticket priority score (see backend
 * PriorityScorer). Stored in Workspace.settings.priorityScoring.weights.
 * The score itself is a separate, computed signal — it never changes the
 * manually set task priority.
 */
export function WorkspacePriorityScoringCard() {
  const wsId = readAuth(WORKSPACE_STORAGE_KEY);
  const { result: workspace } = useOne<Row<WorkspaceJsonld> & { settings?: Settings | null }>({
    resource: 'workspaces',
    id: wsId ?? '',
    queryOptions: { enabled: Boolean(wsId) },
  });

  if (!wsId || !workspace) return null;
  // Mount the form only once loaded, so the initializer reads saved weights.
  return <PriorityScoringForm workspaceId={wsId} settings={workspace.settings ?? {}} />;
}

function PriorityScoringForm({ workspaceId, settings }: { workspaceId: string; settings: Settings }) {
  const { t } = useTranslation();
  const { mutate: update, mutation } = useUpdate();
  const [weights, setWeights] = useState<Record<string, number>>(() => ({
    ...DEFAULT_WEIGHTS,
    ...(settings.priorityScoring?.weights ?? {}),
  }));

  const sum = FIELDS.reduce((n, f) => n + (weights[f.key] || 0), 0);

  const save = () => {
    update(
      {
        resource: 'workspaces',
        id: workspaceId,
        values: {
          settings: {
            ...settings,
            priorityScoring: { ...(settings.priorityScoring ?? {}), weights },
          },
        },
        successNotification: false,
      },
      {
        onSuccess: () => toast.success(t('toast.priority_weights_saved')),
        onError: () => toast.error(t('toast.save_failed')),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prioritäts-Score</CardTitle>
        <CardDescription>
          Gewichte des intern berechneten Ticket-Scores (0–100). Reiner Rechenwert — die manuell
          gesetzte Priorität bleibt unberührt. Relativ zueinander gewichtet (Summe egal).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`w-${f.key}`} className="text-xs">
                {f.label}
              </Label>
              <Input
                id={`w-${f.key}`}
                type="number"
                min={0}
                value={weights[f.key] ?? 0}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  setWeights((w) => ({ ...w, [f.key]: Number.isFinite(n) && n >= 0 ? n : 0 }));
                }}
                className="h-8"
              />
              <p className="text-[10px] text-muted-foreground">{f.hint}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Summe: {sum}</span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}
            >
              Zurücksetzen
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={mutation.isPending}>
              Speichern
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
