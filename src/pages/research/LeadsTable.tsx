import { Building2, ExternalLink, History, User as UserIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { toast } from 'sonner';

import { aiErrorMessage } from '@/lib/ai';
import type { Row } from '@/lib/refine';
import { LeadActivityDialog } from './LeadActivityDialog';
import {
  LEAD_SOURCE_LABEL,
  LEAD_STAGE_LABEL,
  LEAD_STAGES,
  leadActions,
  type LeadJsonld,
  type LeadStage,
} from '@/lib/research';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * Shared leads table: inline stage change (writes a stage_change activity on
 * the backend) and one-click convert to a Customer. Used both on the mission
 * detail page and the global leads list. `onChanged` refetches the owning query
 * after a mutation.
 */
export function LeadsTable({
  leads,
  onChanged,
}: {
  leads: Row<LeadJsonld>[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [timelineLead, setTimelineLead] = useState<Row<LeadJsonld> | null>(null);

  const changeStage = async (lead: Row<LeadJsonld>, stage: LeadStage) => {
    if (!lead.id || stage === lead.stage) return;
    setBusyId(lead.id);
    try {
      await leadActions.setStage(lead.id, stage);
      onChanged();
    } catch (err) {
      toast.error(aiErrorMessage(err, 'Statuswechsel fehlgeschlagen.'));
    } finally {
      setBusyId(null);
    }
  };

  const convert = async (lead: Row<LeadJsonld>) => {
    if (!lead.id) return;
    setBusyId(lead.id);
    try {
      await leadActions.convert(lead.id);
      toast.success(`„${lead.name}" als Kunde angelegt.`);
      onChanged();
    } catch (err) {
      toast.error(aiErrorMessage(err, 'Umwandlung fehlgeschlagen.'));
    } finally {
      setBusyId(null);
    }
  };

  if (leads.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-12">
        Noch keine Leads. Starte einen Suchlauf.
      </p>
    );
  }

  return (
    <>
      <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lead</TableHead>
          <TableHead className="w-20 text-right">Fit</TableHead>
          <TableHead className="w-32">Quelle</TableHead>
          <TableHead className="w-44">Status</TableHead>
          <TableHead className="w-32 text-right">Aktion</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => {
          const converted = Boolean(lead.convertedCustomer);
          return (
            <TableRow key={lead['@id']}>
              <TableCell>
                <div className="flex items-center gap-2 font-medium">
                  {lead.isCompany ? (
                    <Building2 className="size-3.5 text-muted-foreground" />
                  ) : (
                    <UserIcon className="size-3.5 text-muted-foreground" />
                  )}
                  {lead.name}
                  {lead.website ? (
                    <a
                      href={lead.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {[lead.role, lead.industry, lead.region].filter(Boolean).join(' · ') || '—'}
                </div>
                {lead.scoreReason ? (
                  <div className="text-xs text-muted-foreground line-clamp-1 italic">{lead.scoreReason}</div>
                ) : null}
              </TableCell>
              <TableCell className="text-right">
                {typeof lead.fitScore === 'number' ? (
                  <Badge variant={lead.fitScore >= 70 ? 'default' : 'outline'} className="text-xs">
                    {lead.fitScore}
                  </Badge>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {lead.source ? (LEAD_SOURCE_LABEL[lead.source] ? t(LEAD_SOURCE_LABEL[lead.source]) : lead.source) : '—'}
              </TableCell>
              <TableCell>
                <Select
                  value={lead.stage}
                  onValueChange={(v) => void changeStage(lead, v as LeadStage)}
                  disabled={busyId === lead.id || converted}
                >
                  <SelectTrigger className="h-8 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(LEAD_STAGE_LABEL[s])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    title="Verlauf"
                    onClick={() => setTimelineLead(lead)}
                  >
                    <History className="size-4" />
                  </Button>
                  {converted ? (
                    <Badge variant="secondary" className="text-xs">
                      Kunde
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void convert(lead)}
                      disabled={busyId === lead.id}
                    >
                      In Kunde
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      </Table>
      <LeadActivityDialog lead={timelineLead} onClose={() => setTimelineLead(null)} />
    </>
  );
}
