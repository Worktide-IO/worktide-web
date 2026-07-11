import { useList, useMany } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { Sparkles, Wifi, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { AiRecommendation } from '@/lib/ai';
import { aiAgent, aiMarketing, aiOutreach, aiTriage } from '@/lib/ai';
import { readAuth, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { Textarea } from '@/components/ui/textarea';
import { useMercureTopic } from '@/lib/mercure';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * Central overview of every AI recommendation (agent output) across the
 * workspace — triage, ticket suggestions and marketing drafts — with kind /
 * status filters and inline accept/reject. Also the launch point for the
 * marketing agent: pick a product and queue a social-copy draft.
 *
 * Recommendations are polymorphic (target = task | conversation | product), so
 * we load them via the flat `ai_recommendations` collection and resolve product
 * names for the marketing rows via useMany. Live pings on the workspace topic
 * trigger a refetch (the same topic the detail panels use).
 */
type ProductRow = { '@id'?: string; id?: string; name?: string };

const KIND_LABEL: Record<string, string> = {
  triage: 'ai_kind.triage',
  ticket_from_conversation: 'ai_kind.ticket_from_conversation',
  marketing_social_draft: 'ai_kind.marketing_social_draft',
  customer_upgrade_outreach: 'ai_kind.customer_upgrade_outreach',
  research_suggestion: 'ai_kind.research_suggestion',
  agent_action: 'ai_kind.agent_action',
};

const TARGET_LABEL: Record<string, string> = {
  task: 'ai_target.task',
  conversation: 'ai_target.conversation',
  product: 'ai_target.product',
  customer: 'ai_target.customer',
  workspace: 'ai_target.workspace',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'ai_status.pending',
  accepted: 'ai_status.accepted',
  rejected: 'ai_status.rejected',
  superseded: 'ai_status.superseded',
};

const STATUS_VARIANT: Record<string, 'outline' | 'secondary' | 'default'> = {
  pending: 'default',
  accepted: 'secondary',
  rejected: 'outline',
  superseded: 'outline',
};

export function AiAgentsOverviewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [distributionContent, setDistributionContent] = useState<string>('');

  // Server-side filtering via the flat ai_recommendations collection (newest
  // first). Refine maps eq-filters to ?status= / ?kind= (BackedEnumFilter).
  const filters = useMemo(() => {
    const f = [];
    if (statusFilter !== 'all') f.push({ field: 'status', operator: 'eq' as const, value: statusFilter });
    if (kindFilter !== 'all') f.push({ field: 'kind', operator: 'eq' as const, value: kindFilter });
    return f;
  }, [statusFilter, kindFilter]);

  const { result, query } = useList<AiRecommendation>({
    resource: 'ai_recommendations',
    filters,
    sorters: [{ field: 'createdAt', order: 'desc' }],
    pagination: { currentPage: 1, pageSize: 100 },
  });
  const items = useMemo(() => result?.data ?? [], [result]);
  const total = result?.total ?? 0;
  const loading = query.isLoading;

  // Live: refetch on any workspace recommendation ping.
  const workspaceId = readAuth(WORKSPACE_STORAGE_KEY);
  const topic = workspaceId ? `worktide:workspace:${workspaceId}:ai-recommendations` : null;
  const { connected } = useMercureTopic(topic, {
    enabled: Boolean(topic),
    onMessage: () => {
      void query.refetch();
    },
  });

  // Products: powers the marketing trigger picker and resolves names for
  // product-target rows.
  const { result: products } = useList<ProductRow>({
    resource: 'products',
    pagination: { mode: 'off' },
  });

  const productIds = useMemo(
    () => Array.from(new Set(items.filter((r) => r.target === 'product').map((r) => r.targetId))),
    [items],
  );
  const { result: productLookup } = useMany<ProductRow>({
    resource: 'products',
    ids: productIds,
    queryOptions: { enabled: productIds.length > 0 },
  });
  const productNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of productLookup?.data ?? []) {
      if (p.id && p.name) map[p.id] = p.name;
    }
    return map;
  }, [productLookup]);

  // Customers: powers the outreach trigger picker and resolves names for
  // customer-target rows.
  const { result: customers } = useList<ProductRow>({
    resource: 'customers',
    pagination: { mode: 'off' },
  });

  const customerIds = useMemo(
    () => Array.from(new Set(items.filter((r) => r.target === 'customer').map((r) => r.targetId))),
    [items],
  );
  const { result: customerLookup } = useMany<ProductRow>({
    resource: 'customers',
    ids: customerIds,
    queryOptions: { enabled: customerIds.length > 0 },
  });
  const customerNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of customerLookup?.data ?? []) {
      if (c.id && c.name) map[c.id] = c.name;
    }
    return map;
  }, [customerLookup]);

  const targetLabel = (rec: AiRecommendation): string => {
    if (rec.target === 'product') {
      return productNameById[rec.targetId] ?? `Produkt ${rec.targetId.slice(0, 8)}`;
    }
    if (rec.target === 'customer') {
      return customerNameById[rec.targetId] ?? `Kunde ${rec.targetId.slice(0, 8)}`;
    }
    if (rec.target === 'workspace') {
      return 'Recherche';
    }
    return `${TARGET_LABEL[rec.target] ? t(TARGET_LABEL[rec.target]) : rec.target} ${rec.targetId.slice(0, 8)}`;
  };

  const summaryOf = (rec: AiRecommendation): string => {
    const s =
      rec.suggestion?.summary ??
      rec.suggestion?.subject ??
      rec.suggestion?.title ??
      rec.suggestion?.prompt ??
      rec.suggestion?.payload?.body ??
      rec.suggestion?.rationale ??
      '';
    return s || '(keine Zusammenfassung)';
  };

  const onAccept = async (rec: AiRecommendation) => {
    if (!rec.id) return;
    setBusyId(rec.id);
    try {
      await aiTriage.accept(rec.id);
      const msg =
        rec.kind === 'marketing_social_draft'
          ? 'Entwurf übernommen – Social-Post-Draft erstellt.'
          : rec.kind === 'customer_upgrade_outreach'
            ? 'Übernommen – E-Mail-Entwurf erstellt (Versand erst nach Freigabe).'
            : rec.kind === 'research_suggestion'
              ? 'Übernommen – Recherche-Mission angelegt.'
              : rec.kind === 'agent_action'
                ? 'Übernommen – Entwurf erstellt (Versand/Publish erst nach Freigabe).'
                : 'Empfehlung übernommen.';
      toast.success(msg);
      await query.refetch();
      if (rec.kind === 'marketing_social_draft') {
        navigate('/social');
      } else if (rec.kind === 'research_suggestion') {
        navigate('/research/missions');
      } else if (rec.kind === 'agent_action' && rec.suggestion?.archetype === 'social_post') {
        navigate('/social');
      }
    } catch {
      toast.error(t('toast.adopt_failed'));
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (rec: AiRecommendation) => {
    if (!rec.id) return;
    setBusyId(rec.id);
    try {
      await aiTriage.reject(rec.id);
      toast.success(t('toast.recommendation_dismissed'));
      await query.refetch();
    } catch {
      toast.error(t('toast.dismiss_failed'));
    } finally {
      setBusyId(null);
    }
  };

  const onRequestMarketing = async () => {
    if (!selectedProduct) return;
    try {
      await aiMarketing.request(selectedProduct);
      toast.success(t('toast.marketing_draft_requested'));
    } catch {
      toast.error(t('toast.llm_request_failed'));
    }
  };

  const onRequestOutreach = async () => {
    if (!selectedCustomer) return;
    try {
      await aiOutreach.request(selectedCustomer);
      toast.success(t('toast.upgrade_outreach_requested'));
    } catch {
      toast.error(t('toast.llm_request_failed'));
    }
  };

  const onPlanDistribution = async () => {
    const content = distributionContent.trim();
    if (content === '') return;
    if (!workspaceId) {
      toast.error(t('toast.no_active_workspace_selected'));
      return;
    }
    try {
      await aiAgent.planDistribution(content, workspaceId);
      toast.success(t('toast.distribution_scheduled'));
      setDistributionContent('');
    } catch {
      toast.error(t('toast.llm_request_failed'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl">KI-Agenten</h2>
        {connected ? (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Wifi className="size-3" /> Live
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
            <WifiOff className="size-3" /> offline
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{total} Empfehlungen im Workspace</p>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> Agenten starten
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Produkt / Service wählen…" />
              </SelectTrigger>
              <SelectContent>
                {(products?.data ?? []).map((p) => (
                  <SelectItem key={p.id ?? p['@id']} value={p.id ?? ''}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={onRequestMarketing} disabled={!selectedProduct}>
              Marketing-Entwurf erzeugen
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Kunde wählen…" />
              </SelectTrigger>
              <SelectContent>
                {(customers?.data ?? []).map((c) => (
                  <SelectItem key={c.id ?? c['@id']} value={c.id ?? ''}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="secondary" onClick={onRequestOutreach} disabled={!selectedCustomer}>
              Upgrade-Outreach erzeugen
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[280px] flex-1">
              <Textarea
                rows={2}
                placeholder="Inhalt/Ankündigung, den der Agent auf die verbundenen Kanäle (inkl. Foren) verteilen soll…"
                value={distributionContent}
                onChange={(e) => setDistributionContent(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              onClick={onPlanDistribution}
              disabled={distributionContent.trim() === ''}
            >
              Verteilung planen
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle>Empfehlungen</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="pending">Ausstehend</SelectItem>
                <SelectItem value="accepted">Übernommen</SelectItem>
                <SelectItem value="rejected">Verworfen</SelectItem>
                <SelectItem value="superseded">Ersetzt</SelectItem>
              </SelectContent>
            </Select>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Art" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Arten</SelectItem>
                <SelectItem value="triage">Triage</SelectItem>
                <SelectItem value="ticket_from_conversation">Ticket-Vorschlag</SelectItem>
                <SelectItem value="marketing_social_draft">Marketing-Copy</SelectItem>
                <SelectItem value="customer_upgrade_outreach">Upgrade-Outreach</SelectItem>
                <SelectItem value="research_suggestion">Recherche-Vorschlag</SelectItem>
                <SelectItem value="agent_action">Agent-Aktion</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              Keine Empfehlungen mit diesen Filtern.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ziel</TableHead>
                  <TableHead className="w-40">Art</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead>Vorschlag</TableHead>
                  <TableHead className="w-52 text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell className="font-medium">{targetLabel(rec)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {KIND_LABEL[rec.kind] ? t(KIND_LABEL[rec.kind]) : rec.kind}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[rec.status] ?? 'outline'} className="text-xs">
                        {STATUS_LABEL[rec.status] ? t(STATUS_LABEL[rec.status]) : rec.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="line-clamp-2">{summaryOf(rec)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      {rec.status === 'pending' ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => void onAccept(rec)}
                            disabled={busyId === rec.id}
                          >
                            Übernehmen
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void onReject(rec)}
                            disabled={busyId === rec.id}
                          >
                            Verwerfen
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
