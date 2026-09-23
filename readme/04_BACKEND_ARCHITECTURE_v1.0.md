# 04. Backend Architecture v1.0

## 1. 목표
별도 DBMS 없이도 소규모 다중 사용자가 안정적으로 사용할 수 있는 폐쇄망 Backend를 구현한다.

## 2. 권장 구조
```text
HTTP API
  ↓
Controller / Route
  ↓
Auth & Permission
  ↓
Service
  ↓
Repository
  ↓
JSON/File Store + Audit + Upload
```

권장 디렉터리:
```text
backend/
  app/
    controllers/
    services/
    repositories/
    models/
    permissions/
    validators/
    utils/
  data/
    config/
    issues/
    audit/
    backup/
  uploads/
```

## 3. 계층 책임
### Controller
- Request parsing
- Session 확인
- Validation 호출
- Service 호출
- HTTP Status/Error 변환

### Permission
- Reporter/Assignee/Quality Admin 판단
- Action별 권한 검증
- UI 권한과 별개로 서버에서 재검증

### Service
- 상태전이
- Assignee/Priority 정책
- Revision 확인
- History Event 생성
- Dashboard 계산

### Repository
- JSON read/write
- file lock
- atomic replace
- sequence 발급
- append-only audit

## 4. 파일 저장 구조
```text
/data
  users.json
  sequence.json
  /config
    project.json
    operation.json
  /issues
    DEF-0001.json
    IMP-0001.json
    INQ-0001.json
  /audit
    events-YYYY-MM.jsonl
  /backup
/uploads
  /DEF-0001
```

Issue별 파일 분리를 기본으로 한다. 단일 issues.json 사용은 금지 권장.

## 5. 동시성
모든 Mutable Resource에 `revision`을 둔다.

Client는 수정 시 `expectedRevision`을 전송한다.
- 일치: 처리 후 revision +1
- 불일치: 409 Conflict

Issue 저장 순서:
1. Issue lock 획득
2. 최신 revision 읽기
3. expectedRevision 비교
4. 업무 규칙/권한 검증
5. 새 Snapshot 생성
6. Temp file write
7. flush/fsync
8. atomic rename/replace
9. audit append
10. lock release

## 6. Sequence
`sequence.json`은 별도 global lock으로 보호한다.

```json
{"DEF":23,"IMP":7,"INQ":12}
```

ID 예:
- DEF-0024
- IMP-0008
- INQ-0013

## 7. 상태전이 Service
Raw status update는 금지한다.

Action Service:
- claimIssue
- assignIssue
- changePriority
- startIssue
- resolveIssue
- reopenIssue
- closeIssue
- cancelIssue
- adminOverrideStatus
- registerDeployment

각 Action은 상태/권한/필수입력을 검증한 뒤 Event를 생성한다.

## 8. Snapshot + History
현재 화면 조회 성능을 위해 Issue 파일에는 Current Snapshot을 저장한다.
동시에 모든 주요 변경은 `history[]`와 Global Audit JSONL에 남긴다.

최소 Event:
- CREATED
- UPDATED
- COMMENTED
- ASSIGNED
- PRIORITY_CHANGED
- STATUS_CHANGED
- RESOLVED
- DEPLOYED
- REOPENED
- CANCELLED
- CLOSED
- ADMIN_STATUS_OVERRIDE

## 9. Comment
Comment는 원칙적으로 immutable.
정정은 새 Comment로 추가한다.
Quality Admin은 화면 숨김 가능하나 원문은 Audit에서 삭제하지 않는다.

## 10. Dashboard 계산
Dashboard는 Issue 파일을 스캔하여 계산한다.
프로젝트 규모가 커질 경우에만 Cache JSON을 도입한다.

MVP 계산 기준:
- 신규: createdAt
- 최초 조치완료: firstResolvedAt
- 누적등록: Unique Defect created cumulative
- 누적조치: Unique Defect firstResolved cumulative
- 현재 미조치: current status가 OPEN/IN_PROGRESS
- 재검증대기: DONE + 배포완료(배포 기능 미사용 시 DONE)
- 배포대기: DONE + NOT_DEPLOYED

## 11. Backup
- data + uploads 대상
- 일 1회 기본
- 기본 30일 보관
- 복구 시 서비스 중지 후 restore 권장
- Backup 성공/실패 로그 저장

## 12. Backend Acceptance
- 동시 수정 2건 중 하나가 409로 보호됨
- 저장 중 프로세스 오류가 발생해도 원본 JSON 유지
- Issue ID 중복 0건
- 모든 Mutation에 Audit Event 존재
- 서버 재시작 후 데이터 유지
