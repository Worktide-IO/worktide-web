import { useState } from 'react';
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
      toast.success('Host dem Kunden zugewiesen.');
      setOpen(false);
      onLinked();
    } catch {
      toast.error('Zuweisung fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <Server className="size-3.5" />
          Host zuweisen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Host einem Kunden zuweisen</DialogTitle>
          <DialogDescription>
            {hostLabel
              ? `Ordne den Host „${hostLabel}" einem Kunden zu. Künftige Zabbix-Alerts dieses Hosts werden automatisch verknüpft.`
              : 'Ordne diesen Host einem Kunden zu. Künftige Zabbix-Alerts dieses Hosts werden automatisch verknüpft.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label htmlFor="ah-newcust" className="text-sm font-normal">Neuen Kunden anlegen</Label>
            <Switch id="ah-newcust" checked={newCustomer} onCheckedChange={setNewCustomer} />
          </div>
          {newCustomer ? (
            <div className="space-y-1">
              <Label htmlFor="ah-custname">Name des neuen Kunden</Label>
              <Input id="ah-custname" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Kunde</Label>
              <CustomerCombobox value={customer} onChange={(v) => setCustomer(v ?? '')} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button>
          <Button type="button" onClick={submit} disabled={!canSubmit || saving} className="gap-1.5">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Zuweisen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
