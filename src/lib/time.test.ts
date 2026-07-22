import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { timeAgo } from './time';

const NOW = new Date('2026-07-20T12:00:00Z').getTime();

vi.mock('@/i18n', () => ({
  default: {
    t: (key: string, opts?: { count?: number }) => {
      const msgs: Record<string, string> = {
        'time.just_now': 'just now',
        'time.min': `${opts?.count ?? 1} min`,
        'time.hour': `${opts?.count ?? 1} h`,
        'time.yesterday': 'yesterday',
        'time.day': `${opts?.count ?? 1} d`,
        'time.week': `${opts?.count ?? 1} wk`,
        'time.month': `${opts?.count ?? 1} mo`,
        'time.year': `${opts?.count ?? 1} y`,
      };
      return msgs[key] ?? key;
    },
  },
}));

describe('timeAgo', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for sub-45s', () => {
    expect(timeAgo(new Date(NOW - 30_000).toISOString())).toBe('just now');
  });

  it('returns minutes for sub-45min', () => {
    expect(timeAgo(new Date(NOW - 120_000).toISOString())).toBe('2 min');
  });

  it('returns hours for sub-24h', () => {
    expect(timeAgo(new Date(NOW - 3_600_000 * 3).toISOString())).toBe('3 h');
  });

  it('returns "yesterday" for 24-36h', () => {
    expect(timeAgo(new Date(NOW - 3_600_000 * 30).toISOString())).toBe('yesterday');
  });

  it('returns days for sub-14d', () => {
    expect(timeAgo(new Date(NOW - 3_600_000 * 24 * 5).toISOString())).toBe('5 d');
  });

  it('returns weeks for sub-8wk', () => {
    expect(timeAgo(new Date(NOW - 3_600_000 * 24 * 30).toISOString())).toBe('4 wk');
  });

  it('returns months for sub-18mo', () => {
    expect(timeAgo(new Date(NOW - 3_600_000 * 24 * 120).toISOString())).toBe('4 mo');
  });

  it('returns years beyond 18 months', () => {
    expect(timeAgo(new Date(NOW - 3_600_000 * 24 * 547).toISOString())).toBe('1 y');
  });

  it('returns em dash for null', () => {
    expect(timeAgo(null)).toBe('—');
  });

  it('returns em dash for invalid date', () => {
    expect(timeAgo('bad-date')).toBe('—');
  });
});
