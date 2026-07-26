import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TradeCalendar } from './TradeCalendar';
import type { Trade } from '../types';

const mockTrade: Trade = {
  id: '1',
  ticker: 'JOBY',
  name: 'Joby Aviation',
  market: 'US',
  side: 'buy',
  quantityType: 'shares',
  quantityValue: 50,
  quantity: 50,
  price: 16.3,
  currency: 'USD',
  datetime: '2025-10-15T00:00:00.000Z',
  datetimeUnknown: false,
  fxRateAtTrade: 1350,
  conviction: null,
  memo: '',
  attachment: null,
  recordedAt: '2025-10-15T00:00:00.000Z',
  rationaleTagIds: [],
};

describe('TradeCalendar', () => {
  it('renders calendar header with year and month', () => {
    render(<TradeCalendar trades={[mockTrade]} onSelect={() => {}} />);
    expect(screen.getByText('2025년 10월')).toBeInTheDocument();
  });

  it('calls onSelect when a day with trade record is clicked', async () => {
    const onSelect = vi.fn();
    render(<TradeCalendar trades={[mockTrade]} onSelect={onSelect} />);

    const tradeButton = screen.getByRole('button', { name: /2025-10-15/ });
    await userEvent.click(tradeButton);

    expect(onSelect).toHaveBeenCalledWith(mockTrade);
  });

  it('navigates months when clicking next/prev month buttons', async () => {
    render(<TradeCalendar trades={[mockTrade]} onSelect={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: '다음 달' }));
    expect(screen.getByText('2025년 11월')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '이전 달' }));
    expect(screen.getByText('2025년 10월')).toBeInTheDocument();
  });

  it('swipes left/right to navigate next/prev month', () => {
    const { container } = render(<TradeCalendar trades={[mockTrade]} onSelect={() => {}} />);
    const calendarDiv = container.firstChild as HTMLElement;

    // Swipe Left -> Next Month (2025-11)
    fireEvent.touchStart(calendarDiv, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(calendarDiv, { changedTouches: [{ clientX: 100, clientY: 100 }] });
    expect(screen.getByText('2025년 11월')).toBeInTheDocument();

    // Swipe Right -> Prev Month (2025-10)
    fireEvent.touchStart(calendarDiv, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(calendarDiv, { changedTouches: [{ clientX: 200, clientY: 100 }] });
    expect(screen.getByText('2025년 10월')).toBeInTheDocument();
  });
});
