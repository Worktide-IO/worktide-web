import { describe, expect, it, vi } from 'vitest';
import { formatDate, formatDateTime, formatNumber, intlLocale } from './intl';

vi.mock('@/i18n', () => ({
  default: { language: 'de' },
}));

describe('intlLocale', () => {
  it('returns de-DE for German locale', () => {
    expect(intlLocale()).toBe('de-DE');
  });
});

describe('formatDate', () => {
  it('formats a valid date string', () => {
    const result = formatDate('2026-07-20T12:00:00Z');
    expect(result).not.toBe('—');
    expect(result).toMatch(/\d/);
  });

  it('returns em dash for null', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('returns em dash for undefined', () => {
    expect(formatDate(undefined)).toBe('—');
  });

  it('returns em dash for empty string', () => {
    expect(formatDate('')).toBe('—');
  });

  it('returns em dash for invalid date string', () => {
    expect(formatDate('not-a-date')).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('formats a valid date+time string', () => {
    const result = formatDateTime('2026-07-20T12:00:00Z');
    expect(result).not.toBe('—');
    expect(result).toMatch(/\d/);
  });

  it('returns em dash for null', () => {
    expect(formatDateTime(null)).toBe('—');
  });
});

describe('formatNumber', () => {
  it('formats an integer', () => {
    const result = formatNumber(42);
    expect(result).toBe('42');
  });

  it('formats a thousand-separated number', () => {
    const result = formatNumber(1234.56);
    expect(result).toMatch(/1\.\d{3}/);
  });

  it('accepts Intl options', () => {
    const result = formatNumber(0.5, { style: 'percent' });
    expect(result).toMatch(/50/);
  });
});
