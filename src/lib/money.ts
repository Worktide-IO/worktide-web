/**
 * Money helpers — keep formatting in one place so currency display stays
 * consistent across list views, detail pages, and reports.
 *
 * Worktide persists prices as integer cents (or the equivalent minor
 * unit for non-EUR currencies) + a lowercase ISO 4217 code. The UI
 * formats with `Intl.NumberFormat` using the active locale; callers
 * pass the locale explicitly because hooks shouldn't be in helper code.
 */
export function formatMoney(cents: number, currency: string, locale = 'de-DE'): string {
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
