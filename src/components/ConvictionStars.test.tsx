import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConvictionStars } from './ConvictionStars';

describe('ConvictionStars', () => {
  it('reports the clicked star value', async () => {
    const onChange = vi.fn();
    render(<ConvictionStars value={null} onChange={onChange} />);
    const stars = screen.getAllByRole('radio');
    await userEvent.click(stars[2]);
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('clicking the already-selected value clears it (stays optional)', async () => {
    const onChange = vi.fn();
    render(<ConvictionStars value={3} onChange={onChange} />);
    const stars = screen.getAllByRole('radio');
    await userEvent.click(stars[2]);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
