interface DataGoKrStockPriceRow {
  basDt: string;
  srtnCd: string;
  clpr: string;
  mkp: string;
  hipr: string;
  lopr: string;
  flttRt?: string;
}

interface DataGoKrResponse {
  response: {
    header: { resultCode: string; resultMsg: string };
    body?: {
      items: { item: DataGoKrStockPriceRow[] } | '';
      numOfRows: number;
      pageNo: number;
      totalCount: number;
    };
  };
}

function dataGoKrApiKey(): string {
  const key = process.env.DATA_GO_KR_API_KEY;
  if (!key) throw new Error('DATA_GO_KR_API_KEY is not set');
  return key;
}

function stripKrSuffix(symbol: string): string {
  return symbol.replace(/\.(ks|kq)$/i, '');
}

function formatBasDt(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

async function dataGoKrFetch(
  params: Record<string, string>
): Promise<{ rows: DataGoKrStockPriceRow[]; totalCount: number }> {
  const search = new URLSearchParams({
    ...params,
    serviceKey: dataGoKrApiKey(),
    resultType: 'json',
  });
  const res = await fetch(
    `http://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo?${search.toString()}`
  );
  if (!res.ok) throw new Error(`data.go.kr request failed: ${res.status}`);
  const data = (await res.json()) as DataGoKrResponse;
  if (data.response.header.resultCode !== '00') {
    throw new Error(`data.go.kr error: ${data.response.header.resultMsg}`);
  }
  const items = data.response.body?.items;
  const rows = !items || typeof items === 'string' ? [] : items.item;
  return { rows, totalCount: data.response.body?.totalCount ?? 0 };
}

export async function dataGoKrQuote(
  symbol: string
): Promise<{ symbol: string; price: number; dailyChangePercent: number | null }> {
  const { rows } = await dataGoKrFetch({ likeSrtnCd: stripKrSuffix(symbol), numOfRows: '10', pageNo: '1' });
  if (!rows[0]) throw new Error(`data.go.kr quote returned no data for ${symbol}`);
  const latest = rows.reduce((max, r) => (r.basDt > max.basDt ? r : max));
  const percent = latest.flttRt ? Number(latest.flttRt) : null;
  return {
    symbol,
    price: Number(latest.clpr.replace(/,/g, '')),
    dailyChangePercent: percent != null && !Number.isNaN(percent) ? percent : null,
  };
}

export async function dataGoKrHistory(
  symbol: string
): Promise<{ date: string; open: number; high: number; low: number; price: number }[]> {
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 20);
  const numOfRows = 1000;
  const rows: DataGoKrStockPriceRow[] = [];

  // 50 pages * 1000 rows = 50,000 rows is far beyond 20 years of trading days
  // (~5,000) - this bound only guards against a pathological API response,
  // it is never expected to be hit in practice.
  for (let pageNo = 1; pageNo <= 50; pageNo++) {
    const page = await dataGoKrFetch({
      likeSrtnCd: stripKrSuffix(symbol),
      beginBasDt: formatBasDt(from),
      endBasDt: formatBasDt(to),
      numOfRows: String(numOfRows),
      pageNo: String(pageNo),
    });
    rows.push(...page.rows);
    if (page.rows.length === 0 || rows.length >= page.totalCount) break;
  }

  return [...rows]
    .sort((a, b) => a.basDt.localeCompare(b.basDt))
    .map((r) => ({
      date: `${r.basDt.slice(0, 4)}-${r.basDt.slice(4, 6)}-${r.basDt.slice(6, 8)}`,
      open: Number(r.mkp.replace(/,/g, '')),
      high: Number(r.hipr.replace(/,/g, '')),
      low: Number(r.lopr.replace(/,/g, '')),
      price: Number(r.clpr.replace(/,/g, '')),
    }));
}
