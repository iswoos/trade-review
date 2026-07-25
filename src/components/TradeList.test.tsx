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

  it('shows no memo preview or 더보기 button when the trade has no memo', () => {
    render(<TradeList trades={[trade]} tags={[]} onSelect={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '더보기' })).not.toBeInTheDocument();
  });

  it('clamps a long memo to 3 lines and expands/collapses it via 더보기/접기', async () => {
    const longMemo = '이 매매는 실적발표 직전에 진입했고, 이후 변동성이 커질 것으로 예상했다. 장기 보유 관점에서 접근했다.';
    render(<TradeList trades={[{ ...trade, memo: longMemo }]} tags={[]} onSelect={vi.fn()} />);

    const preview = screen.getByText(longMemo);
    expect(preview).toHaveClass('line-clamp-3');

    await userEvent.click(screen.getByRole('button', { name: '더보기' }));
    expect(screen.getByText(longMemo)).not.toHaveClass('line-clamp-3');
    expect(screen.getByRole('button', { name: '접기' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '접기' }));
    expect(screen.getByText(longMemo)).toHaveClass('line-clamp-3');
  });
});
