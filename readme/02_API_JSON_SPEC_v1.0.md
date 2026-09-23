# 02. API / JSON 데이터 구조 설계서 v1.0

## 0. 설계 원칙

- 금융권 폐쇄망
- 외부 API/CDN 의존 없음
- 별도 DBMS 없음
- 경량 Backend + JSON/File 저장
- 다중 사용자 동시 접근 고려
- 모든 주요 변경 Audit 가능
- 특정 Git/SVN/CI 도구에 종속되지 않음

---

# 1. 권장 저장 구조

PMD의 JSON/File 저장 원칙은 유지하되, 구현 안정성을 위해 **Issue 단위 파일 분리**를 권장한다.

```text
/data
  /config
    project.json
    operation.json
  users.json
  sequence.json
  /issues
    DEF-0001.json
    DEF-0002.json
    IMP-0001.json
    INQ-0001.json
  /audit
    events-2026-09.jsonl
  /backup

/uploads
  /DEF-0001
    20260924_093211_a1b2_error.png
```

## 이유

단일 `issues.json`에 모든 데이터를 저장하면:
- 동시 쓰기 Lock 범위가 커짐
- 파일 손상 시 영향범위가 큼
- Issue 1건 수정에도 전체 파일 Rewrite 필요

Issue 단위 JSON은:
- Lock 범위를 Issue 단위로 축소
- Atomic Replace 구현이 쉬움
- Backup/복구 영향범위가 작음

---

# 2. 동시성 제어

모든 Issue에 `revision` 정수값을 둔다.

예:
```json
{
  "id": "DEF-0023",
  "revision": 7
}
```

Client Mutation:
```json
{
  "expectedRevision": 7,
  "data": { }
}
```

서버:
- 현재 revision=7 → 처리 → revision=8
- 현재 revision!=expectedRevision → `409 CONFLICT`

## Atomic Write

권장 절차:
1. Issue Lock 획득
2. 최신 revision 확인
3. Temp File 작성
4. fsync
5. Atomic Rename/Replace
6. Audit Event Append
7. Lock 해제

---

# 3. ID 생성

`sequence.json`

```json
{
  "DEF": 23,
  "IMP": 7,
  "INQ": 12
}
```

ID 생성 시 sequence file에 Exclusive Lock.

결과:
- `DEF-0024`
- `IMP-0008`
- `INQ-0013`

Padding은 기본 4자리, 9999 초과 시 자연 증가 허용.

---

# 4. 공통 Enum

## IssueType

```json
["DEFECT", "IMPROVEMENT", "INQUIRY"]
```

## IssueStatus

```json
["OPEN", "IN_PROGRESS", "DONE", "CLOSED", "CANCEL"]
```

## Priority

```json
["CRITICAL", "MAJOR", "MINOR", "UNASSIGNED"]
```

프로젝트 Tailoring 시 내부 Code는 유지하고 Display Name만 변경하는 방식을 권장한다.

## CloseType

```json
["VERIFIED", "AGREED", null]
```

## DeploymentStatus

```json
["NOT_DEPLOYED", "DEPLOYED"]
```

---

# 5. User JSON

```json
{
  "userId": "U-000012",
  "employeeId": "12345678",
  "name": "김성훈",
  "team": "AX리스크/품질팀",
  "isQualityAdmin": true,
  "active": true,
  "createdAt": "2026-09-24T09:00:00+09:00",
  "updatedAt": "2026-09-24T09:00:00+09:00"
}
```

## 제약
- employeeId Unique
- isQualityAdmin은 일반 사용자 자신이 변경할 수 없음
- inactive 사용자는 과거 Issue/History에서 계속 표시

---

# 6. Project Config

`/data/config/project.json`

```json
{
  "projectId": "PRJ-001",
  "customerName": "A은행",
  "projectName": "Gen AI 플랫폼 구축",
  "environments": [
    {
      "id": "ENV-DEV",
      "code": "DEV",
      "displayName": "개발계",
      "active": true,
      "order": 1
    },
    {
      "id": "ENV-TEST",
      "code": "TEST",
      "displayName": "테스트계",
      "active": true,
      "order": 2
    },
    {
      "id": "ENV-VERIFY",
      "code": "VERIFY",
      "displayName": "검증계",
      "active": true,
      "order": 3
    }
  ],
  "priorities": [
    {
      "code": "CRITICAL",
      "displayName": "Critical",
      "description": "핵심 업무 또는 테스트 진행 불가",
      "active": true,
      "order": 1
    },
    {
      "code": "MAJOR",
      "displayName": "Major",
      "description": "주요 기능 또는 업무에 큰 영향",
      "active": true,
      "order": 2
    },
    {
      "code": "MINOR",
      "displayName": "Minor",
      "description": "영향이 제한적인 경미한 문제",
      "active": true,
      "order": 3
    }
  ],
  "updatedAt": "2026-09-24T09:00:00+09:00",
  "revision": 3
}
```

---

# 7. Operation Config

`/data/config/operation.json`

```json
{
  "staleIssueDays": 3,
  "maxAttachmentMb": 20,
  "allowedExtensions": [
    "png", "jpg", "jpeg", "pdf", "txt", "log"
  ],
  "enableChangeReference": true,
  "enableDeployment": true,
  "timezone": "Asia/Seoul",
  "backup": {
    "enabled": true,
    "retainDays": 30
  }
}
```

---

# 8. Defect JSON

```json
{
  "id": "DEF-0023",
  "type": "DEFECT",
  "revision": 8,

  "title": "고객정보 조회 시 무한 로딩",
  "location": "고객관리 > 고객정보 조회",
  "environment": {
    "id": "ENV-VERIFY",
    "displayNameSnapshot": "검증계"
  },

  "symptom": "고객명을 입력하고 조회 버튼을 누르면 결과가 표시되지 않고 로딩 상태가 계속됩니다.",
  "reproductionSteps": [
    { "order": 1, "text": "고객관리 메뉴 접속" },
    { "order": 2, "text": "고객정보 조회 선택" },
    { "order": 3, "text": "고객명 입력" },
    { "order": 4, "text": "조회 버튼 클릭" }
  ],
  "expectedResult": "조회조건에 해당하는 고객 목록이 표시되어야 합니다.",

  "priority": "MAJOR",
  "status": "DONE",

  "reporter": {
    "userId": "U-000012",
    "employeeId": "12345678",
    "nameSnapshot": "김성훈",
    "teamSnapshot": "AX리스크/품질팀"
  },

  "assignee": {
    "userId": "U-000021",
    "employeeId": "87654321",
    "nameSnapshot": "홍길동",
    "teamSnapshot": "개발팀"
  },

  "attachments": [
    {
      "attachmentId": "ATT-001",
      "originalName": "error.png",
      "storedName": "20260924_093211_a1b2_error.png",
      "mimeType": "image/png",
      "size": 182340,
      "uploadedBy": "U-000012",
      "uploadedAt": "2026-09-24T09:32:11+09:00"
    }
  ],

  "resolution": {
    "description": "로그인 Token 검증 로직 오류를 수정했습니다.",
    "changeReference": "a84fd23",
    "targetVersion": "Release 1.2.3",
    "resolvedBy": "U-000021",
    "resolvedAt": "2026-09-24T13:10:00+09:00",
    "firstResolvedAt": "2026-09-24T13:10:00+09:00"
  },

  "deployment": {
    "status": "DEPLOYED",
    "environmentId": "ENV-VERIFY",
    "environmentNameSnapshot": "검증계",
    "version": "Release 1.2.3",
    "deployedAt": "2026-09-24T18:30:00+09:00",
    "deployedBy": "U-000021"
  },

  "close": {
    "type": null,
    "comment": null,
    "closedBy": null,
    "closedAt": null,
    "firstClosedAt": null
  },

  "comments": [
    {
      "commentId": "CMT-0001",
      "author": {
        "userId": "U-000012",
        "nameSnapshot": "김성훈",
        "teamSnapshot": "AX리스크/품질팀"
      },
      "body": "특정 고객번호에서도 동일 현상이 발생합니다.",
      "attachments": [],
      "createdAt": "2026-09-24T10:42:00+09:00",
      "hidden": false
    }
  ],

  "history": [
    {
      "eventId": "EVT-000001",
      "eventType": "CREATED",
      "actor": {
        "userId": "U-000012",
        "nameSnapshot": "김성훈",
        "teamSnapshot": "AX리스크/품질팀"
      },
      "timestamp": "2026-09-24T09:32:11+09:00",
      "data": {}
    }
  ],

  "createdAt": "2026-09-24T09:32:11+09:00",
  "updatedAt": "2026-09-24T18:30:00+09:00"
}
```

---

# 9. Improvement JSON

```json
{
  "id": "IMP-0007",
  "type": "IMPROVEMENT",
  "revision": 2,
  "title": "고객조회 필터 개선",
  "target": "고객정보 조회",
  "request": "상태별 필터를 상단에서 바로 선택할 수 있도록 개선",
  "reason": "결함이 많아지면 원하는 고객을 찾기 어려움",
  "priority": "UNASSIGNED",
  "status": "OPEN",
  "reporter": { "...": "..." },
  "assignee": null,
  "attachments": [],
  "comments": [],
  "history": [],
  "createdAt": "2026-09-24T10:00:00+09:00",
  "updatedAt": "2026-09-24T10:00:00+09:00"
}
```

---

# 10. Inquiry JSON

```json
{
  "id": "INQ-0012",
  "type": "INQUIRY",
  "revision": 1,
  "title": "탈퇴 고객 조회 기준 문의",
  "target": "고객정보 조회",
  "question": "탈퇴 고객도 조회 대상에 포함되는지 확인이 필요합니다.",
  "priority": "UNASSIGNED",
  "status": "OPEN",
  "reporter": { "...": "..." },
  "assignee": null,
  "attachments": [],
  "comments": [],
  "history": [],
  "createdAt": "2026-09-24T10:20:00+09:00",
  "updatedAt": "2026-09-24T10:20:00+09:00"
}
```

---

# 11. History Event JSON

```json
{
  "eventId": "EVT-000126",
  "issueId": "DEF-0023",
  "eventType": "STATUS_CHANGED",
  "actor": {
    "userId": "U-000021",
    "nameSnapshot": "홍길동",
    "teamSnapshot": "개발팀"
  },
  "timestamp": "2026-09-24T13:10:00+09:00",
  "before": {
    "status": "IN_PROGRESS"
  },
  "after": {
    "status": "DONE"
  },
  "comment": "로그인 Token 검증 로직 수정"
}
```

Global Audit JSONL에는 Issue history와 동일 Event를 append-only로 기록한다.

---

# 12. Session API

비밀번호 없는 사용자 식별.

## POST `/api/session/start`

Request:
```json
{
  "employeeId": "12345678"
}
```

Response:
```json
{
  "user": {
    "userId": "U-000012",
    "employeeId": "12345678",
    "name": "김성훈",
    "team": "AX리스크/품질팀",
    "isQualityAdmin": true
  }
}
```

권장:
- HttpOnly Session Cookie 발급
- 세션은 인증 강화를 의미하지 않음
- Browser에서 임의 userId를 Mutation Payload에 직접 넣지 않고 서버 세션을 Actor로 사용

---

# 13. User API

## POST `/api/users`

신규 사용자 등록.

## GET `/api/users`

검색/Assignee Selector.

Query:
- `active=true`
- `q=홍길동`

## PATCH `/api/users/{userId}`

Quality Admin only.

변경:
- name
- team
- active
- isQualityAdmin

---

# 14. Config API

## GET `/api/config/project`

전체 사용자.

## PUT `/api/config/project`

Quality Admin only.

Request:
```json
{
  "expectedRevision": 3,
  "customerName": "A은행",
  "projectName": "Gen AI 플랫폼 구축"
}
```

## POST `/api/config/environments`
Quality Admin.

## PATCH `/api/config/environments/{id}`
Quality Admin.

기존 참조 존재 시 delete 대신 active=false.

## PUT `/api/config/operation`
Quality Admin.

---

# 15. Issue Query API

## GET `/api/issues`

Query 예:
```text
/api/issues?
type=DEFECT&
status=OPEN,IN_PROGRESS&
priority=CRITICAL&
environmentId=ENV-VERIFY&
assignee=U-000021&
reporter=U-000012&
createdFrom=2026-09-01&
createdTo=2026-09-24&
q=로그인&
sort=-updatedAt&
page=1&
size=50
```

Response:
```json
{
  "items": [
    {
      "id": "DEF-0023",
      "type": "DEFECT",
      "title": "고객정보 조회 시 무한 로딩",
      "status": "DONE",
      "priority": "MAJOR",
      "environment": "검증계",
      "reporter": "김성훈",
      "assignee": "홍길동",
      "createdAt": "2026-09-24T09:32:11+09:00",
      "updatedAt": "2026-09-24T18:30:00+09:00"
    }
  ],
  "page": 1,
  "size": 50,
  "total": 128
}
```

---

# 16. Issue Create API

## POST `/api/issues/defects`

Request:
```json
{
  "location": "고객관리 > 고객정보 조회",
  "environmentId": "ENV-VERIFY",
  "symptom": "조회 버튼을 누르면 로딩 상태가 계속됩니다.",
  "reproductionSteps": [
    "고객관리 메뉴 접속",
    "고객정보 조회 선택",
    "고객명 입력",
    "조회 버튼 클릭"
  ],
  "expectedResult": "조회 결과가 표시되어야 합니다."
}
```

Response:
```json
{
  "id": "DEF-0023",
  "revision": 1,
  "status": "OPEN"
}
```

## POST `/api/issues/improvements`

## POST `/api/issues/inquiries`

동일 패턴.

---

# 17. Issue Detail API

## GET `/api/issues/{issueId}`

현재 Snapshot + Comment + History + Permission Hint 반환.

Response에 권장:

```json
{
  "issue": { "...": "..." },
  "permissions": {
    "canEditContent": true,
    "canAssign": false,
    "canChangePriority": false,
    "canStart": false,
    "canResolve": false,
    "canReopen": true,
    "canCloseVerified": true,
    "canCloseAgreed": false,
    "canComment": true
  }
}
```

프론트는 Permission Hint를 UI 표시용으로 사용하되, 서버에서도 반드시 재검증한다.

---

# 18. Issue Content Update API

## PATCH `/api/issues/{issueId}`

Reporter(본인) 또는 Quality Admin.

Request:
```json
{
  "expectedRevision": 3,
  "changes": {
    "symptom": "특정 고객 조회 시 무한 로딩",
    "expectedResult": "조회 결과가 3초 내 표시되어야 함"
  }
}
```

서버:
- 변경 가능한 Field Allowlist 검증
- Before/After History 기록

---

# 19. Claim / Assign API

## POST `/api/issues/{issueId}/actions/claim`

미배정 Issue를 현재 사용자가 Claim.

Request:
```json
{
  "expectedRevision": 2
}
```

제약:
- assignee=null
- status=OPEN 또는 IN_PROGRESS 허용 정책 가능
- MVP: OPEN만 허용

## POST `/api/issues/{issueId}/actions/assign`

현재 Assignee 또는 Quality Admin.

Request:
```json
{
  "expectedRevision": 4,
  "assigneeUserId": "U-000032",
  "reason": "Frontend 담당자에게 이관"
}
```

타인에게 최초 배정은 Quality Admin만 허용.

---

# 20. Priority API

## POST `/api/issues/{issueId}/actions/priority`

Assignee 또는 Quality Admin.

```json
{
  "expectedRevision": 4,
  "priority": "CRITICAL",
  "reason": "로그인 불가로 테스트 진행 불가"
}
```

`reason`:
- 변경 자체는 optional
- Admin 강제/재분류 정책에 따라 필수화 가능
- MVP 권장: Critical로 올리는 경우 optional, 이력은 자동 생성

---

# 21. Workflow Action API

상태값 직접 PATCH보다 Action Endpoint를 권장한다.

## POST `/api/issues/{id}/actions/start`

Assignee/Admin.

OPEN → IN_PROGRESS

## POST `/api/issues/{id}/actions/resolve`

Assignee/Admin.

IN_PROGRESS → DONE

Request:
```json
{
  "expectedRevision": 5,
  "resolution": {
    "description": "Token 검증 로직 수정",
    "changeReference": "a84fd23",
    "targetVersion": "Release 1.2.3"
  }
}
```

서버:
- `firstResolvedAt`가 null이면 현재시각 저장
- 기존 firstResolvedAt은 Re-open 후 재조치되어도 유지
- `resolvedAt`은 최신 Done 시각으로 갱신

## POST `/api/issues/{id}/actions/reopen`

Reporter/Assignee/Admin.

DONE 또는 CLOSED → IN_PROGRESS

```json
{
  "expectedRevision": 8,
  "reason": "검증계에서 동일 현상 재발"
}
```

## POST `/api/issues/{id}/actions/close`

### Reporter/Admin Verified

```json
{
  "expectedRevision": 9,
  "closeType": "VERIFIED",
  "comment": "검증계 정상 동작 확인"
}
```

### Assignee/Admin Agreed

```json
{
  "expectedRevision": 9,
  "closeType": "AGREED",
  "comment": "김OO 책임과 정상동작 확인 후 종료 합의"
}
```

제약:
- Assignee의 AGREED는 comment 필수
- `firstClosedAt` 최초 1회 보존

## POST `/api/issues/{id}/actions/cancel`

Assignee/Admin.

```json
{
  "expectedRevision": 4,
  "reason": "중복 결함 DEF-0019로 관리"
}
```

---

# 22. Admin Status Override

## POST `/api/issues/{id}/actions/admin-status`

Quality Admin only.

```json
{
  "expectedRevision": 10,
  "status": "IN_PROGRESS",
  "reason": "고객 재검증 결과 동일 현상 발생"
}
```

Audit Event:
`ADMIN_STATUS_OVERRIDE`

---

# 23. Comment API

## POST `/api/issues/{id}/comments`

Reporter/Assignee/Admin.

```json
{
  "expectedRevision": 7,
  "body": "특정 고객번호에서도 동일 현상이 발생합니다.",
  "attachmentIds": []
}
```

Comment는 원칙적으로 immutable.

## POST `/api/issues/{id}/comments/{commentId}/hide`

Quality Admin only.

```json
{
  "expectedRevision": 8,
  "reason": "오등록된 개인정보 포함"
}
```

원본은 파일/Audit에서 유지.

---

# 24. Attachment API

## POST `/api/issues/{id}/attachments`

Multipart.

검증:
- Extension Allowlist
- MIME
- Size
- 파일명 Sanitization
- 랜덤/UUID 기반 storedName

## GET `/api/issues/{id}/attachments/{attachmentId}`

권한 있는 사용자만 다운로드.

## DELETE
MVP 권장:
- 물리 삭제 대신 `deleted=true`
- Admin 또는 업로더가 삭제 요청 가능
- Audit 보존

---

# 25. Deployment API

## POST `/api/issues/{id}/deployments`

Assignee/Admin.

```json
{
  "expectedRevision": 8,
  "environmentId": "ENV-VERIFY",
  "version": "Release 1.2.3",
  "deployedAt": "2026-09-24T18:30:00+09:00"
}
```

서버 Actor를 `deployedBy`로 기록.

MVP 1차:
- Issue당 최신 Deployment Snapshot 1개
- History에 모든 Deployment Event 보존

확장:
- deployments[] 배열로 다중환경 배포 지원 가능

---

# 26. Dashboard API

## GET `/api/dashboard/summary`

Query:
- type
- dateFrom/dateTo
- environmentId
- priority

Response:
```json
{
  "total": 128,
  "status": {
    "open": 12,
    "inProgress": 20,
    "done": 8,
    "closed": 88
  },
  "attention": {
    "criticalUnresolved": 3,
    "unassigned": 4,
    "stale": 6,
    "reopened": 2,
    "waitingDeploy": 5,
    "waitingVerification": 8
  }
}
```

## GET `/api/dashboard/daily`

```json
{
  "items": [
    {
      "date": "2026-09-24",
      "created": 14,
      "resolved": 10,
      "closed": 8
    }
  ]
}
```

## GET `/api/dashboard/burnup`

```json
{
  "items": [
    {
      "date": "2026-09-24",
      "createdCumulative": 128,
      "resolvedCumulative": 92,
      "closedCumulative": 84
    }
  ],
  "current": {
    "total": 128,
    "resolvedEver": 92,
    "closedEver": 84,
    "currentlyUnresolved": 36,
    "reopenedCurrent": 2
  }
}
```

## GET `/api/dashboard/distribution`

Response:
- status[]
- priority[]
- environment[]

## GET `/api/dashboard/attention`

상세 Issue List 또는 Count + sample.

---

# 27. Dashboard 계산 정의

## total
Filter 기간 내 생성된 Defect 수가 아니라, 기간 Filter의 의미를 명확히 해야 한다.

MVP 권장:
- 기간 Filter는 Chart/Issue 발생일 기준
- KPI도 동일 기간에 생성된 Issue 집합을 대상으로 현재 상태를 집계

즉:
`createdAt between dateFrom/dateTo`인 Issue 집합의 현재 상태.

## daily.created
createdAt date count.

## daily.resolved
firstResolvedAt date count.

## burnup.createdCumulative
date까지 생성된 Unique Defect 누적.

## burnup.resolvedCumulative
date까지 firstResolvedAt이 존재하는 Unique Defect 누적.

## currentlyUnresolved
현재 status가 OPEN/IN_PROGRESS인 Defect.

## waitingVerification
status=DONE and deployment.status=DEPLOYED 권장.
배포 기능 미사용 프로젝트에서는 status=DONE 전체.

## waitingDeploy
status=DONE and deployment.status=NOT_DEPLOYED.

---

# 28. 검색 API

## GET `/api/search?q=...`

검색 대상:
- Issue ID
- title/location/symptom
- Reporter Name
- Assignee Name
- Comment Body

Response는 최대 N건 quick result.

Full Search는 `/api/issues?q=` 사용.

---

# 29. Error Response 표준

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

주요 Error Code:
- VALIDATION_ERROR
- NOT_FOUND
- FORBIDDEN
- REVISION_CONFLICT
- INVALID_STATE_TRANSITION
- FILE_TYPE_NOT_ALLOWED
- FILE_TOO_LARGE
- STORAGE_WRITE_FAILED

---

# 30. HTTP Status

| 상황 | Status |
|---|---:|
| 성공 조회 | 200 |
| 생성 | 201 |
| 잘못된 입력 | 400 |
| 세션 없음 | 401 |
| 권한 없음 | 403 |
| 없음 | 404 |
| revision 충돌 | 409 |
| 상태전이 불가 | 409 |
| 파일 너무 큼 | 413 |
| 서버 저장 실패 | 500 |

---

# 31. Audit JSONL

예:

```json
{"eventId":"EVT-000126","issueId":"DEF-0023","eventType":"RESOLVED","actorId":"U-000021","timestamp":"2026-09-24T13:10:00+09:00","before":{"status":"IN_PROGRESS"},"after":{"status":"DONE"}}
```

원칙:
- Append-only
- 월 단위 파일 Rotation 권장
- 일반 UI에서 직접 수정 불가
- Backup 대상

---

# 32. Backup

권장:
- 1일 1회 전체 `/data` + `/uploads` Backup
- 추가로 Issue 저장 전 원본 file `.bak` 한 세대 유지 가능
- Retention 기본 30일
- Backup 실패 로그 기록

MVP 운영 UI:
- 마지막 Backup 시간
- Backup 성공/실패 상태

---

# 33. 서버 내부 Service Layer

권장 모듈:

```text
services/
  SessionService
  UserService
  ConfigService
  IssueService
  WorkflowService
  CommentService
  AttachmentService
  DeploymentService
  DashboardService
  AuditService
  BackupService

repositories/
  JsonUserRepository
  JsonIssueRepository
  JsonConfigRepository
  AuditLogRepository
```

API Handler에서 파일 직접 접근 금지.
반드시 Service → Repository 계층 사용.

---

# 34. 권한 판단 함수

예:

```text
canEditIssueContent(user, issue)
  = user.isQualityAdmin
    OR issue.reporter.userId == user.userId

canClaim(user, issue)
  = issue.assignee == null
    AND issue.status == OPEN

canAssign(user, issue)
  = user.isQualityAdmin
    OR issue.assignee.userId == user.userId

canChangePriority(user, issue)
  = user.isQualityAdmin
    OR issue.assignee.userId == user.userId

canWorkflow(user, issue)
  = user.isQualityAdmin
    OR issue.assignee.userId == user.userId

canCloseVerified(user, issue)
  = user.isQualityAdmin
    OR issue.reporter.userId == user.userId

canCloseAgreed(user, issue)
  = user.isQualityAdmin
    OR issue.assignee.userId == user.userId
```

---

# 35. 데이터 보존 원칙

- Issue 물리 삭제 금지
- User 삭제 대신 inactive
- Environment 삭제 대신 inactive
- Comment 원칙적으로 immutable
- Attachment 삭제도 logical delete 권장
- Cancel은 상태값으로 보존
- Before/After 변경이력 보존
- Snapshot Name/Team을 History에 보관하여 향후 사용자 소속 변경에도 과거 이력 의미 유지
