/**
 * Money helpers — keep formatting in one place so currency display stays
 * consistent across list views, detail pages, and reports.
 *
 * Worktide persists prices as integer cents (or the equivalent minor
 * unit for non-EUR currencies) + a lowercase ISO 4217 code. The UI
 * formats with `Intl.NumberFormat` using the app's active locale (resolved
 * from i18n.language at call time); callers may still pass a locale override.
 */
import { intlLocale } from '@/lib/intl';

export function formatMoney(cents: number, currency: string, locale = intlLocale()): string {
  const value = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Fall back when currency is unknown / typo'd — never blow up the UI.
    return `${value.toFixed(2)} ${currency.toUpperCase()}`;
  }
}
