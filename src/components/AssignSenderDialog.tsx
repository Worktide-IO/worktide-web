import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { ContactCombobox } from '@/components/ContactCombobox';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';

type Props = {
  conversationId: string;
  /** Raw sender header, e.g. `Jane Doe <jane@x.test>`. */
  senderRaw: string | null | undefined;
  onLinked: () => void;
};

/** Split `Name <email>` → { name, email }. */
function parseSender(raw: string | null | undefined): { name: string; email: string } {
  const s = (raw ?? '').trim();
  const m = s.match(/^(.*?)<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2].trim() };
  return { name: '', email: s.includes('@') ? s : '' };
}

/**
 * Inbox detail action: turn the conversation's sender into address-book data —
 * attach the email to an existing contact, or create a new contact (under an
 * existing or freshly-created customer). Posts to
 * `POST /conversations/{id}/link-contact`.
 */
export function AssignSenderDialog({ conversationId, senderRaw, onLinked }: Props) {
  const { t } = useTranslation();
  const parsed = parseSender(senderRaw);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'existing' | 'create'>('existing');
  const [saving, setSaving] = useState(false);

  // existing
  const [contact, setContact] = useState<string>('');
  // create
  const nameParts = parsed.name.split(/\s+/).filter(Boolean);
  const [firstName, setFirstName] = useState(nameParts.slice(0, -1).join(' ') || nameParts[0] || '');
  const [lastName, setLastName] = useState(nameParts.length > 1 ? nameParts.slice(-1).join(' ') : '');
  const [customer, setCustomer] = useState<string>('');
  const [newCustomer, setNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');

  const submit = async () => {
    setSaving(true);
    try {
      const body =
        tab === 'existing'
          ? { mode: 'existing', contact }
          : {
              mode: 'create',
              firstName,
              lastName,
              ...(newCustomer ? { newCustomerName } : { customer }),
            };
      await api.post(`/conversations/${conversationId}/link-contact`, body);
      toast.success(t('assign_sender.linked'));
      setOpen(false);
      onLinked();
    } catch {
      toast.error(t('assign_sender.failed'));
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    tab === 'existing'
      ? Boolean(contact)
      : Boolean(lastName || firstName) && (newCustomer ? Boolean(newCustomerName.trim()) : Boolean(customer));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <UserPlus className="size-3.5" />
          {t('assign_sender.button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('assign_sender.title')}</DialogTitle>
          <DialogDescription>
            {parsed.email ? t('assign_sender.subtitle', { email: parsed.email }) : t('assign_sender.no_email')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'existing' | 'create')}>
          <TabsList className="w-full">
            <TabsTrigger value="existing" className="flex-1">{t('assign_sender.tab_existing')}</TabsTrigger>
            <TabsTrigger value="create" className="flex-1">{t('assign_sender.tab_create')}</TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="space-y-2 pt-2">
            <Label>{t('assign_sender.contact')}</Label>
            <ContactCombobox value={contact} onChange={setContact} />
          </TabsContent>

          <TabsContent value="create" className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="as-first">{t('assign_sender.first_name')}</Label>
                <Input id="as-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="as-last">{t('assign_sender.last_name')}</Label>
                <Input id="as-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <Label htmlFor="as-newcust" className="text-sm font-normal">{t('assign_sender.new_customer')}</Label>
              <Switch id="as-newcust" checked={newCustomer} onCheckedChange={setNewCustomer} />
            </div>
            {newCustomer ? (
              <div className="space-y-1">
                <Label htmlFor="as-custname">{t('assign_sender.new_customer_name')}</Label>
                <Input id="as-custname" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>{t('assign_sender.customer')}</Label>
                <CustomerCombobox value={customer} onChange={(v) => setCustomer(v ?? '')} />
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('action.cancel')}</Button>
          <Button type="button" onClick={submit} disabled={!canSubmit || saving} className="gap-1.5">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t('assign_sender.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
