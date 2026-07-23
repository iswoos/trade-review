import { describe, it, expect } from 'vitest';
import { EMPTY_POSITION_STATE, applyBuy, applySell, buildPosition } from './avgCost';

describe('applyBuy', () => {
  it('sets avgCost to the fill price on the first buy', () => {
    const state = applyBuy(EMPTY_POSITION_STATE, 11.36, 100);
    expect(state.avgCost).toBeCloseTo(11.36, 6);
    expect(state.totalQuantity).toBe(100);
  });

  it('computes the weighted average on a second buy', () => {
    const first = applyBuy(EMPTY_POSITION_STATE, 10, 10);
    const second = applyBuy(first, 20, 10);
    expect(second.avgCost).toBeCloseTo(15, 6);
    expect(second.totalQuantity).toBe(20);
  });
});

describe('applySell', () => {
  it('does not change avgCost, only totalQuantity and realizedPl', () => {
    const bought = applyBuy(EMPTY_POSITION_STATE, 10, 10);
    const sold = applySell(bought, 15, 4);
    expect(sold.avgCost).toBeCloseTo(10, 6);
    expect(sold.totalQuantity).toBe(6);
    expect(sold.realizedPl).toBeCloseTo((15 - 10) * 4, 6);
  });

  it('accumulates realizedPl across multiple sells', () => {
    const bought = applyBuy(EMPTY_POSITION_STATE, 10, 10);
    const firstSell = applySell(bought, 15, 4);
    const secondSell = applySell(firstSell, 8, 2);
    expect(secondSell.realizedPl).toBeCloseTo((15 - 10) * 4 + (8 - 10) * 2, 6);
  });
});

describe('buildPosition', () => {
  it('naturally resets avgCost after a full sell followed by a rebuy (no special-case needed)', () => {
    const state = buildPosition([
      { side: 'buy', price: 10, quantity: 10 },
      { side: 'sell', price: 12, quantity: 10 }, // fully exits, totalQuantity -> 0
      { side: 'buy', price: 20, quantity: 5 }, // fresh position
    ]);
    expect(state.totalQuantity).toBe(5);
    expect(state.avgCost).toBeCloseTo(20, 6);
    expect(state.realizedPl).toBeCloseTo((12 - 10) * 10, 6);
  });

  it('reproduces a JOBY-like buy/sell/rebuy sequence', () => {
    const state = buildPosition([
      { side: 'buy', price: 11.36, quantity: 100 },
      { side: 'buy', price: 11.59, quantity: 50 },
      { side: 'sell', price: 17.16, quantity: 80 },
      { side: 'buy', price: 14.97, quantity: 10 },
      { side: 'buy', price: 13.77, quantity: 22 },
    ]);
    // avgCost after the two buys: (11.36*100 + 11.59*50) / 150
    // sell doesn't touch avgCost; remaining 70 @ that avgCost, then two more buys blend in
    const afterFirstTwoBuys = (11.36 * 100 + 11.59 * 50) / 150;
    const afterSell = { totalQuantity: 70, avgCost: afterFirstTwoBuys };
    const afterThirdBuy =
      (afterSell.avgCost * afterSell.totalQuantity + 14.97 * 10) / (afterSell.totalQuantity + 10);
    const afterFourthBuy =
      (afterThirdBuy * 80 + 13.77 * 22) / (80 + 22);
    expect(state.totalQuantity).toBe(102);
    expect(state.avgCost).toBeCloseTo(afterFourthBuy, 6);
  });
});
