import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/lib/api';
import { Panel, PanelState } from './panel';

const query = (over: Partial<{ isPending: boolean; isError: boolean; error: unknown }> = {}) => ({
  isPending: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
  ...over,
});

describe('Panel', () => {
  it('is a region labelled by its title', () => {
    render(<Panel title="Needs attention">body</Panel>);
    expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument();
  });
});

describe('PanelState', () => {
  it('shows a busy skeleton while loading', () => {
    const { container } = render(
      <PanelState query={query({ isPending: true })}>content</PanelState>,
    );
    expect(container.querySelector('[aria-busy]')).not.toBeNull();
    expect(screen.queryByText('content')).toBeNull();
  });

  it('shows the error, its reference and a working retry', () => {
    const q = query({
      isError: true,
      error: new ApiRequestError(500, 'INTERNAL', 'Something broke', undefined, 'req-123'),
    });
    render(<PanelState query={q}>content</PanelState>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something broke');
    expect(screen.getByText('Reference req-123')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(q.refetch).toHaveBeenCalled();
  });

  it('shows the empty state when there is nothing to show', () => {
    render(
      <PanelState
        query={query()}
        isEmpty
        empty={{ title: 'All clear.', body: 'Nothing needs a decision.' }}
      >
        content
      </PanelState>,
    );
    expect(screen.getByText('All clear.')).toBeInTheDocument();
  });

  it('renders children when data is ready', () => {
    render(<PanelState query={query()}>content</PanelState>);
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});
