# 설계 결정 / TODO (문서 ↔ 구현 판단 기록)

`10_CLAUDE_CODE_DEV_PROMPT_v1.0.md` 지침에 따라, 문서가 선택지를 열어두었거나 문서 간 해석이 필요한 항목을 여기에 기록한다. 각 항목은 문서 근거와 구현 결정을 함께 적는다.

## DECISION

| # | 항목 | 문서 근거 | 결정 |
|---|---|---|---|
| D-01 | Runtime | 07 §14: Python/Node/.NET 중 고객사 허용 Runtime | **Node.js 내장 모듈만 사용, npm 의존성 0건.** 오프라인 패키징 시 Runtime 설치 파일만 필요. |
| D-02 | Frontend 빌드 | 05, UI 가이드: Component 기반 | **Vanilla JS ES Module SPA, 빌드 없음.** 파일 그대로 서빙되어 폐쇄망 배포/검증이 단순하다. Component는 `frontend/js/ui.js`, `pages/*`로 모듈화. |
| D-03 | Chart | E12-04: offline bundled library 또는 native SVG | **네이티브 SVG.** 외부 라이브러리 없음. 팔레트는 CVD 검증 통과값 사용. |
| D-04 | Re-open KPI 정의 | 02 §26 `reopenedCurrent`, 00 §6 "Re-open은 별도 KPI" | **REOPENED 이력이 있고 현재 CLOSED/CANCEL이 아닌 Issue 수.** Drill-down `reopened=true` 동일 기준. |
| D-05 | 장기 미조치(stale) | 09 §13 "updatedAt 또는 조치 이벤트 없음" | **status OPEN/IN_PROGRESS이고 `updatedAt`이 staleIssueDays 이상 경과.** (Comment 등 모든 변경이 updatedAt을 갱신하므로 "활동 없음"과 동일) |
| D-06 | Re-open 시 배포 상태 | 미정의 | **DEPLOYED → NOT_DEPLOYED로 되돌리고 이전 배포 정보는 `deployment.previous` 및 History에 보존.** 재조치 후 새 배포가 필요하다는 업무 의미를 반영해 배포대기 KPI가 정확해진다. |
| D-07 | Comment 작성 권한 | 01 §18, 06 §2: Reporter/Assignee/Admin | **관계자만 작성.** 비관계자는 조회만 가능(403). |
| D-08 | 첨부 다운로드 권한 | 02 §24 "권한 있는 사용자" | **세션이 있는 프로젝트 사용자 전원.** 프로젝트 단위 공동 사용 전제(UI 가이드 §2.1). |
| D-09 | Admin Close | 01 §17 MVP 권장 | **VERIFIED 또는 AGREED 중 선택.** Admin이 AGREED를 선택해도 합의내용 필수. 별도 Admin Close 유형 없음(통계 의미 유지). |
| D-10 | Admin 강제 변경 → CLOSED | 미정의 | close.type이 없으면 `AGREED` + comment에 `[관리자 강제 변경] 사유`를 기록. DONE으로 강제 시 `firstResolvedAt` 최초 1회 기록. IN_PROGRESS로 되돌리면 reopenCount 증가. |
| D-11 | 세션 저장 | 02 §12 HttpOnly Cookie 권장 | **메모리 세션(12h sliding), HttpOnly + SameSite=Strict + Custom Header(CSRF).** 서버 재시작 시 사용자는 "이 사용자로 시작"을 다시 누른다(사번은 브라우저 localStorage에만 저장). |
| D-12 | Title | 09 §1 title 필수 | Reporter 입력 없이 **symptom/request/question 첫 줄 80자**로 자동 생성. 등록내용 수정 시 재생성. |
| D-13 | Cancel 집계 | 01 §11 "Cancel은 별도 Filter" | **목록/대시보드 기본 집합에서 제외.** `status=CANCEL`, `status=ALL`, `includeCancel=true`로 조회. Dashboard 전체 KPI에 "Cancel N건 별도" 표시. |
| D-14 | 검증 순서 | - | 요청 본문 검증(400) → 권한(403) → 상태전이(409) 순. 권한 없는 사용자가 잘못된 본문을 보내면 400을 먼저 받는다. |
| D-15 | Comment 첨부 | 02 §23 attachmentIds | 첨부는 Issue 첨부로 업로드한 뒤 Comment가 attachmentId를 참조. |
| D-16 | Kanban 표시 한도 | - | 500건. 초과 시 안내 문구로 필터 유도. |
| D-17 | Dashboard 기간 필터 | 02 §27 | "최근 N일"은 createdAt 기준 집합. KPI는 그 집합의 현재 상태. Burn Up/일자별 차트는 동일 집합에서 계산. |
| D-18 | Priority Tailoring | 01 §21 Tab C | 코드(CRITICAL/MAJOR/MINOR)는 고정, displayName/description/active/order만 변경. 비활성 Priority는 신규 지정 불가, 기존 값은 유지. |
| D-19 | 사용자 삭제 | 02 §35 | 삭제 없음, active=false. 본인 Admin 해제/비활성화 및 마지막 활성 Admin 해제 금지. |
| D-20 | 손상 파일 처리 | 07 §17 | 시작 시 파싱 실패 Issue를 격리(corrupted)하고 해당 ID 쓰기 차단. users/config/sequence 손상 시 서비스 시작 중단. sequence.json 유실 시 Issue 파일 기준 자동 보정. |
| D-21 | Audit 실패 | - | Issue 저장 성공 후 Audit append 실패 시 Issue 저장을 되돌리지 않고 error 로그에 기록. (History는 Issue 파일에도 있으므로 유실 없음) |
| D-22 | 로그 | 07 §16 | access 로그는 requestId/method/path/status/elapsed/errorCode만 기록. Comment 본문/첨부 미기록. |

## TODO (운영 전 확인)

| # | 항목 | 내용 |
|---|---|---|
| T-01 | KT 로고 | `frontend/assets/kt-logo.svg`는 텍스트 placeholder. 공식 로고 파일(SVG/PNG)로 교체 필요(Aspect ratio 유지, 32~40px). |
| T-02 | 폰트 | 시스템 폰트 fallback(Malgun Gothic 등). Pretendard/Noto Sans KR 사용 시 폰트 파일을 `frontend/assets/fonts/`에 포함하고 `app.css`에 `@font-face` 추가. |
| T-03 | HTTPS | 내부 인증서 사용 시 리버스 프록시(예: 내부 Nginx/IIS) 또는 `https.createServer`로 확장. 현재는 HTTP. Secure cookie는 TLS 소켓 감지 시 자동. |
| T-04 | 다중 프로세스 | 단일 Node 프로세스가 data 디렉터리를 독점하는 전제. 다중 인스턴스 운영은 지원하지 않음(파일 lock은 프로세스 내 mutex). |
| T-05 | 대용량 성능 | Issue 전량 메모리 캐시. 5,000건 규모까지 검증 목표(08 §15). 초과 시 Dashboard cache JSON 도입 검토(04 §10). |
| T-06 | E2E 브라우저 자동화 | 검증은 Edge headless(puppeteer-core, 개발 PC 전용)로 수행. 폐쇄망 내 자동화 도구가 없으면 `docs/RELEASE_GATE.md`의 수동 시나리오로 UAT. |
