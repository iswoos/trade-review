export function simpleMovingAverage(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i + 1 < window) return null;
    const slice = values.slice(i + 1 - window, i + 1);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / window;
  });
}
