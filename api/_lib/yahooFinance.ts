// Yahoo Finance 비공식 API를 통해 한국 주식(KRX) 시세 및 히스토리를 조회합니다.
// - 종목 코드: 005930 → Yahoo에서는 005930.KS (코스피) 또는 005930.KQ (코스닥) suffix 필요
// - .KS / .KQ suffix는 검색 결과의 symbol 값에 이미 포함되어 있음
// - 시세는 15분 지연 데이터

interface YahooChartMeta {
  regularMarketPrice: number;
  // Yahoo Finance가 상황에 따라 다른 필드명으로 전일 종가를 내려줌
  previousClose?: number;
  chartPreviousClose?: number;
  regularMarketPreviousClose?: number;
  // 등락률을 직접 내려주는 경우도 있음
  regularMarketChangePercent?: number;
  currency: string;
}

interface YahooChartResult {
  meta: YahooChartMeta;
  timestamp?: number[];
  indicators?: {
    quote: {
      open: (number | null)[];
      high: (number | null)[];
      low: (number | null)[];
      close: (number | null)[];
    }[];
  };
}

interface YahooChartResponse {
  chart: {
    result: YahooChartResult[] | null;
    error: { code: string; description: string } | null;
  };
}

function ensureYahooSuffix(symbol: string): string {
  // 이미 .KS / .KQ suffix가 붙어있으면 그대로 사용
  if (/\.(KS|KQ)$/i.test(symbol)) return symbol;
  // 숫자로만 이루어진 6자리 → 코스피로 가정하여 .KS 추가
  if (/^\d{6}$/.test(symbol)) return `${symbol}.KS`;
  return symbol;
}

async function yahooChartFetch(symbol: string, params: Record<string, string>): Promise<YahooChartResult> {
  const search = new URLSearchParams(params);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${search.toString()}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TradeReview/1.0)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Yahoo Finance request failed: ${res.status}`);
  const data = (await res.json()) as YahooChartResponse;
  if (data.chart.error) {
    throw new Error(`Yahoo Finance error: ${data.chart.error.description}`);
  }
  const result = data.chart.result?.[0];
  if (!result) throw new Error(`Yahoo Finance returned no data for ${symbol}`);
  return result;
}

export async function yahooFinanceQuote(
  symbol: string
): Promise<{ symbol: string; price: number; dailyChangePercent: number | null }> {
  const ySym = ensureYahooSuffix(symbol);
  const result = await yahooChartFetch(ySym, { interval: '1d', range: '5d' });
  const price = result.meta.regularMarketPrice;

  // 전일 종가 1순위: meta의 regularMarketPreviousClose (가장 신뢰도 높음)
  let prevClose: number | undefined =
    result.meta.regularMarketPreviousClose ??
    result.meta.chartPreviousClose ??
    result.meta.previousClose;

  // 2순위: indicators에 있는 실제 봉 데이터의 마지막 전일 종가
  if (!prevClose) {
    const closes = result.indicators?.quote[0]?.close ?? [];
    // null 제거 후 마지막 2개 중 끝에서 두 번째가 전일 종가
    const validCloses = closes.filter((c): c is number => c != null);
    if (validCloses.length >= 2) {
      prevClose = validCloses[validCloses.length - 2];
    }
  }

  const dailyChangePercent =
    prevClose && prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : null;

  return {
    symbol,
    price,
    dailyChangePercent: dailyChangePercent != null && !Number.isNaN(dailyChangePercent) ? dailyChangePercent : null,
  };
}

export async function yahooFinanceHistory(
  symbol: string
): Promise<{ date: string; open: number; high: number; low: number; price: number }[]> {
  const ySym = ensureYahooSuffix(symbol);
  // 20년치 데이터를 최대한 가져옴
  const toTs = Math.floor(Date.now() / 1000);
  const fromTs = toTs - 20 * 365 * 24 * 60 * 60;
  const result = await yahooChartFetch(ySym, {
    interval: '1d',
    period1: String(fromTs),
    period2: String(toTs),
    includePrePost: 'false',
    events: 'history',
  });

  const timestamps = result.timestamp ?? [];
  const quotes = result.indicators?.quote[0];
  if (!quotes || timestamps.length === 0) return [];

  const bars: { date: string; open: number; high: number; low: number; price: number }[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = quotes.open[i];
    const high = quotes.high[i];
    const low = quotes.low[i];
    const close = quotes.close[i];
    if (open == null || high == null || low == null || close == null) continue;
    const date = new Date(timestamps[i]! * 1000).toISOString().slice(0, 10);
    bars.push({ date, open, high, low, price: close });
  }
  return bars;
}
