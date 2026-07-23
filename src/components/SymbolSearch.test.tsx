import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SymbolSearch } from './SymbolSearch';
import * as quotes from '../api/quotes';

vi.mock('../api/quotes');

describe('SymbolSearch', () => {
  it('shows search results and reports the selected symbol', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([
      { symbol: 'JOBY', name: '조비', exchange: 'NYQ' },
    ]);
    const onSelect = vi.fn();
    render(<SymbolSearch onSelect={onSelect} />);

    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    const option = await screen.findByRole('button', { name: /조비/ });
    await userEvent.click(option);

    expect(onSelect).toHaveBeenCalledWith({ symbol: 'JOBY', name: '조비', exchange: 'NYQ' });
  });
});
