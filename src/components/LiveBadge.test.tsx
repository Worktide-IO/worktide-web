import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { LiveBadge } from './LiveBadge';

describe('LiveBadge', () => {
  it('renders "Live" when connected', () => {
    render(<LiveBadge connected={true} />);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Live')).toHaveClass('bg-secondary');
  });

  it('renders "offline" when disconnected', () => {
    render(<LiveBadge connected={false} />);
    expect(screen.getByText('offline')).toBeInTheDocument();
  });
});
