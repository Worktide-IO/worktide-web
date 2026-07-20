import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  BellOff,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';

/* ---------- types ---------- */

type Condition = { field: string; operator: string; value: string };

type MuteRule = {
  '@id'?: string;
  id?: string;
  combinator: string;
  conditions: Condition[];
  isEnabled: boolean;
  matchCount: number;
  lastMatchedAt: string | null;
};

const FIELDS = [
  { value: 'sender_email', labelKey: 'mute_rules.field_sender_email' },
  { value: 'subject', labelKey: 'mute_rules.field_subject' },
  { value: 'body', labelKey: 'mute_rules.field_body' },
  { value: 'channel_adapter', labelKey: 'mute_rules.field_channel' },
];

const OPERATORS = [
  { value: 'contains', labelKey: 'mute_rules.op_contains' },
  { value: 'not_contains', labelKey: 'mute_rules.op_not_contains' },
  { value: 'equals', labelKey: 'mute_rules.op_equals' },
  { value: 'not_equals', labelKey: 'mute_rules.op_not_equals' },
  { value: 'starts_with', labelKey: 'mute_rules.op_starts_with' },
  { value: 'ends_with', labelKey: 'mute_rules.op_ends_with' },
  { value: 'regex', labelKey: 'mute_rules.op_regex' },
];

function emptyCondition(): Condition {
  return { field: 'sender_email', operator: 'contains', value: '' };
}

/* ---------- component ---------- */

type Props = { onOpenChange?: (open: boolean) => void };

export function MuteRulesManager({ onOpenChange: onOpenChangeProp }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<MuteRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [combinator, setCombinator] = useState('and');
  const [conditions, setConditions] = useState<Condition[]>([emptyCondition()]);
  const [saving, setSaving] = useState(false);

  onOpenChangeProp?.(open);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ 'hydra:member': MuteRule[] }>(
        '/inbound_mute_rules',
      );
      setRules(data['hydra:member'] ?? []);
    } catch {
      toast.error(t('mute_rules.load_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) loadRules();
  }, [open, loadRules]);

  const resetForm = () => {
    setEditingId(null);
    setCombinator('and');
    setConditions([emptyCondition()]);
  };

  const startEdit = (rule: MuteRule) => {
    setEditingId(rule.id ?? rule['@id']?.split('/').pop() ?? null);
    setCombinator(rule.combinator);
    setConditions(rule.conditions.length > 0 ? [...rule.conditions] : [emptyCondition()]);
  };

  const startCreate = () => {
    resetForm();
  };

  const updateCondition = (index: number, patch: Partial<Condition>) => {
    setConditions((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  };

  const addCondition = () => {
    setConditions((prev) => [...prev, emptyCondition()]);
  };

  const removeCondition = (index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    const valid = conditions.filter((c) => c.value.trim() !== '');
    if (valid.length === 0) {
      toast.error(t('mute_rules.empty_conditions'));
      return;
    }
    setSaving(true);
    try {
      const body = { combinator, conditions: valid };
      if (editingId) {
        await api.patch(`/inbound_mute_rules/${editingId}`, body);
        toast.success(t('mute_rules.updated'));
      } else {
        await api.post('/inbound_mute_rules', body);
        toast.success(t('mute_rules.created'));
      }
      resetForm();
      await loadRules();
    } catch {
      toast.error(t('mute_rules.save_error'));
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (rule: MuteRule) => {
    const id = rule.id ?? rule['@id']?.split('/').pop();
    if (!id) return;
    try {
      await api.patch(`/inbound_mute_rules/${id}`, { isEnabled: !rule.isEnabled });
      await loadRules();
    } catch {
      toast.error(t('mute_rules.save_error'));
    }
  };

  const deleteRule = async (rule: MuteRule) => {
    const id = rule.id ?? rule['@id']?.split('/').pop();
    if (!id) return;
    if (!window.confirm(t('mute_rules.confirm_delete'))) return;
    try {
      await api.delete(`/inbound_mute_rules/${id}`);
      toast.success(t('mute_rules.deleted'));
      if (editingId === id) resetForm();
      await loadRules();
    } catch {
      toast.error(t('mute_rules.delete_error'));
    }
  };

  const formatCondition = (c: Condition): string => {
    const field = FIELDS.find((f) => f.value === c.field);
    const op = OPERATORS.find((o) => o.value === c.operator);
    return `${t(field?.labelKey ?? c.field)} ${t(op?.labelKey ?? c.operator)} "${c.value}"`;
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <BellOff className="size-4" />
          {t('mute_rules.button')}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col gap-0 overflow-y-auto p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2">
            <BellOff className="size-4" />
            {t('mute_rules.title')}
          </SheetTitle>
          <SheetDescription>{t('mute_rules.description')}</SheetDescription>
        </SheetHeader>

        {/* Rule list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : rules.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('mute_rules.empty')}
            </p>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => {
                const id = rule.id ?? rule['@id']?.split('/').pop();
                const isEditing = editingId === id;
                return (
                  <div
                    key={id}
                    className={`rounded-lg border p-3 space-y-2 transition-colors ${
                      isEditing ? 'border-primary bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={rule.isEnabled ? 'default' : 'secondary'} className="text-[10px]">
                            {rule.combinator === 'and' ? 'AND' : 'OR'}
                          </Badge>
                          {rule.conditions.map((c, i) => (
                            <span key={i} className="text-xs text-muted-foreground">
                              {i > 0 && <span className="mx-1">{rule.combinator === 'and' ? '&&' : '||'}</span>}
                              {formatCondition(c)}
                            </span>
                          ))}
                        </div>
                        {rule.matchCount > 0 && (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {t('mute_rules.match_count', { count: rule.matchCount })}
                            {rule.lastMatchedAt && (
                              <> · {new Date(rule.lastMatchedAt).toLocaleDateString()}</>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Switch
                          size="sm"
                          checked={rule.isEnabled}
                          onCheckedChange={() => void toggleEnabled(rule)}
                          aria-label={t('mute_rules.toggle')}
                        />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => startEdit(rule)}
                          aria-label={t('action.edit')}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void deleteRule(rule)}
                          aria-label={t('action.delete')}
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Create / Edit form */}
        <div className="border-t px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">
              {editingId ? t('mute_rules.edit_rule') : t('mute_rules.new_rule')}
            </Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={resetForm}
            >
              {t('action.cancel')}
            </Button>
          </div>

          <Select value={combinator} onValueChange={setCombinator}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="and">{t('mute_rules.combinator_and')}</SelectItem>
              <SelectItem value="or">{t('mute_rules.combinator_or')}</SelectItem>
            </SelectContent>
          </Select>

          <div className="space-y-2">
            {conditions.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Select
                  value={c.field}
                  onValueChange={(v) => updateCondition(i, { field: v })}
                >
                  <SelectTrigger className="w-32 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELDS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {t(f.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={c.operator}
                  onValueChange={(v) => updateCondition(i, { operator: v })}
                >
                  <SelectTrigger className="w-32 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {t(o.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={c.value}
                  onChange={(e) => updateCondition(i, { value: e.target.value })}
                  placeholder={t('mute_rules.value_placeholder')}
                  className="flex-1"
                />
                {conditions.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeCondition(i)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={addCondition}
            >
              <Plus className="size-3" />
              {t('mute_rules.add_condition')}
            </Button>
          </div>

          <Button
            size="sm"
            className="w-full"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : editingId ? (
              t('mute_rules.save_edit')
            ) : (
              t('mute_rules.save_create')
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
