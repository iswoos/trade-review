// 공공데이터포털 KRX상장종목정보 API에서 전체 상장종목 목록을 받아와
// src/data/krx-listing.json을 갱신하는 1회성/수시 실행 스크립트.
// (자동화하지 않음 — 신규상장/상장폐지가 있을 때만 사용자가 수동 실행)
//
// 실행: DATA_GO_KR_API_KEY=<발급받은키> node scripts/fetch-krx-listing.mjs
import { writeFileSync } from 'node:fs';

const API_KEY = process.env.DATA_GO_KR_API_KEY;
if (!API_KEY) {
  console.error('DATA_GO_KR_API_KEY 환경변수가 필요합니다.');
  process.exit(1);
}

function suffixForMarket(mrktCtg) {
  return mrktCtg === 'KOSDAQ' ? '.KQ' : '.KS';
}

function formatBasDt(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

async function fetchPage(basDt, pageNo, numOfRows) {
  const params = new URLSearchParams({
    serviceKey: API_KEY,
    resultType: 'json',
    basDt,
    numOfRows: String(numOfRows),
    pageNo: String(pageNo),
  });
  const res = await fetch(
    `http://apis.data.go.kr/1160100/service/GetKrxListedInfoService/getItemInfo?${params.toString()}`
  );
  if (!res.ok) throw new Error(`data.go.kr request failed: ${res.status}`);
  return res.json();
}

// This API's response is a historical daily log (one row per stock per trading
// day, millions of rows total), not just "currently listed companies" — a
// basDt filter is required to get a single day's snapshot. Walk backward from
// today to find the most recent trading day with data (weekends/holidays have
// none).
async function fetchLatestSnapshot(numOfRows) {
  const day = new Date();
  for (let attempt = 0; attempt < 10; attempt++) {
    const basDt = formatBasDt(day);
    const first = await fetchPage(basDt, 1, numOfRows);
    if (first.response.header.resultCode !== '00') {
      throw new Error(`data.go.kr error: ${first.response.header.resultMsg}`);
    }
    if (first.response.body.totalCount > 0) {
      return { basDt, first };
    }
    day.setDate(day.getDate() - 1);
  }
  throw new Error('최근 10일 내 거래일 데이터를 찾지 못했습니다.');
}

async function main() {
  const numOfRows = 1000;
  const { basDt, first } = await fetchLatestSnapshot(numOfRows);
  const totalCount = first.response.body.totalCount;
  const rows = first.response.body.items === '' ? [] : first.response.body.items.item;
  console.log(`기준일자(basDt): ${basDt}, 총 ${totalCount}개 종목`);

  const totalPages = Math.ceil(totalCount / numOfRows);
  for (let page = 2; page <= totalPages; page++) {
    const next = await fetchPage(basDt, page, numOfRows);
    const nextRows = next.response.body.items === '' ? [] : next.response.body.items.item;
    rows.push(...nextRows);
  }

  const seen = new Set();
  const listing = [];
  for (const row of rows) {
    // GetKrxListedInfoService prefixes every code with "A" (e.g. "A005930"),
    // but GetStockSecuritiesInfoService (used for quote/history) identifies
    // the same stock as plain "005930" — strip it so search results use the
    // code the quote/history API actually recognizes.
    const code = row.srtnCd.replace(/^A/, '');
    const symbol = `${code}${suffixForMarket(row.mrktCtg)}`;
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    listing.push({ symbol, name: row.itmsNm });
  }

  writeFileSync('src/data/krx-listing.json', JSON.stringify(listing, null, 2) + '\n');
  console.log(`src/data/krx-listing.json 갱신 완료: ${listing.length}개 종목`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
