# Trade Review (매매 복기)

개인 투자자가 실제 매수·매도 체결과 그 근거를 하나의 타임라인으로 기록하고 복기하는 도구입니다.
"성적표"가 아니라 "거울"을 지향합니다 — 매매를 평가하기보다, 왜 그런 판단을 했는지 스스로 돌아볼 수 있게 돕습니다.

## 주요 기능

- 매수·매도 체결 기록 (평단, 실현손익 자동 계산)
- 매매 근거 태그(Rationale Tag) 관리 — 이름 변경/보관 가능, 하드 삭제 없음
- 종목 시세 차트 (이동평균선) 및 캘린더 뷰로 매매 타임라인 확인
- 원화 금액 입력 시 체결 시점 환율 기준 자동 환산
- 근거·확신도·메모가 비어 있을 때 부담 없는 "채우기 유도" 문구 제공
- 오프라인 우선 저장 (IndexedDB), 다크모드 지원

## 기술 스택

- **프론트엔드**: React 18, TypeScript, Vite, Tailwind CSS 4
- **차트**: lightweight-charts
- **로컬 저장소**: IndexedDB (`idb`)
- **시세 API**: Vercel 서버리스 함수(`/api`)에서 프록시 — 한국 종목은 yahoo-finance2, 미국 종목은 FMP(Financial Modeling Prep)
- **테스트**: Vitest, Testing Library
- **배포**: Vercel (프론트엔드 + 서버리스 함수 단일 저장소/단일 배포)

## AI 활용

이 프로젝트는 [Claude Code](https://claude.com/claude-code)로, 아래 순서에 따라 스펙 정리부터 구현까지 진행했습니다.

1. **Karpathy 가이드라인** (`andrej-karpathy-skills`) — 전 과정에 적용되는 원칙.
   과도한 설계와 불필요한 추상화를 피하고, 외과적으로 정확한 변경만 하며, 숨은 가정을 표면화하고, 검증 가능한 성공 기준을 먼저 정의.

2. **Wayfinder** (`mattpocock-skills:domain-modeling`, `codebase-design`, `grilling`) — 스펙·도메인 정리 단계.
   도메인 용어집(`CONTEXT.md`)을 만들고, 근거가 약한 결정은 `grill`로 집요하게 검증한 뒤 아키텍처 결정 기록(`docs/adr`)으로 남김. 이 저장소의 `CONTEXT.md` + `docs/adr` 구조가 그 결과물.

3. **Superpowers** (`superpowers`) — 구현 단계.
   브레인스토밍 → 체계적 디버깅 → TDD → 코드 리뷰 요청/수신 → 브랜치 마무리로 이어지는 표준 워크플로우로 실제 코드 작성을 처리.

모든 코드는 사람이 검토하고 승인한 뒤 반영됩니다.

## 프로젝트 구조

```
src/
  components/   화면·UI 컴포넌트
  db/           IndexedDB 스키마 및 CRUD (trades, positions, tags)
  api/          프론트엔드에서 시세 API를 호출하는 클라이언트
  lib/          도메인 로직 (평단/손익 계산 등)
  data/         정적 데이터
api/            Vercel 서버리스 함수 (quote, search, history, fxrate)
docs/
  adr/          아키텍처 결정 기록 (ADR)
  agents/       AI 에이전트용 작업 가이드 (이슈 트래커, 도메인 문서 규칙)
CONTEXT.md      도메인 용어 정의 (평단, 실현손익, 근거 태그 등)
```

## 시작하기

### 요구 사항

- Node.js 20 이상 (`.nvmrc` 참고)

### 설치 및 개발 서버 실행

```bash
npm install
npm run dev
```

### 빌드

```bash
npm run build
```

### 테스트

```bash
npm run test
```

## 환경 변수

로컬 개발 시 `.env.local`에 다음 값이 필요합니다:

- `FMP_API_KEY` — 미국 종목 시세 조회용 Financial Modeling Prep API 키

## 문서

- [CONTEXT.md](./CONTEXT.md) — 도메인 용어 정의
- [docs/adr](./docs/adr) — 아키텍처 결정 기록
- [docs/agents](./docs/agents) — 이슈 트래커 및 도메인 문서 작성 가이드
