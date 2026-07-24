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

async function fetchPage(pageNo, numOfRows) {
  const params = new URLSearchParams({
    serviceKey: API_KEY,
    resultType: 'json',
    numOfRows: String(numOfRows),
    pageNo: String(pageNo),
  });
  const res = await fetch(
    `http://apis.data.go.kr/1160100/service/GetKrxListedInfoService/getItemInfo?${params.toString()}`
  );
  if (!res.ok) throw new Error(`data.go.kr request failed: ${res.status}`);
  return res.json();
}

async function main() {
  const numOfRows = 1000;
  const first = await fetchPage(1, numOfRows);
  if (first.response.header.resultCode !== '00') {
    throw new Error(`data.go.kr error: ${first.response.header.resultMsg}`);
  }
  const totalCount = first.response.body.totalCount;
  const rows = first.response.body.items === '' ? [] : first.response.body.items.item;

  const totalPages = Math.ceil(totalCount / numOfRows);
  for (let page = 2; page <= totalPages; page++) {
    const next = await fetchPage(page, numOfRows);
    const nextRows = next.response.body.items === '' ? [] : next.response.body.items.item;
    rows.push(...nextRows);
  }

  const seen = new Set();
  const listing = [];
  for (const row of rows) {
    const symbol = `${row.srtnCd}${suffixForMarket(row.mrktCtg)}`;
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
