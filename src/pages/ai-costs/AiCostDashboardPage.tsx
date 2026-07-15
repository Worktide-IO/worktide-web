import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins, Hash, Sparkles } from 'lucide-react';
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

import { aiUsage, aiErrorMessage, type AiUsageSummary } from '@/lib/ai';
import { intlLocale, formatNumber } from '@/lib/intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  }, [days, t]);

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
