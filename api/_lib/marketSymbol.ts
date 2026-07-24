export function isKoreanSymbol(symbol: string): boolean {
  return /\.(ks|kq)$/i.test(symbol);
}
