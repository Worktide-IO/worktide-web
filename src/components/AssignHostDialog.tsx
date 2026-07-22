import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Server } from 'lucide-react';
import { toast } from 'sonner';

import { CustomerCombobox } from '@/components/CustomerCombobox';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';

type Props = {
  conversationId: string;
  /** Host label for the dialog copy (the conversation's senderRaw). */
  hostLabel: string | null | undefined;
  onLinked: () => void;
};

/**
 * Inbox detail action for Zabbix host threads: assign the monitored host to a
 * customer. The relation persists on a CustomerSystem (externalSource=zabbix),
 * so future alerts for the host auto-link. Posts to
 * `POST /conversations/{id}/link-system` (mode customer | create).
 */
export function AssignHostDialog({ conversationId, hostLabel, onLinked }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customer, setCustomer] = useState<string>('');
  const [newCustomer, setNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');

  const canSubmit = newCustomer ? Boolean(newCustomerName.trim()) : Boolean(customer);

  const submit = async () => {
    setSaving(true);
    try {
      const body = newCustomer
        ? { mode: 'create', newCustomerName }
        : { mode: 'customer', customer };
      await api.post(`/conversations/${conversationId}/link-system`, body);
      toast.success(t('assign_host.toast_success'));
      setOpen(false);
      onLinked();
    } catch {
      toast.error(t('assign_host.toast_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <Server className="size-3.5" />
          {t('assign_host.button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('assign_host.title')}</DialogTitle>
          <DialogDescription>
            {hostLabel
              ? t('assign_host.desc_with_host', { host: hostLabel })
              : t('assign_host.desc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label htmlFor="ah-newcust" className="text-sm font-normal">{t('assign_host.new_customer')}</Label>
            <Switch id="ah-newcust" checked={newCustomer} onCheckedChange={setNewCustomer} />
          </div>
          {newCustomer ? (
            <div className="space-y-1">
              <Label htmlFor="ah-custname">{t('assign_host.new_customer_name')}</Label>
              <Input id="ah-custname" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
            </div>
          ) : (
            <div className="space-y-1">
              <Label>{t('assign_host.customer_label')}</Label>
              <CustomerCombobox value={customer} onChange={(v) => setCustomer(v ?? '')} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('assign_host.cancel')}</Button>
          <Button type="button" onClick={submit} disabled={!canSubmit || saving} className="gap-1.5">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t('assign_host.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
