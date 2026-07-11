import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

type CurrencyEntry = { currency: string; cents: number; amount: number };
type MrrPoint = {
  month: string;
  activeCount: number;
  byCurrency: CurrencyEntry[];
  totalCentsEur: number;
};
type Response = {
  from: string;
  to: string;
  series: MrrPoint[];
};

function monthsAgo(months: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 7);
}
function thisMonth(): string {
  const d = new Date();
  return d.toISOString().slice(0, 7);
}

function fmtEur(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/**
 * Monthly Recurring Revenue trajectory aus ServiceSubscription. EUR
 * ist die Hauptachse; andere Währungen werden unter dem Chart
 * separat ausgewiesen, weil der Backend-Endpoint absichtlich nicht
 * FX-konvertiert.
 *
 * Range-Picker arbeitet auf Monaten (YYYY-MM), nicht Tagen — MRR ist
 * per Definition monatlich, Tagesauflösung wäre Quatsch.
 */
export function MrrTab() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(() => monthsAgo(11));
  const [to, setTo] = useState(() => thisMonth());

  const { data, isLoading } = useQuery({
    queryKey: ['reports/mrr', from, to],
    queryFn: async (): Promise<Response> => {
      const { data } = await api.get<Response>('/reports/mrr', { params: { from, to } });
      return data;
    },
  });

  const series = (data?.series ?? []).map((p) => ({
    month: p.month,
    eur: +(p.totalCentsEur / 100).toFixed(2),
    activeCount: p.activeCount,
  }));
  const lastPoint = data?.series.at(-1);
  const otherCurrencies = (lastPoint?.byCurrency ?? []).filter((c) => c.currency !== 'eur');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>MRR — Monthly Recurring Revenue</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="mrr-from" className="text-xs">{t('mrr.from')}</Label>
            <Input id="mrr-from" type="month" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mrr-to" className="text-xs">{t('mrr.to')}</Label>
            <Input id="mrr-to" type="month" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {lastPoint
              ? t('mrr.current', {
                  amount: fmtEur(lastPoint.totalCentsEur),
                  count: lastPoint.activeCount,
                })
              : t('mrr.history_title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : series.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('mrr.no_data')}</p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <AreaChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
                  <Tooltip
                    formatter={(v, name) =>
                      name === 'eur'
                        ? [fmtEur(Number(v) * 100), 'EUR']
                        : [String(v), String(name)]
                    }
                  />
                  <Area type="monotone" dataKey="eur" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          {otherCurrencies.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {t('mrr.other_currencies')}
              {otherCurrencies.map((c) => (
                <span key={c.currency} className="rounded border bg-muted/30 px-1.5 py-0.5">
                  {c.currency.toUpperCase()}: {c.amount.toFixed(2)}
                </span>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
