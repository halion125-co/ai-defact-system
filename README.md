# 결함관리서비스 v1.0 (KT AI Agent · 프로젝트 품질 · 결함관리)

금융권 폐쇄망용 경량 결함관리서비스. 외부 인터넷/CDN/API/DBMS 없이 **Node.js 내장 모듈만으로** 동작한다(외부 npm 의존성 0건).

- Defect / Improvement / Inquiry 등록 → 조치 → 배포 → 재검증 → Close 전 과정을 Timeline으로 추적
- Reporter / Assignee / Quality Admin 역할 기반 권한, Action Button 기반 상태 변경
- file-per-issue JSON 저장 + Issue Lock + Atomic Write + Revision(409) + Append-only Audit
- Dashboard: KPI / 일자별 등록·조치 / Burn Up / 분포 / 관리 필요 → 모두 Issue 목록으로 Drill-down

설계 기준 문서는 [readme/](readme/) 폴더(Source of Truth)를 참조한다.

## 빠른 시작

요구사항: Node.js 18 이상 (개발/검증은 Node 24 기준)

```bash
# 1. (선택) 데모 데이터 생성
node scripts/seed.js

# 2. 서버 실행 (기본 http://localhost:8080)
node backend/server.js
```

브라우저에서 `http://localhost:8080/` 접속 → **신규 사용자 등록** 또는 사번 입력으로 시작.

- 최초 Quality Admin: 사번 `admin`으로 등록/시작하면 자동 승격된다. (`config/server.config.json`의 `bootstrapAdminEmployeeIds` 또는 환경변수 `DMS_BOOTSTRAP_ADMIN=사번1,사번2`)
- 데모 seed 사용자: `admin`(김성훈, Quality Admin), `10001`(이영희), `10002`(박민수), `20001`(홍길동), `20002`(최지우)
- 데모 seed 데이터: 결함 12건(Open/조치중/Done/배포/Closed/Re-open/Cancel), 개선요청 3건(조치 2·Closed 1), 문의 2건(Closed 1)

## 명령

| 명령 | 설명 |
|---|---|
| `npm start` / `node backend/server.js` | 서버 실행 |
| `npm test` | Unit / API 통합 / 동시성 / 파일 손상 / 보안 테스트 (57건) |
| `npm run seed` | 데모 데이터 생성 (기존 Issue가 있으면 중단, `--force`로 강제) |
| `npm run backup` | 수동 백업 (`backup/<YYYYMMDD_HHMMSS>/`) |
| `npm run restore -- <백업명\|latest> --yes` | 백업 복구 (서비스 중지 후) |
| `npm run check:offline` | 외부 URL/npm 의존성 정적 검사 |

Windows: `start.bat`, Linux: `./start.sh`

## 설정

`config/server.config.json` (환경변수 `DMS_PORT`, `DMS_HOST`, `DMS_DATA_DIR`, `DMS_UPLOAD_DIR`, `DMS_BACKUP_DIR`, `DMS_LOG_DIR`, `DMS_BOOTSTRAP_ADMIN`, `DMS_CONFIG`가 우선)

```json
{
  "host": "0.0.0.0",
  "port": 8080,
  "dataDir": "./data",
  "uploadDir": "./uploads",
  "backupDir": "./backup",
  "logDir": "./logs",
  "sessionTtlHours": 12,
  "timezone": "Asia/Seoul",
  "bootstrapAdminEmployeeIds": ["admin"],
  "backupSchedule": { "enabled": true, "hour": 2, "minute": 0 }
}
```

운영 설정(장기 미조치 기준일, 첨부 크기/확장자, Change Reference/Deployment 사용 여부, 백업 보관일)은 UI **설정 > 운영설정**에서 Quality Admin이 변경한다.

## 디렉터리

```text
backend/
  server.js                 진입점
  app/
    config.js               서버 설정 로더
    container.js            DI 조립 + Startup Validation
    server.js               HTTP 서버, 보안 헤더, CSRF, 세션, 에러 표준화
    controllers/routes.js   API Route 정의
    services/               Session/User/Config/Issue/Workflow/Comment/Attachment/Dashboard/Backup
    repositories/           Users/Config/Sequence/Issue(file-per-issue)/Audit(JSONL)
    permissions/            역할·상태 기반 권한 판단
    validators/             입력 검증 (allowlist, 길이, enum)
    utils/                  atomic write, keyed mutex, time(+09:00), multipart, logger
  tests/                    node --test
frontend/                   Vanilla JS SPA (ES Modules, 빌드 없음, 외부 리소스 없음)
  css/app.css               Design Token + Component
  js/                       api / store / router / ui / charts(SVG) / pages/*
  assets/                   KT 로고(placeholder), favicon
config/server.config.json
scripts/                    seed / backup / restore / check-offline
docs/                       배포·운영·사용자·관리자 가이드, 설계 결정
data/ uploads/ backup/ logs/   런타임 생성 (git 제외)
readme/                     설계 기준 문서 (Source of Truth)
```

## 데이터 저장 구조

```text
data/
  users.json                { seq, users[] }
  sequence.json             { DEF, IMP, INQ, EVT }
  config/project.json       고객사/프로젝트/환경/Priority (revision)
  config/operation.json     운영 설정 (revision)
  issues/DEF-0001.json      Issue Snapshot + comments[] + history[] (revision)
  audit/events-YYYY-MM.jsonl  Append-only Audit
uploads/DEF-0001/<stored>   첨부 (서버 재생성 파일명)
backup/<YYYYMMDD_HHMMSS>/   data + uploads 복사본, status.json
```

모든 쓰기: **Issue Lock → revision 비교 → temp write → fsync → rename → audit append**. 기존 파일은 `.bak` 한 세대 보존.

## API 요약

`readme/02_API_JSON_SPEC_v1.0.md` 기준으로 구현. 모든 Mutation은 `X-Requested-With: XMLHttpRequest` 헤더(CSRF)와 `expectedRevision`을 요구한다.

| 영역 | Endpoint |
|---|---|
| Session | `POST /api/session/start` `GET /api/session/current` `POST /api/session/end` |
| Users | `POST /api/users` `GET /api/users` `GET /api/users/recent` `PATCH /api/users/{id}` |
| Config | `GET/PUT /api/config/project` `POST/PATCH/DELETE /api/config/environments[/{id}]` `PUT /api/config/environments/order` `PUT /api/config/priorities` `GET/PUT /api/config/operation` |
| Issues | `GET /api/issues` `POST /api/issues/{defects\|improvements\|inquiries}` `GET/PATCH /api/issues/{id}` |
| Actions | `POST /api/issues/{id}/actions/{claim\|assign\|priority\|start\|resolve\|reopen\|close\|cancel\|admin-status}` |
| Comment | `POST /api/issues/{id}/comments` `POST /api/issues/{id}/comments/{cid}/hide` |
| Attachment | `POST /api/issues/{id}/attachments` (multipart) `GET/DELETE /api/issues/{id}/attachments/{aid}` |
| Deployment | `POST /api/issues/{id}/deployments` |
| Dashboard | `GET /api/dashboard/{summary\|daily\|burnup\|distribution\|attention}` |
| 기타 | `GET /api/search?q=` `GET /api/my/counts` `GET /api/health` `GET/POST /api/admin/{backup/status\|backup/run\|audit\|health}` |

## 완료 기준 대비 상태

readme/README.md §4 "개발 완료의 핵심 기준" 및 03 §21 Release Gate 항목은 [docs/RELEASE_GATE.md](docs/RELEASE_GATE.md)에서 검증 결과와 함께 확인한다. 문서와 구현 사이의 판단 사항은 [docs/DECISIONS.md](docs/DECISIONS.md)에 기록했다.
