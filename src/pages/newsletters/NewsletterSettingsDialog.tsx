import { useOne, useUpdate } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { WorkspaceJsonld } from '@/api/types/workspace/Jsonld';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { readAuth, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';

type NewsletterSettings = { doubleOptIn?: boolean };
type Settings = Record<string, unknown> & { newsletter?: NewsletterSettings };

/**
 * Per-workspace newsletter settings (Workspace.settings.newsletter). Currently the
 * double-opt-in switch: when on, a portal subscribe stays pending until the
 * contact clicks the confirmation link. The full settings object is spread on
 * save so sibling keys are never clobbered.
 */
export function NewsletterSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const wsId = readAuth(WORKSPACE_STORAGE_KEY);
  const { result: workspace } = useOne<Row<WorkspaceJsonld> & { settings?: Settings | null }>({
    resource: 'workspaces',
    id: wsId ?? '',
    queryOptions: { enabled: Boolean(wsId) && open },
  });
  const { mutate: update, mutation } = useUpdate();

  const settings: Settings = workspace?.settings ?? {};
  const [doubleOptIn, setDoubleOptIn] = useState(false);

  // Seed from saved settings once the workspace loads / dialog opens.
  useEffect(() => {
    if (open) setDoubleOptIn(settings.newsletter?.doubleOptIn === true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  const save = () => {
    if (!wsId) return;
    update(
      {
        resource: 'workspaces',
        id: wsId,
        values: {
          settings: { ...settings, newsletter: { ...(settings.newsletter ?? {}), doubleOptIn } },
        },
        successNotification: false,
      },
      {
        onSuccess: () => {
          toast.success(t('toast.saved'));
          onOpenChange(false);
        },
        onError: () => toast.error(t('toast.save_failed')),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('newsletters.settings_title')}</DialogTitle>
          <DialogDescription>{t('newsletters.settings_desc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-2 py-1">
            <span className="text-sm">
              {t('newsletters.double_opt_in_label')}
              <span className="block text-xs text-muted-foreground">{t('newsletters.double_opt_in_hint')}</span>
            </span>
            <Switch checked={doubleOptIn} onCheckedChange={setDoubleOptIn} />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t('action.cancel')}
          </Button>
          <Button type="button" onClick={save} disabled={mutation.isPending || !wsId}>
            {t('action.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
