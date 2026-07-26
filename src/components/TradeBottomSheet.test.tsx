import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TradeBottomSheet } from './TradeBottomSheet';
import type { Trade } from '../types';

const baseTrade: Trade = {
  id: '1', ticker: 'JOBY', market: 'US', name: '조비', currency: 'USD',
  datetime: '2025-10-15T00:00:00.000Z', datetimeUnknown: false, side: 'buy',
  price: 16.3, quantityType: 'shares', quantityValue: 50, quantity: 50,
  fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '',
  attachment: null, recordedAt: '2025-10-15T00:05:00.000Z',
};

describe('TradeBottomSheet', () => {
  it('shows an observational fill-in nudge when there is no rationale tag, not a blaming one', () => {
    render(<TradeBottomSheet trade={baseTrade} tags={[]} onClose={() => {}} />);
    expect(screen.getByText('이 매매, 기억나는 이유가 있나요?')).toBeInTheDocument();
    expect(screen.queryByText(/왜/)).not.toBeInTheDocument();
  });

  it('shows the tag names when the trade has rationale tags', () => {
    const tags = [{ id: 't1', name: '물타기', archived: false, createdAt: new Date().toISOString(), order: 0 }];
    render(
      <TradeBottomSheet trade={{ ...baseTrade, rationaleTagIds: ['t1'] }} tags={tags} onClose={() => {}} />
    );
    expect(screen.getByText('물타기')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<TradeBottomSheet trade={baseTrade} tags={[]} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
