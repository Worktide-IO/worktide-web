import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, Coins, Cpu, Hash, PiggyBank, ServerCog, ShieldCheck, Sparkles } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { toast } from 'sonner';

import {
  aiUsage,
  aiErrorMessage,
  type AiModel,
  type AiModelResidency,
  type AiRoutingState,
  type AiRoutingTier,
  type AiUsageSummary,
} from '@/lib/ai';
import { intlLocale, formatNumber } from '@/lib/intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PERIODS = [7, 30, 90] as const;
// Categorical palette for the breakdown bars (brand-neutral, distinct hues).
const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444'];

function usd(micros: number): string {
  return new Intl.NumberFormat(intlLocale(), {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: micros < 10_000 ? 4 : 2,
  }).format(micros / 1_000_000);
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Coins; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="rounded-md bg-muted p-2">
          <Icon className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="truncate text-xl font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Admin KI-Kosten dashboard: LLM spend + call volume for the workspace over a
 * chosen window, from /v1/ai-usage/summary (aggregated LlmUsageLog). Spend/day
 * bar chart + breakdowns by feature and by model. Admin-only server-side (403 →
 * hint). Costs are micro-USD; shown in USD.
 */
export function AiCostDashboardPage() {
  const { t } = useTranslation();
  const [days, setDays] = useState<number>(30);
  const [tick, setTick] = useState(0);
  const [data, setData] = useState<AiUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let active = true;
    setError(null);
    aiUsage
      .summary(days)
      .then((d) => active && setData(d))
      .catch((err) => {
        if (!active) return;
        if ((err as { response?: { status?: number } })?.response?.status === 403) setForbidden(true);
        else setError(aiErrorMessage(err, t('ai_costs.load_failed')));
      });
    return () => {
      active = false;
    };
  }, [days, tick, t]);

  const dayBars = useMemo(
    () => (data?.byDay ?? []).map((r) => ({ day: r.day.slice(5), usd: r.costMicros / 1_000_000, calls: r.calls })),
    [data],
  );

  if (forbidden) return <p className="text-sm text-muted-foreground">{t('ai_costs.admin_only')}</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">{t('app.loading')}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl">
            <Coins className="size-6 text-muted-foreground" /> {t('ai_costs.page_title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('ai_costs.page_subtitle')}</p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p} value={String(p)}>
                {t('ai_costs.last_days', { count: p })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi icon={Coins} label={t('ai_costs.total_spend')} value={usd(data.totalCostMicros)} />
        <Kpi icon={Sparkles} label={t('ai_costs.calls')} value={formatNumber(data.callCount)} />
        <Kpi
          icon={Hash}
          label={t('ai_costs.tokens')}
          value={`${formatNumber(data.totalInputTokens)} / ${formatNumber(data.totalOutputTokens)}`}
        />
      </div>

      <BudgetCard
        budgetMicros={data.monthlyBudgetMicros}
        spentMicros={data.monthSpentMicros}
        onSaved={() => setTick((n) => n + 1)}
      />

      <RoutingCard routing={data.routing} onSaved={() => setTick((n) => n + 1)} />

      <CatalogCard catalog={data.routing.catalog} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('ai_costs.spend_over_time')}</CardTitle>
        </CardHeader>
        <CardContent>
          {dayBars.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('ai_costs.empty')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dayBars} margin={{ left: 8, right: 16, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} width={48} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
                <Tooltip formatter={(value) => [`$${Number(value).toFixed(4)}`, t('ai_costs.spend')]} />
                <Bar dataKey="usd" fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Breakdown title={t('ai_costs.by_feature')} rows={data.byFeature} />
        <Breakdown title={t('ai_costs.by_model')} rows={data.byModel} />
      </div>
    </div>
  );
}

function BudgetCard({
  budgetMicros,
  spentMicros,
  onSaved,
}: {
  budgetMicros: number;
  spentMicros: number;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(budgetMicros > 0 ? String(budgetMicros / 1_000_000) : '');
  const [saving, setSaving] = useState(false);

  const hasBudget = budgetMicros > 0;
  const pct = hasBudget ? Math.min(100, Math.round((spentMicros / budgetMicros) * 100)) : 0;
  const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
  const remaining = Math.max(0, budgetMicros - spentMicros);

  async function save() {
    const num = value.trim() === '' ? 0 : Number(value);
    if (!Number.isFinite(num) || num < 0) {
      toast.error(t('ai_costs.budget_invalid'));
      return;
    }
    setSaving(true);
    try {
      await aiUsage.setBudget(num);
      toast.success(t('ai_costs.budget_saved'));
      onSaved();
    } catch (err) {
      toast.error(aiErrorMessage(err, t('ai_costs.budget_failed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t('ai_costs.budget_title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasBudget ? (
          <>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">
                {t('ai_costs.budget_month_spend', { spent: usd(spentMicros), budget: usd(budgetMicros) })}
              </span>
              <span className={pct >= 100 ? 'font-medium text-red-600' : 'text-muted-foreground'}>
                {t('ai_costs.budget_remaining', { amount: usd(remaining) })}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('ai_costs.budget_unlimited', { spent: usd(spentMicros) })}
          </p>
        )}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-sm text-muted-foreground">{t('ai_costs.budget_label')}</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input
              type="number"
              min={0}
              step="1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
              className="h-8 w-28 pl-5 text-sm"
            />
          </div>
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {t('action.save')}
          </Button>
          <span className="text-xs text-muted-foreground">{t('ai_costs.budget_hint')}</span>
        </div>
      </CardContent>
    </Card>
  );
}

const TIER_ICON: Record<AiRoutingTier, typeof Cpu> = {
  local: Cpu,
  cloud: Cloud,
  local_fallback_cloud: ServerCog,
  cheapest: PiggyBank,
};

// Radix Select forbids an empty-string item value, so the "follow the tier"
// option (i.e. no model pin) uses this sentinel.
const TIER_SENTINEL = '__tier__';

/**
 * DSGVO/GDPR-at-a-glance for a model: green when prompt data stays in the EU/EEA
 * or on-infra, amber when it's processed in the US (usable only under a DPA).
 */
function ResidencyBadge({ residency }: { residency: AiModelResidency }) {
  const { t } = useTranslation();
  const green = residency !== 'us';
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
        green
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
      }`}
    >
      {t(`ai_costs.residency.${residency}`)}
    </span>
  );
}

/** The central model catalog across providers — price + DSGVO posture + availability. */
function CatalogCard({ catalog }: { catalog: AiModel[] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ServerCog className="size-4 text-muted-foreground" /> {t('ai_costs.catalog_title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">{t('ai_costs.catalog_subtitle')}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-3 font-medium">{t('ai_costs.catalog_model')}</th>
                <th className="py-1 pr-3 font-medium">{t('ai_costs.catalog_price')}</th>
                <th className="py-1 pr-3 font-medium">{t('ai_costs.catalog_residency')}</th>
                <th className="py-1 font-medium">{t('ai_costs.catalog_status')}</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((m) => (
                <tr key={m.key} className="border-t">
                  <td className="py-1.5 pr-3">{m.label}</td>
                  <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">
                    ${m.inputPer1M} / ${m.outputPer1M}{' '}
                    <span className="text-[10px]">{t('ai_costs.per_1m')}</span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <ResidencyBadge residency={m.residency} />
                  </td>
                  <td className="py-1.5 text-xs">
                    {m.available ? (
                      <span className="text-emerald-600">{t('ai_costs.model_available')}</span>
                    ) : (
                      <span className="text-muted-foreground">{t('ai_costs.model_unavailable')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Per-task-type AI routing (local vs. cloud), from /v1/ai-usage/summary.routing.
 * A `forceLocal` switch is the data-residency lock (all task-types local); while
 * it's on, the per-feature tier list is moot and dimmed. Each control saves
 * immediately (PUT /v1/ai-usage/routing) and re-syncs from the server. Selecting
 * a feature's default tier clears its override (sends null).
 */
function RoutingCard({ routing, onSaved }: { routing: AiRoutingState; onSaved: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function save(body: {
    forceLocal?: boolean;
    routing?: Record<string, AiRoutingTier | null>;
    models?: Record<string, string | null>;
  }) {
    setBusy(true);
    try {
      await aiUsage.setRouting(body);
      toast.success(t('ai_costs.routing_saved'));
    } catch (err) {
      toast.error(aiErrorMessage(err, t('ai_costs.routing_failed')));
    } finally {
      setBusy(false);
      onSaved(); // re-sync the UI from the server, whether the save succeeded or not
    }
  }

  // Can't turn the lock ON without a local model (backend fail-closes); turning
  // it OFF is always allowed.
  const canForceLocal = routing.localConfigured || routing.forceLocal;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ServerCog className="size-4 text-muted-foreground" /> {t('ai_costs.routing_title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('ai_costs.routing_subtitle')}</p>

        {!routing.localConfigured && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
            {t('ai_costs.routing_no_local')}
          </p>
        )}

        <div className="flex items-start justify-between gap-4 rounded-md border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="ai-force-local" className="flex items-center gap-1.5 text-sm font-medium">
              <ShieldCheck className="size-4 text-muted-foreground" /> {t('ai_costs.routing_force_local')}
            </Label>
            <p className="text-xs text-muted-foreground">{t('ai_costs.routing_force_local_hint')}</p>
          </div>
          <Switch
            id="ai-force-local"
            checked={routing.forceLocal}
            disabled={busy || !canForceLocal}
            onCheckedChange={(v) => void save({ forceLocal: v })}
          />
        </div>

        <div className={routing.forceLocal ? 'pointer-events-none opacity-50' : ''}>
          <div className="mb-2 text-xs font-medium text-muted-foreground">{t('ai_costs.routing_per_feature')}</div>
          <div className="space-y-1.5">
            {routing.features.map(({ feature, defaultTier }) => {
              const tier = routing.overrides[feature] ?? defaultTier;
              const pinnedKey = routing.models[feature];
              const overridden = feature in routing.overrides;
              return (
                <div key={feature} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="truncate">{t(`ai_costs.routing_feature.${feature}`, feature)}</span>
                  <div className="flex items-center gap-2">
                    {overridden && (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t('ai_costs.routing_overridden')}
                      </span>
                    )}
                    {/* Specific model pin (beats the tier). "Standard" = follow the tier. */}
                    <Select
                      value={pinnedKey ?? TIER_SENTINEL}
                      disabled={busy || routing.forceLocal}
                      onValueChange={(v) => void save({ models: { [feature]: v === TIER_SENTINEL ? null : v } })}
                    >
                      <SelectTrigger className="h-8 w-64 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={TIER_SENTINEL} className="text-xs">
                          {t('ai_costs.routing_model_default')}
                        </SelectItem>
                        {routing.catalog.map((m) => (
                          <SelectItem key={m.key} value={m.key} disabled={!m.available} className="text-xs">
                            <span className="flex items-center gap-1.5">
                              {m.label}
                              <ResidencyBadge residency={m.residency} />
                              {!m.available ? ` · ${t('ai_costs.model_unavailable')}` : ''}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Tier — moot (dimmed) while a specific model is pinned. */}
                    <Select
                      value={tier}
                      disabled={busy || routing.forceLocal || Boolean(pinnedKey)}
                      onValueChange={(v) =>
                        void save({ routing: { [feature]: v === defaultTier ? null : (v as AiRoutingTier) } })
                      }
                    >
                      <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {routing.tiers.map((tierOption) => {
                          const Icon = TIER_ICON[tierOption];
                          return (
                            <SelectItem key={tierOption} value={tierOption} className="text-xs">
                              <span className="flex items-center gap-1.5">
                                <Icon className="size-3.5" />
                                {t(`ai_costs.routing_tier.${tierOption}`)}
                                {tierOption === defaultTier ? ` · ${t('ai_costs.routing_default')}` : ''}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; costMicros: number; calls: number }[] }) {
  const { t } = useTranslation();
  const bars = rows.map((r) => ({ label: r.label, usd: r.costMicros / 1_000_000, calls: r.calls }));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {bars.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('ai_costs.empty')}</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, bars.length * 34)}>
            <BarChart data={bars} layout="vertical" margin={{ left: 16, right: 24 }}>
              <XAxis type="number" fontSize={11} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
              <YAxis type="category" dataKey="label" width={140} fontSize={11} />
              <Tooltip
                formatter={(value, _name, item) =>
                  [`$${Number(value).toFixed(4)} · ${formatNumber(((item?.payload as { calls?: number })?.calls) ?? 0)}×`, t('ai_costs.spend')]
                }
              />
              <Bar dataKey="usd" radius={[0, 3, 3, 0]}>
                {bars.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
