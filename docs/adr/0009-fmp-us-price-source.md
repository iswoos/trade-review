# 미국 종목 시세는 FMP, 한국 종목은 yahoo-finance2를 유지하는 하이브리드 구성

프로덕션에서 `/api/quote`, `/api/search`가 502를 반환하는 문제를 조사한 결과, 근본 원인은 우리 코드가 아니라 Yahoo Finance 쪽의 rate limit(HTTP 429 "Too Many Requests")이었다. 미국 종목(`AAPL`)과 한국 종목(`005930.KS`) 모두, quote/search 양쪽 모두 동일하게 실패해 입력값과 무관한 전면 장애임을 직접 재현으로 확인했다. 대체 무료 API를 조사했으나(Alpha Vantage 일 25회, Twelve Data KRX 유료 전용, iTick/Infoway는 공식 문서로 검증 안 됨, Stooq는 JS proof-of-work 챌린지로 서버 호출 자체가 막힘, 한국투자증권 KIS Developers는 증권 계좌 필요) 계좌 연동 없이 검증 가능한 대안이 없었다.

이후 별도 개인 프로젝트(`stock_support`)에서 이미 사용 중인 Financial Modeling Prep(FMP) API 키로 직접 호출 테스트한 결과, 신규 `/stable/*` 엔드포인트(`quote`, `search-symbol`, `historical-price-eod/light`)가 미국 종목에 대해 정상 동작함을 확인했다. 단, FMP·Finnhub 모두 free tier에서 한국 종목(`.KS`/`.KQ`) quote는 접근이 막혀 있다(직접 호출로 403 상당 에러 확인). 이 때문에 두 시장을 한 번에 커버하는 무료 단일 소스는 없다고 결론짓고, 심볼이 `.KS`/`.KQ`로 끝나면 기존 yahoo-finance2 경로, 그 외(미국)는 FMP 경로로 나누는 하이브리드 구성을 택했다. 검색만 예외로 두 소스를 병렬 호출해 결과를 합치는데, 어느 한쪽이 지금의 Yahoo처럼 완전히 막혀도 다른 쪽 결과로 서비스가 계속되게 하기 위함이다.

한국 종목은 여전히 yahoo-finance2에 의존하므로 ADR-0005의 리스크("비공식 API라 Yahoo가 구조를 바꾸면 깨질 수 있다")가 그대로 남아있다. 이 리스크에 대한 회복력 개선(429 재시도, 실제 에러 로깅)은 이번 작업 범위에 포함하지 않고 별도로 다룬다.
