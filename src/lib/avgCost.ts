export interface PositionState {
  totalQuantity: number;
  avgCost: number;
  realizedPl: number;
}

export const EMPTY_POSITION_STATE: PositionState = {
  totalQuantity: 0,
  avgCost: 0,
  realizedPl: 0,
};

export function applyBuy(state: PositionState, price: number, quantity: number): PositionState {
  const totalQuantity = state.totalQuantity + quantity;
  const avgCost = (state.avgCost * state.totalQuantity + price * quantity) / totalQuantity;
  return { totalQuantity, avgCost, realizedPl: state.realizedPl };
}

export function applySell(state: PositionState, price: number, quantity: number): PositionState {
  const realizedPl = state.realizedPl + (price - state.avgCost) * quantity;
  return {
    totalQuantity: state.totalQuantity - quantity,
    avgCost: state.avgCost,
    realizedPl,
  };
}

export function buildPosition(
  trades: { side: 'buy' | 'sell'; price: number; quantity: number }[]
): PositionState {
  return trades.reduce(
    (state, t) =>
      t.side === 'buy' ? applyBuy(state, t.price, t.quantity) : applySell(state, t.price, t.quantity),
    EMPTY_POSITION_STATE
  );
}
