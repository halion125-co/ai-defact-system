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
| D-14 | 검증 순서 | - | 요청 본문 검증(400) → 권한(403) → 상태전이(409 INVALID_STATE_TRANSITION) → revision 비교(409 REVISION_CONFLICT) 순. 권한 없는 사용자는 revision이 오래되어도 403을 받는다. 파일 쓰기 등 부수효과가 있는 처리는 `ctx.assertRevision()`으로 먼저 충돌을 확인한다. |
| D-15 | Comment 첨부 | 02 §23 attachmentIds | 첨부는 Issue 첨부로 업로드한 뒤 Comment가 attachmentId를 참조. |
| D-16 | Kanban 표시 한도 | - | 500건. 초과 시 안내 문구로 필터 유도. |
| D-17 | Dashboard 기간 필터 | 02 §27 | "최근 N일"은 createdAt 기준 집합. KPI는 그 집합의 현재 상태. Burn Up/일자별 차트는 동일 집합에서 계산. |
| D-18 | Priority Tailoring | 01 §21 Tab C | 코드(CRITICAL/MAJOR/MINOR)는 고정, displayName/description/active/order만 변경. 비활성 Priority는 신규 지정 불가, 기존 값은 유지. |
| D-19 | 사용자 삭제 | 02 §35, 사용자 요청(2026-09-29, D-19 갱신) | **완전 삭제(레코드 제거) 지원.** 기존에는 "삭제 없음, active=false만" 이었으나, Admin에게 완전 삭제 권한을 요청받아 `DELETE /api/users/:userId`를 신설했다. Admin 전용, 본인 계정 삭제 불가, 마지막 활성 Admin 삭제 금지(기존 `update()`의 보호 로직과 동일). 삭제해도 기존 Issue의 등록자/조치자 표시는 스냅샷(nameSnapshot/teamSnapshot, D-25)으로 유지되어 깨지지 않지만, 그 userId로의 재조회(재로그인, 담당자 지정 등)는 이후 불가능해진다. 일상적인 비활성화(active=false)는 계속 지원하며 UI에서도 "완전 삭제보다 비활성화 권장" 안내를 유지한다. |
| D-20 | 손상 파일 처리 | 07 §17 | 시작 시 파싱 실패 Issue를 격리(corrupted)하고 해당 ID 쓰기 차단. users/config/sequence 손상 시 서비스 시작 중단. sequence.json 유실 시 Issue 파일 기준 자동 보정. |
| D-21 | Audit 실패 | - | Issue 저장 성공 후 Audit append 실패 시 Issue 저장을 되돌리지 않고 error 로그에 기록. (History는 Issue 파일에도 있으므로 유실 없음) |
| D-23 | 텍스트 정규화 | 01 §22 | 제어문자 제거, CR/CRLF→LF, 줄 끝 공백 제거, 3줄 이상 연속 빈 줄→2줄, 앞뒤 trim. 단일행 필드는 개행→공백. HTML은 escape하지 않고 원문 저장, 렌더링은 textContent. |
| D-24 | 숨김 Comment 마스킹 범위 | 04 §9 | 비관리자 응답에서 comments[].body/attachments/hiddenReason + history의 COMMENTED.comment, COMMENT_HIDDEN.originalBody/사유를 제거. 검색/Comment 카운트도 제외. Admin 응답과 파일/Audit은 원문 유지. |
| D-25 | 환경/사용자 이름 변경 시 표시 | 09 §5 스냅샷 | 환경: 목록/상세/Dashboard는 설정의 **현재 이름**(삭제된 환경은 스냅샷), 이력 이벤트는 스냅샷. 사용자: 등록자/조치자/이력 모두 **스냅샷 유지**(이름/소속 변경은 이후 Action부터 반영). |
| D-26 | Dashboard 유형 필터 | 01 §6.2 기본 Defect | 결함/개선요청/문의 각각 + **전체 유형(ALL)** 통합 뷰 제공. 조치 완료(firstResolvedAt)·Close(firstClosedAt) 집계는 유형에 무관하게 동일 규칙. 환경 분포만 결함 전용. |
| D-27 | 로그인 전 사용자 선택 방식 | 07 §3, 01 §4 "비밀번호 없는 사번 기반 식별" | 초기 화면의 "등록 사용자 선택" **드롭다운을 제거**했다. 사번을 몰라도 이름 목록에서 아무나 클릭해 로그인할 수 있었던 것은 사번 기반 식별 원칙을 무력화하는 문제였다. `/api/users/recent`는 이제 요청한 사번 1건의 표시 정보만 반환하며(브라우저가 기억한 직전 사용자 카드용), 파라미터 없이 호출하거나 존재/비활성 사번을 넣으면 빈 배열을 반환해 사번 존재 여부도 추측할 수 없다. 등록된 전체 사용자 목록은 Admin 전용 설정 화면(`GET /api/users`, 인증 필요)에서만 조회 가능하다. "사용자 변경"은 본인 사번을 다시 입력해야만 전환된다. |
| D-28 | KT 로고 | UI 가이드 §9 "Sidebar 좌측 하단, 32~40px, 원본 Aspect Ratio 유지, 임의 색상 변경 금지" | 사용자가 제공한 공식 로고(검정 배경 PNG)를 alpha 채널로 배경 제거해 `frontend/assets/kt-logo.png`로 교체. 사이드바 footer(36px 폭, height:auto)와 로그인 화면 footer(40px 폭)에서 원본 비율(1.23:1)을 유지한 채 다크 네이비 배경 위에 흰 kt 글자 + 빨간 리본이 그대로 보임. 색상 변경 없음. |
| D-29 | 로그인 화면 시안 반영 | 사용자 제공 `readme/login.png`(디자인 시안), `readme/login_bg.png`(배경 소스) | 시안의 레이아웃(좌측 브랜드 영역 + 우측 카드, 언더라인 바, 그라디언트 "AI Agent" 타이틀, 카드형 아이콘 입력란, 그라디언트 버튼, footer 카피라이트)을 그대로 재현했다. 다만 아이디/비밀번호/SSO(KT 통합계정) 로그인은 이 서비스의 "비밀번호 없는 사번 기반 식별" 원칙과 맞지 않아 적용하지 않았고, 입력 필드는 사번 1개만 유지했다. 배경 이미지는 사용자가 제공한 `login_bg.png`를 JPEG로 최적화(151KB)해 `frontend/assets/login-bg.jpg`로 로컬 자산화했다(외부 CDN/URL 없음).
| D-30 | Quality Admin 승격 경로 분리 | 사용자 피드백("관리자는 등록하는 게 아니라 별도 지정된 계정") | 기존에는 `bootstrapAdminEmployeeIds`(예: `admin`) 사번으로 **일반 로그인/등록만 해도** 자동으로 Quality Admin이 되었다. 사번을 아는 사람이면 누구나 관리자가 될 수 있어 외부 노출(NAS 배포) 시 위험이 컸다. 일반 로그인(`POST /api/session/start`, `POST /api/users`)에서는 **자동 승격을 완전히 제거**하고, 별도 화면(`#/admin-login`, `POST /api/session/admin-start`)에서 **사번 + 관리자 비밀번호**(`DMS_ADMIN_PASSWORD` 환경변수/`config/server.config.json`의 `adminPassword`, 사용자별 비밀번호가 아닌 단일 공유 관문 비밀)를 함께 제출해야만 승격/세션 발급이 이루어지도록 분리했다. 비밀번호는 `crypto.timingSafeEqual`로 비교하고, 연속 5회 실패 시 5분간 잠그는 메모리 카운터로 무차별 대입을 방어한다. 관리자 비밀번호가 설정되지 않은 배포는 `admin-start` 자체를 거부한다(빈 값 우회 방지). 일반 사번 로그인/등록 흐름과 "비밀번호 없는 사번 기반 식별" 원칙은 그대로 유지되며, 이 예외는 Admin 승격 관문 1곳에 한정된다. Admin 로그인 진입 링크는 일반 로그인 화면 footer에 눈에 띄지 않는 작은 텍스트 링크(`· Admin`)로만 노출한다. |
| D-22 | 로그 | 07 §16 | access 로그는 requestId/method/path/status/elapsed/errorCode만 기록. Comment 본문/첨부 미기록. |
| D-31 | Dashboard/Kanban/목록 필터 유지 | 사용자 피드백("다른 화면 이동 후 돌아오면 조회조건이 초기화됨") | 각 화면의 마지막 조회 조건(query)을 `localStorage`(`dms.filter.<화면>`, 로그아웃 후에도 유지)에 저장한다. 사이드바 메뉴처럼 query 없이 순수 경로로 진입할 때만 저장된 값으로 복원(`{replace:true}`)하고, Dashboard Drill-down처럼 명시적 조건을 들고 들어온 경우는 그 조건을 그대로 존중해 복원하지 않는다. 목록의 "필터 초기화" 버튼은 이동 직전에 빈 값을 즉시 저장해, 초기화 직후 재진입 시 방금 지운 필터가 다시 복원되는 루프를 방지한다. |
| D-32 | Issue 임시저장(DRAFT) | 사용자 요청("등록시 임시저장하고 수정, 내가 등록에서만 노출") | `STATUS.DRAFT`를 신설해 Cancel과 동일한 패턴(기본 조회에서 암묵적 제외, `status=DRAFT`/`ALL`/`includeDraft=true`로만 노출)으로 Dashboard/Kanban/목록에서 자동 제외했다. 임시저장 검증은 "유형만 있으면 저장 가능"(사용자 확정 방침)한 관대한 `V.draftCreate()`로 처리하고, 정식 등록 전환(`POST .../actions/submit`, DRAFT→OPEN)에서만 결함/개선요청/문의 각각의 정식 필수값(`defectCreate` 등)으로 재검증한다. 노출 범위는 작성자 본인과 Quality Admin으로 한정했다(사용자 확정 방침) — `IssueQuery.applyFilters`에 "DRAFT는 reporter 본인 또는 Admin만" 필터를 statuses 지정 여부와 무관하게 항상 적용하고, `IssueService.getDetail`도 동일 규칙으로 타인에게는 404(존재 자체를 숨김)를 반환한다. "내가 등록" 탭은 `mine=reported&includeDraft=true`로 조회하며, DRAFT 행은 상세가 아니라 등록 화면(`#/new/:type?draftId=`)의 "이어 작성"으로 연결된다. `updateDraft`는 `changes`에 없는 필드까지 빈 값으로 덮어쓰지 않도록 기존 값과 병합 후 재검증한다(부분 갱신). |
| D-33 | Issue 완전 삭제 | 사용자 요청(2026-09-29, "admin은 이슈삭제권한, 사용자삭제권한을 부여") | Cancel(상태만 CANCEL로 전환, 이력 보존)과 별개로 `DELETE /api/issues/:id`를 신설해 Issue 파일(.json/.bak)과 첨부파일 디렉터리(`uploads/{issueId}/`)를 완전히 삭제한다. Admin 전용, 상태 무관(Open/진행중/Closed 어떤 상태든 삭제 가능 — 사용자 확정 방침). `IssueRepository.remove()`는 반드시 `withLock` 안에서 호출하며, 캐시(`this.cache`)와 corrupted 목록에서도 함께 제거한다. Issue 자체가 사라지므로 삭제 이력은 Issue의 history가 아니라 `AuditRepository`에 `ISSUE_DELETED` 이벤트로만 남긴다(D-21과 동일하게 append 실패해도 삭제 자체는 롤백하지 않음). 복구는 전체 백업 스냅샷(`scripts/restore.js`) 단위로만 가능하고 개별 Issue 단위 복구는 지원하지 않는다. 프론트는 상세 화면의 "더보기"(관리자 메뉴)에 "Issue 완전 삭제" 항목을 추가하고 `confirmModal`로 1회 확인 후 목록 화면으로 이동시킨다. |
| D-34 | 관리자 비밀번호 코드 고정 제거(SEC-001) | 보안 사전점검 2026-10-01(`docs/SECURITY_AUDIT_REPORT_2026-10-01.md`) SEC-001 | D-30에서 도입했던 "서버 코드에 고정된 SHA-256 해시" 방식(salt 없음, 저장소 열람자가 로그인 시도 가능)을 제거했다. `backend/app/utils/password.js`에 Node 내장 `crypto.scryptSync` 기반 `hashPassword`/`verifyPassword`를 신설(저장 형식 `scrypt$<salt-hex>$<hash-hex>`, 매 해시마다 랜덤 salt)하고, `UserService`는 비밀번호 비교를 전부 이 모듈에 위임한다. 비밀번호 해시는 코드가 아니라 `DMS_ADMIN_PASSWORD_HASH` 환경변수(또는 `config/server.config.json`의 `adminPasswordHash`)로 운영자가 직접 주입하며, 해시가 비어 있으면 `#/admin-login` 자체를 거부한다(기존 D-30의 fail-closed 원칙 유지). 해시 생성용 CLI(`npm run hash-admin-password -- "비밀번호"`, `scripts/hash-admin-password.js`)를 제공한다. 테스트(`ux-security.test.js`)도 더미 비밀번호를 `hashPassword()`로 즉시 해시화해서만 컨테이너에 주입하도록 바꿔, 코드/테스트 어디에도 고정 평문·고정 해시가 남지 않는다. |

## TODO (운영 전 확인)

| # | 항목 | 내용 |
|---|---|---|

| T-02 | 폰트 | 시스템 폰트 fallback(Malgun Gothic 등). Pretendard/Noto Sans KR 사용 시 폰트 파일을 `frontend/assets/fonts/`에 포함하고 `app.css`에 `@font-face` 추가. |
| T-03 | HTTPS | 내부 인증서 사용 시 리버스 프록시(예: 내부 Nginx/IIS) 또는 `https.createServer`로 확장. 현재는 HTTP. Secure cookie는 TLS 소켓 감지 시 자동. |
| T-04 | 다중 프로세스 | 단일 Node 프로세스가 data 디렉터리를 독점하는 전제. 다중 인스턴스 운영은 지원하지 않음(파일 lock은 프로세스 내 mutex). |
| T-05 | 대용량 성능 | Issue 전량 메모리 캐시. 5,000건 규모까지 검증 목표(08 §15). 초과 시 Dashboard cache JSON 도입 검토(04 §10). |
| T-06 | E2E 브라우저 자동화 | 검증은 Edge headless(puppeteer-core, 개발 PC 전용)로 수행. 폐쇄망 내 자동화 도구가 없으면 `docs/RELEASE_GATE.md`의 수동 시나리오로 UAT. |
