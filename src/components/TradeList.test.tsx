import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TradeList } from './TradeList';
import type { Trade } from '../types';

const trade: Trade = {
  id: '1', ticker: 'JOBY', market: 'US', name: '조비', currency: 'USD',
  datetime: '2025-10-15T00:00:00.000Z', datetimeUnknown: false, side: 'buy',
  price: 16.3, quantityType: 'shares', quantityValue: 50, quantity: 50,
  fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '',
  attachment: null, recordedAt: '2025-10-15T00:05:00.000Z',
};

describe('TradeList', () => {
  it('renders one row per trade and reports the clicked trade', async () => {
    const onSelect = vi.fn();
    render(<TradeList trades={[trade]} tags={[]} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /2025-10-15/ }));
    expect(onSelect).toHaveBeenCalledWith(trade);
  });
});
