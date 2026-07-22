import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PriorityScoreBadge, scoreEntryFromTask } from './PriorityScoreBadge';

describe('scoreEntryFromTask', () => {
  it('returns undefined for null task', () => {
    expect(scoreEntryFromTask(null)).toBeUndefined();
  });

  it('returns undefined for undefined task', () => {
    expect(scoreEntryFromTask(undefined)).toBeUndefined();
  });

  it('returns undefined for unscored task', () => {
    expect(scoreEntryFromTask({})).toBeUndefined();
  });

  it('builds entry from stored fields', () => {
    const entry = scoreEntryFromTask({
      priorityScore: 65,
      priorityScoreBlocked: false,
      priorityScoreParts: [{ label: 'Urgency', contribution: 30 }],
    });
    expect(entry).toEqual({
      score: 65,
      blocked: false,
      parts: [{ label: 'Urgency', contribution: 30 }],
    });
  });

  it('defaults blocked and parts when absent', () => {
    const entry = scoreEntryFromTask({ priorityScore: 50 });
    expect(entry).toEqual({ score: 50, blocked: false, parts: [] });
  });
});

describe('PriorityScoreBadge', () => {
  it('renders nothing when entry is undefined', () => {
    const { container } = render(<PriorityScoreBadge entry={undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders score value', () => {
    render(<PriorityScoreBadge entry={{ score: 75, blocked: false, parts: [] }} />);
    expect(screen.getByText('Score 75')).toBeInTheDocument();
  });

  it('renders compact variant', () => {
    render(
      <PriorityScoreBadge entry={{ score: 75, blocked: false, parts: [] }} compact />,
    );
    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.queryByText('Score 75')).not.toBeInTheDocument();
  });

  it('applies high-score color class for score >= 70', () => {
    render(<PriorityScoreBadge entry={{ score: 70, blocked: false, parts: [] }} />);
    const badge = screen.getByText('Score 70');
    expect(badge.className).toContain('text-red');
  });

  it('applies medium color class for score 40-69', () => {
    render(<PriorityScoreBadge entry={{ score: 55, blocked: false, parts: [] }} />);
    const badge = screen.getByText('Score 55');
    expect(badge.className).toContain('text-amber');
  });

  it('applies low color class for score < 40', () => {
    render(<PriorityScoreBadge entry={{ score: 20, blocked: false, parts: [] }} />);
    const badge = screen.getByText('Score 20');
    expect(badge.className).toContain('text-muted-foreground');
  });
});
