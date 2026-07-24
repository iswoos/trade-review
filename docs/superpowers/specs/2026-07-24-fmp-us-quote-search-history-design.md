# 미국 주식 시세 소스를 FMP로 전환 (검색/시세/과거시세)

## 배경

프로덕션(`trade-review-eight.vercel.app`)에서 `/api/search`, `/api/quote`가 502를 반환하는 문제를 조사한 결과, 근본 원인은 우리 코드가 아니라 Yahoo Finance 쪽의 rate limit(HTTP 429 "Too Many Requests")이었다. `yahoo-finance2`가 이 비-JSON 응답을 파싱하려다 던지는 예외를, 각 핸들러의 `catch` 블록이 실제 원인 없이 502로 뭉뚱그려 반환하고 있었다. 재현 결과 미국 종목(`AAPL`)과 한국 종목(`005930.KS`) 모두, `quote`/`search` 양쪽 모두 동일하게 실패해 입력값과 무관한 전면 장애임을 확인했다.

대체 무료 API를 조사했으나(Alpha Vantage 25회/일, Twelve Data KRX 유료 전용, iTick/Infoway 미검증, Stooq는 JS PoW 챌린지로 서버 호출 자체가 막힘, 한국투자증권 KIS Developers는 증권 계좌 필요) 계좌 연동 없이 검증 가능한 대안이 없었다. 이후 사용자가 별도 개인 프로젝트(`stock_support`, Java/Gradle)에 이미 발급받아 사용 중인 Financial Modeling Prep(FMP) API 키를 제시했고, 직접 호출 테스트로 `quote`/`search-symbol`/`historical-price-eod`(신규 `/stable/*` 엔드포인트) 세 기능이 모두 정상 동작함을 확인했다. 단, FMP·Finnhub 모두 free tier에서 한국 종목(`.KS`/`.KQ`) quote는 접근이 막혀 있다(직접 테스트로 403 상당 에러 확인).

**이번 작업 범위는 미국 종목만이다.** 한국 종목은 여전히 `yahoo-finance2`를 그대로 사용하며(현재 Yahoo 쪽 rate limit이 풀리기 전까지는 계속 실패할 수 있음), 그 회복력 개선(재시도/로깅)은 별도 작업으로 미룬다.

## 아키텍처

각 서버리스 함수는 심볼이 한국 종목 패턴(`/\.(KS|KQ)$/i`)인지로 분기한다:

- 한국 종목(`.KS`/`.KQ`) → 기존 `yahoo-finance2` 경로 그대로, 변경 없음.
- 그 외(미국 종목으로 간주) → FMP `/stable/*` 엔드포인트.

```
symbol/query
   │
   ├─ .KS / .KQ 로 끝남 ──▶ yahoo-finance2 (기존 그대로)
   │
   └─ 그 외 ──▶ FMP (/stable/quote, /stable/historical-price-eod/light)
```

`/api/search`만 예외로, 심볼이 아니라 자유 텍스트 검색어라 어느 시장인지 미리 알 수 없다. FMP `search-symbol`과 `yahoo-finance2.search()`를 **병렬로 호출**해 결과를 합친다(`Promise.allSettled`) — 한쪽이 실패해도 다른 쪽 결과는 살아남는다. 이는 지금 프로덕션에서 검색이 완전히 죽어 있는 상황을 FMP 쪽만으로도 즉시 완화한다.

## 컴포넌트별 변경

**공통: `api/_lib/fmp.ts` (신규)**
- `isKoreanSymbol(symbol: string): boolean` — `.KS`/`.KQ` 접미사 판별
- `fmpFetch(path: string, params: Record<string,string>)` — `process.env.FMP_API_KEY`를 붙여 `https://financialmodelingprep.com/stable/{path}` 호출, 응답이 `ok`가 아니거나 파싱 실패 시 예외를 던짐

**`api/quote.ts`**
- 한국 종목: 기존 로직 그대로.
- 미국 종목: FMP `/stable/quote?symbol=...` 호출 → 배열의 첫 원소에서 `price` 추출, `currency`는 `'USD'`로 고정(이 분기는 미국 종목 전용이므로).

**`api/history.ts`**
- 한국 종목: 기존 로직 그대로.
- 미국 종목: FMP `/stable/historical-price-eod/light?symbol=...` 호출(1년치 확보를 위해 `from`/`to` 또는 충분한 range 파라미터 사용) → `{date, price}` 배열을 `{date, close: price}`로 매핑. FMP는 최신순으로 내려주므로 기존 `yahoo-finance2.chart()`와 동일하게 날짜 오름차순으로 정렬해 반환.

**`api/search.ts`**
- `Promise.allSettled([fmpSearch(query), yahooFinance.search(query)])`로 병렬 조회.
- 각 소스 결과를 기존 `SymbolResult{symbol,name,exchange}` 형태로 매핑 후 심볼 기준 중복 제거(dedupe)하여 합침.
- 두 소스 모두 실패한 경우에만 502.

프런트엔드(`src/api/quotes.ts`, 컴포넌트)는 응답 스키마가 동일하게 유지되므로 변경 불필요.

## 시크릿 관리

- `FMP_API_KEY` 하나만 이 프로젝트로 가져온다. `stock_support`의 나머지 키(Finnhub/FRED/WhaleWisdom)는 가져오지 않는다.
- 로컬 개발: `.env.local`에 추가 — 이미 `.gitignore`에 `.env*`가 있어 커밋되지 않음(오늘 새벽 세션에서 추가됐고 아직 커밋 대기 중인 변경사항).
- 프로덕션/프리뷰: `vercel env add FMP_API_KEY`로 Vercel 프로젝트 환경변수에 등록(이미 `.vercel`로 프로젝트 연결되어 있음). 코드에는 `process.env.FMP_API_KEY`로만 접근.

## 에러 처리

- `quote`/`history`의 미국 분기: FMP 호출 실패 시 기존과 동일하게 502 + 일반 에러 메시지. (이번 범위에서는 재시도/상세 로깅을 추가하지 않음 — 별도 작업.)
- `search`: 부분 실패를 허용(위 참고). 두 소스 모두 실패 시에만 502.

## 테스트

기존 컨벤션(`vi.mock`, `mockRes()`)을 따른다:
- `api/quote.test.ts`, `api/history.test.ts`: 미국 심볼 케이스에서 FMP 호출 경로를 `fetch` mock으로 검증하는 테스트 추가, 기존 한국 심볼 케이스는 그대로 유지.
- `api/search.test.ts`: 한쪽 소스만 실패해도 다른 쪽 결과가 반환되는 케이스 추가.
- `api/_lib/fmp.test.ts` (신규): `isKoreanSymbol` 분기 로직 단위 테스트.

## 문서화

- ADR-0009 추가: "미국 종목 시세는 FMP, 한국 종목은 yahoo-finance2를 유지하는 하이브리드 구성" — 이번 조사에서 확인된 사실(Yahoo rate limit 실제 발생, FMP 무료 티어로 미국 quote/search/history 전부 확인됨, 한국 quote는 FMP/Finnhub 모두 free tier에서 불가)을 근거로 기록.
