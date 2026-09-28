# 개발자 센터

결함관리서비스와 외부 시스템을 연동하거나 서비스를 일반 서버에 설치·운영하는 담당자를 위한 문서입니다.

## 1. 서비스 개요

- Node.js 18 이상에서 실행됩니다.
- 별도 DBMS, 외부 CDN, 외부 npm 패키지 없이 동작합니다.
- Frontend는 Vanilla JS SPA이며 Backend는 Node.js HTTP 서버입니다.
- Issue는 유형별 개별 JSON 파일로 저장됩니다.
- 주요 변경은 Issue Timeline과 append-only Audit에 기록됩니다.
- 모든 변경 API는 서버 세션의 사용자를 행위자로 사용합니다. 클라이언트가 보낸 사용자 ID를 신뢰하지 않습니다.

## 2. API 기본 규칙

### 기본 URL

```text
http://<host>:<port>
```

기본 포트는 `8080`입니다. 실제 운영 포트는 `config/server.config.json` 또는 환경변수로 설정합니다.

### 세션 시작

일반 사용자는 사번으로 세션을 시작합니다.

```bash
curl -i -c cookies.txt \\
  -H "Content-Type: application/json" \\
  -H "X-Requested-With: XMLHttpRequest" \\
  -d '{"employeeId":"10001"}' \\
  http://localhost:8080/api/session/start
```

응답으로 발급된 HttpOnly 세션 쿠키를 이후 요청에 사용합니다. 관리자 세션은 별도의 관리자 로그인 절차와 관리자 비밀번호가 필요합니다.

### 변경 요청 공통 헤더

POST, PATCH, PUT, DELETE로 데이터를 변경할 때 다음 헤더를 사용합니다.

```http
Content-Type: application/json
X-Requested-With: XMLHttpRequest
Cookie: <session cookie>
```

첨부파일 업로드는 `multipart/form-data`를 사용합니다.

## 3. 티켓 생성 API

### 결함 생성

`POST /api/issues/defects`

```bash
curl -i -b cookies.txt \\
  -H "Content-Type: application/json" \\
  -H "X-Requested-With: XMLHttpRequest" \\
  -d '{
    "location":"고객관리 > 고객정보 조회",
    "environmentId":"ENV-VERIFY",
    "symptom":"조회 버튼을 누르면 로딩 상태가 계속됩니다.",
    "reproductionSteps":[
      "고객관리 메뉴 접속",
      "고객정보 조회 선택",
      "고객명 입력",
      "조회 버튼 클릭"
    ],
    "expectedResult":"조건에 맞는 고객 목록이 표시되어야 합니다."
  }' \\
  http://localhost:8080/api/issues/defects
```

성공 응답 예시:

```json
{
  "id": "DEF-0023",
  "revision": 1,
  "status": "OPEN"
}
```

### 개선 요청 생성

`POST /api/issues/improvements`

```json
{
  "target": "고객정보 조회",
  "request": "상태 필터를 화면 상단에서 바로 선택할 수 있도록 개선해 주세요.",
  "reason": "조회 결과가 많을 때 원하는 고객을 찾기 어렵습니다."
}
```

### 문의 생성

`POST /api/issues/inquiries`

```json
{
  "target": "고객정보 조회",
  "question": "조회 기간 조건에 포함되는 기준을 확인하고 싶습니다."
}
```

생성된 ID의 접두사는 유형에 따라 `DEF-`, `IMP-`, `INQ-`로 구분됩니다.

## 4. 외부 연동 API

외부 연동 API는 사내 다른 시스템에서 결함을 생성·조회하고, 조치 결과와 관련 자료를 남길 때 사용합니다. 외부 시스템에서는 세션 쿠키를 사용하지 않고 Quality Admin이 발급한 고정 API Key를 사용합니다.

### 4.1 사전 설정

Quality Admin이 `설정 > 외부 연동`에서 다음 작업을 수행합니다.

1. `API Key 발급`을 선택합니다.
2. 발급 직후 모달에 표시되는 Key 원문을 안전한 연동 시스템에 등록합니다.
3. 외부 연동 사용 스위치를 켭니다.
4. 연동 시스템에서 Health Check와 결함 생성 테스트를 실행합니다.

API Key 원문은 발급 직후에만 표시됩니다. 이후에는 앞·뒤 일부만 표시되는 마스킹 미리보기만 확인할 수 있습니다. Key를 분실했거나 외부에 노출한 경우 `재발급` 또는 `폐기` 후 새 Key를 등록합니다.

### 4.2 인증과 Actor 지정

모든 외부 연동 API 요청에는 다음 헤더가 필요합니다.

```http
X-Api-Key: <발급된 API Key>
```

요청의 `employeeId`가 해당 요청의 Actor가 됩니다.

- 결함 생성·댓글·배포: JSON body의 `employeeId`
- Issue 조회: query string의 `employeeId`
- 첨부파일 업로드: query string의 `employeeId`

서버는 `employeeId`로 등록된 사용자를 조회한 뒤 해당 사용자의 권한으로 요청을 처리합니다. 따라서 API Key만으로 권한을 우회할 수 없으며, 조치자 권한이 필요한 배포 등록은 실제 조치자 또는 Quality Admin의 사번으로 요청해야 합니다.

외부 연동 API는 세션 쿠키를 사용하지 않는 서버 간 호출 전용 API이므로 CSRF 검사를 적용하지 않습니다. 브라우저 화면에서 외부 연동 API를 직접 호출하는 용도로 사용하지 않습니다.

### 4.3 지원 범위

외부 연동 API는 다음 기능만 제공합니다.

- 결함(Defect) 생성
- Issue 조회
- 배포 등록
- 댓글 등록
- 첨부파일 업로드

`claim`, `start`, `resolve`, `close`, `cancel` 등 상태 전이 API는 외부에 공개하지 않습니다. 상태 전이는 서비스 내부 화면에서만 수행합니다.

### 4.4 Endpoint 목록

| 목적 | Method | Endpoint | Actor 입력 |
|---|---|---|---|
| 결함 생성 | POST | `/api/external/v1/issues` | JSON body `employeeId` |
| Issue 조회 | GET | `/api/external/v1/issues/{issueId}?employeeId=...` | query `employeeId` |
| 배포 등록 | POST | `/api/external/v1/issues/{issueId}/deployments` | JSON body `employeeId` |
| 댓글 등록 | POST | `/api/external/v1/issues/{issueId}/comments` | JSON body `employeeId` |
| 첨부파일 업로드 | POST | `/api/external/v1/issues/{issueId}/attachments?employeeId=...` | query `employeeId` |

### 4.5 결함 생성

```bash
curl -i \\
  -X POST \\
  -H "X-Api-Key: <발급된 API Key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "employeeId":"10001",
    "location":"고객관리 > 고객정보 조회",
    "environmentId":"ENV-VERIFY",
    "symptom":"조회 버튼을 누르면 로딩 상태가 계속됩니다.",
    "reproductionSteps":[
      "고객관리 메뉴 접속",
      "고객정보 조회 선택",
      "고객명 입력",
      "조회 버튼 클릭"
    ],
    "expectedResult":"조건에 맞는 고객 목록이 표시되어야 합니다."
  }' \\
  http://localhost:8080/api/external/v1/issues
```

성공 응답은 `201 Created`이며 생성된 Reporter는 `employeeId`에 해당하는 사용자로 기록됩니다.

```json
{
  "id": "DEF-0023",
  "revision": 1,
  "status": "OPEN"
}
```

### 4.6 Issue 조회

```bash
curl -i \\
  -H "X-Api-Key: <발급된 API Key>" \\
  "http://localhost:8080/api/external/v1/issues/DEF-0023?employeeId=10001"
```

응답에는 Issue 상세, 댓글, Timeline, 현재 사용자의 permission hint가 포함됩니다. 조회 Actor에게 비공개 데이터가 노출되지 않도록 기존 상세 조회 권한 규칙이 적용됩니다.

### 4.7 배포 등록

배포 등록은 기존 내부 화면과 동일하게 조치자 또는 Quality Admin만 수행할 수 있고, Issue가 조치 완료(`DONE`)된 이후에만 가능합니다.

```bash
curl -i \\
  -X POST \\
  -H "X-Api-Key: <발급된 API Key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "employeeId":"20001",
    "expectedRevision":5,
    "environmentId":"ENV-VERIFY",
    "version":"Release 1.2.3"
  }' \\
  http://localhost:8080/api/external/v1/issues/DEF-0023/deployments
```

조치자가 아닌 사번으로 요청하면 `403 Forbidden`, Done 이전에 요청하면 `409 Conflict`가 반환됩니다.

### 4.8 댓글 등록

```bash
curl -i \\
  -X POST \\
  -H "X-Api-Key: <발급된 API Key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "employeeId":"10001",
    "expectedRevision":6,
    "body":"검증 환경에서 동일 현상이 재현되지 않는 것을 확인했습니다."
  }' \\
  http://localhost:8080/api/external/v1/issues/DEF-0023/comments
```

### 4.9 첨부파일 업로드

첨부파일은 `multipart/form-data`로 업로드하며 `employeeId`는 query string으로 전달합니다.

```bash
curl -i \\
  -X POST \\
  -H "X-Api-Key: <발급된 API Key>" \\
  -F "expectedRevision=6" \\
  -F "file=@./error.png" \\
  "http://localhost:8080/api/external/v1/issues/DEF-0023/attachments?employeeId=10001"
```

허용 확장자, MIME, 파일 크기, 경로 조작 방지 검사는 내부 화면 업로드와 동일하게 적용됩니다.

### 4.10 외부 연동 오류

| HTTP | 상황 |
|---:|---|
| 401 | `X-Api-Key`가 없거나 틀림, Key 미설정, 외부 연동 사용 중지 |
| 404 | 등록되지 않은 `employeeId` 또는 존재하지 않는 Issue |
| 403 | Actor가 해당 작업의 권한을 보유하지 않음 |
| 409 | revision 충돌 또는 현재 상태에서 배포 등록 불가 |
| 413 | 첨부파일 용량 초과 |

외부 연동을 즉시 차단해야 하는 경우 `설정 > 외부 연동`에서 사용 스위치를 끕니다. 스위치를 끄면 기존 Key가 있어도 외부 API 요청은 즉시 `401`로 거부됩니다.

## 5. 주요 API 목록

| 목적 | Method | Endpoint |
|---|---|---|
| 세션 시작 | POST | `/api/session/start` |
| 현재 세션 확인 | GET | `/api/session/current` |
| Issue 목록 조회 | GET | `/api/issues` |
| Issue 상세 조회 | GET | `/api/issues/{issueId}` |
| Issue 내용 수정 | PATCH | `/api/issues/{issueId}` |
| 담당자 인수 | POST | `/api/issues/{issueId}/actions/claim` |
| 담당자 지정 | POST | `/api/issues/{issueId}/actions/assign` |
| Priority 변경 | POST | `/api/issues/{issueId}/actions/priority` |
| 조치 시작 | POST | `/api/issues/{issueId}/actions/start` |
| 조치 완료 | POST | `/api/issues/{issueId}/actions/resolve` |
| 재오픈 | POST | `/api/issues/{issueId}/actions/reopen` |
| 종료 | POST | `/api/issues/{issueId}/actions/close` |
| 취소 | POST | `/api/issues/{issueId}/actions/cancel` |
| 댓글 등록 | POST | `/api/issues/{issueId}/comments` |
| 배포 기록 | POST | `/api/issues/{issueId}/deployments` |
| Dashboard 요약 | GET | `/api/dashboard/summary` |
| 검색 | GET | `/api/search?q=...` |
| Health Check | GET | `/api/health` |

## 6. 상태 변경 API 예시

### 담당자 인수

```http
POST /api/issues/DEF-0023/actions/claim
```

```json
{
  "expectedRevision": 1
}
```

### 조치 시작

```http
POST /api/issues/DEF-0023/actions/start
```

```json
{
  "expectedRevision": 2
}
```

### 조치 완료

```http
POST /api/issues/DEF-0023/actions/resolve
```

```json
{
  "expectedRevision": 3,
  "resolution": {
    "description": "조회 조건 검증 로직을 수정했습니다.",
    "changeReference": "a84fd23",
    "targetVersion": "Release 1.2.3"
  }
}
```

### 종료

등록자 검증 종료:

```json
{
  "expectedRevision": 5,
  "closeType": "VERIFIED",
  "comment": "검증 환경에서 정상 동작을 확인했습니다."
}
```

합의 종료:

```json
{
  "expectedRevision": 5,
  "closeType": "AGREED",
  "comment": "업무 담당자와 확인 후 종료에 합의했습니다."
}
```

## 7. 동시 수정과 revision

Issue 상세 응답에는 `revision`이 포함됩니다. 변경 요청에는 조회 당시의 revision을 `expectedRevision`으로 전달해야 합니다.

```json
{
  "expectedRevision": 7,
  "changes": {
    "symptom": "수정된 현상 설명"
  }
}
```

다른 사용자가 먼저 저장해 revision이 달라지면 서버는 `409 Conflict`를 반환합니다. 이때 요청을 반복 전송하지 말고 최신 Issue를 다시 조회한 뒤 변경 내용을 병합하여 재시도합니다.

## 8. 오류 응답

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "다른 사용자가 먼저 수정했습니다.",
    "details": {
      "currentRevision": 8
    }
  }
}
```

| HTTP | 주요 코드 | 의미 |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | 필수값, 형식, 허용값 오류 |
| 401 | - | 세션이 없거나 만료됨 |
| 403 | `FORBIDDEN` | 현재 사용자의 권한으로 수행할 수 없음 |
| 404 | `NOT_FOUND` | 대상 Issue 또는 리소스가 없음 |
| 409 | `REVISION_CONFLICT` | 동시 수정으로 revision 불일치 |
| 409 | `INVALID_STATE_TRANSITION` | 현재 상태에서 수행할 수 없는 작업 |
| 413 | `FILE_TOO_LARGE` | 첨부파일 용량 초과 |
| 500 | `STORAGE_WRITE_FAILED` | 파일 저장 또는 저장소 오류 |

## 9. 목록 조회와 검색

```text
GET /api/issues?type=DEFECT&status=OPEN,IN_PROGRESS&priority=CRITICAL&page=1&size=50
```

주요 query parameter:

- `type`: `DEFECT`, `IMPROVEMENT`, `INQUIRY`
- `status`: `OPEN`, `IN_PROGRESS`, `DONE`, `CLOSED`, `CANCEL`
- `priority`: `CRITICAL`, `MAJOR`, `MINOR`, `UNASSIGNED`
- `environmentId`, `assignee`, `reporter`
- `createdFrom`, `createdTo`
- `q`: 제목, 현상, 등록자, 담당자, 댓글 등 전문 검색
- `sort`, `page`, `size`

## 10. 일반 서버 설치 가이드

### 요구사항

- Node.js 18 이상
- 서비스 실행 계정이 애플리케이션 디렉터리와 데이터 디렉터리에 접근할 수 있어야 함
- 운영 환경의 내부 접근 주소와 포트 확보

외부 npm 패키지는 사용하지 않으므로 일반 설치에 `npm install`은 필요하지 않습니다.

### 설치 절차

1. 서비스 패키지를 운영 서버의 전용 디렉터리에 복사합니다.
2. `config/server.config.json`을 환경에 맞게 수정합니다.
3. `data`, `uploads`, `backup`, `logs` 디렉터리의 쓰기 권한을 서비스 실행 계정에 부여합니다.
4. 오프라인 검사와 테스트를 실행합니다.

```bash
node scripts/check-offline.js
npm test
```

5. 서비스를 시작합니다.

```bash
node backend/server.js
```

Windows에서는 `start.bat`, Linux에서는 `./start.sh`를 사용할 수 있습니다.

### 주요 설정

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
  "bootstrapAdminEmployeeIds": ["admin"]
}
```

관리자(admin) 계정 비밀번호는 설정 파일이 아니라 서버 코드(`UserService.js`의 `ADMIN_PASSWORD_SHA256`)에 SHA-256 해시로 고정되어 있습니다. 사번 `admin`으로 `#/admin-login`에 로그인할 때만 사용되며, 다른 사번을 Quality Admin으로 만드는 것은 [설정 > 사용자] 화면의 권한 부여로 처리합니다.

### 최초 확인

1. `GET /api/health`가 정상 응답하는지 확인합니다.
2. 브라우저에서 서비스 URL에 접속합니다.
3. Bootstrap 관리자 사번으로 최초 사용자를 등록합니다.
4. 프로젝트, 환경, Priority, 운영 설정을 확인합니다.
5. 테스트 Issue를 등록하고 담당자 지정부터 종료까지 한 번 수행합니다.

### 운영 체크리스트

- [ ] 서비스가 지정한 포트에서 수신 중인가
- [ ] `data`, `uploads`, `backup`, `logs`가 서비스 계정으로 쓰기 가능한가
- [ ] 외부 네트워크 요청이 없는가
- [ ] Health Check가 정상인가
- [ ] 최초 관리자와 일반 사용자의 권한이 구분되는가
- [ ] 백업이 생성되고 복구 절차를 확인했는가
- [ ] 서비스 재시작 후 Issue와 사용자 데이터가 유지되는가
- [ ] `npm test`와 `node scripts/check-offline.js`가 통과하는가

## 11. 데이터와 백업

- `data/users.json`: 사용자 정보
- `data/config/`: 프로젝트·환경·운영 설정
- `data/issues/`: Issue별 JSON 파일
- `data/audit/`: append-only Audit 로그
- `uploads/`: 첨부파일
- `backup/`: 백업본

운영 중 데이터 파일을 직접 편집하지 않습니다. 백업은 `node scripts/backup.js` 또는 관리자 화면에서 실행하고, 복구 전에는 서비스를 중지합니다.

## 12. 보안 주의사항

- 일반 사용자는 화면에 보이는 버튼만으로 권한이 제한되는 것이 아니라 서버에서 모든 변경 권한을 다시 검사합니다.
- 세션 쿠키와 관리자 비밀번호를 로그나 Issue 댓글에 남기지 않습니다.
- 첨부파일에 개인정보와 인증정보가 포함되지 않도록 합니다.
- 외부 공개가 필요한 경우 내부망 전용 서비스라는 운영 전제를 다시 검토하고, TLS와 접근 제어를 별도로 적용합니다.
