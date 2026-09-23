# 00. Implementation Blueprint v1.0

## 목적

PMD v1.0을 실제 개발로 전환하기 위한 구현 설계 패키지이다.

구성:
1. `01_SCREEN_IA_SPEC_v1.0.md` — 화면 IA / 화면정의
2. `02_API_JSON_SPEC_v1.0.md` — API / JSON / 저장구조
3. `03_DEV_TASK_BREAKDOWN_v1.0.md` — 개발 Task Breakdown

---

# 핵심 구현 결정

## 1. 저장구조

DBMS는 사용하지 않는다.

다만 다중 사용자 동시 접근과 파일 손상 범위를 줄이기 위해 단일 `issues.json`보다 다음 구조를 권장한다.

```text
/data/issues/DEF-0001.json
/data/issues/DEF-0002.json
...
```

공통 데이터:
- users.json
- project.json
- operation.json
- sequence.json
- append-only audit JSONL

---

## 2. 사용자/Role

Role은 별도 복잡한 RBAC가 아니라 다음 업무 관계로 판단한다.

- Reporter: 해당 Issue 등록자
- Assignee: 해당 Issue 현재 조치자
- Quality Admin: 전역 Super User

추가 구현 규칙:
- 미배정 Open Issue는 모든 프로젝트 사용자가 `[내가 조치]`로 Claim 가능
- 타인에게 최초 배정은 Quality Admin
- 현재 Assignee는 다른 사용자에게 인계 가능
- Quality Admin은 언제든 변경 가능

---

## 3. 상태 변경

Raw Status Dropdown을 업무 UI에 노출하지 않는다.

```text
Open
  [조치 시작]
In Progress
  [조치 완료]
Done
  [정상 확인 · Close]
  [재조치 요청]
Closed
```

Assignee가 Close:
- 가능
- 고객/업무담당자 합의내용 필수

Quality Admin:
- 모든 상태 수정 가능
- 강제 변경 시 사유 필수

---

## 4. Comment / History

Comment와 System Event를 하나의 Timeline으로 표현한다.

Comment는 원칙적으로 immutable.
수정 대신 새 Comment로 정정한다.

모든 중요 변경은:
- Who
- When
- What
- Before
- After
를 보존한다.

---

## 5. CI/CD 연결

MVP에서 CI/CD 자동연동은 하지 않는다.

대신 Traceability Field를 구현한다.

```text
Issue ID
 → Change Reference
 → Target Version
 → Deployment Environment
 → Deployment Version
 → Verification
 → Close
```

향후 Git/SVN/Jenkins/GitLab 등과 연동 가능하도록 API/Data Model만 Tool-neutral하게 유지한다.

---

## 6. Dashboard

핵심:
- 현재 상태
- 일자별 등록/조치
- 누적 등록/누적 조치 Burn Up
- Critical/미배정/장기미조치
- 배포대기/재검증대기
- Drill-down

Burn Up MVP 정의:
- 등록 누적: createdAt 기반 Unique Defect
- 조치 누적: firstResolvedAt 기반 Unique Defect
- Re-open은 별도 KPI
- 현재 미조치는 current status 기준 별도 KPI

이렇게 해야 "누적"의 의미를 유지하면서 Re-open으로 인한 지표 왜곡을 별도로 설명할 수 있다.

---

# 개발 시작 전 확정된 전제

- 금융권 폐쇄망
- 외부 인터넷 없음
- GitHub/Jira 없음
- 외부 CDN/API 없음
- 별도 DBMS 없음
- 경량 Backend 사용
- JSON/File 저장
- 비밀번호 없는 사번 기반 사용자 식별
- Defect/Improvement/Inquiry
- Reporter/Assignee/Quality Admin
- Open/In Progress/Done/Closed/Cancel
- 모든 중요 변경 History
- Dashboard/Burn Up
- CI/CD 직접연동 없음, Traceability Field만 제공

---

# 개발 시작 순서

1. 저장구조/Lock/Revision
2. 사용자/Project 설정
3. Issue Create
4. Issue Detail
5. Workflow/History/Comment
6. Kanban/List/MY
7. Dashboard
8. Change/Deployment
9. Backup/Security/Test

화면부터 먼저 모두 만드는 것보다 **데이터 무결성 + Workflow를 먼저 완성**한 뒤 Dashboard를 얹는 순서를 권장한다.
