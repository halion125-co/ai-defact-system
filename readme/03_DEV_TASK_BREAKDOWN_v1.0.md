# 03. 개발 Task Breakdown v1.0

## 0. 목적

PMD, 화면 IA, API/JSON 설계를 실제 구현 가능한 개발 작업 단위로 분해한다.

우선순위:
- P0: MVP 필수
- P1: MVP 내 권장
- P2: 후속 확장

---

# 1. 권장 구현 순서

```text
M0. Foundation
 ↓
M1. 사용자/설정
 ↓
M2. Issue 등록/조회
 ↓
M3. Workflow/Comment/History
 ↓
M4. Kanban/List/MY
 ↓
M5. Dashboard
 ↓
M6. Traceability/Deployment
 ↓
M7. Hardening/Backup/Test
```

---

# 2. EPIC E0 - 개발 기반 / 폐쇄망 패키징

## E0-01 프로젝트 Skeleton [P0]
산출:
- frontend
- backend
- data
- uploads
- backup 구조

Acceptance:
- 외부 인터넷 없이 로컬/폐쇄망 서버에서 실행
- 외부 CDN 호출 0건

## E0-02 Config/Environment 분리 [P0]
- 개발/운영 설정 파일
- Port, data path, upload path
- timezone Asia/Seoul

## E0-03 공통 Error Handling [P0]
- API Error 표준
- UI Error Toast/Inline
- 입력 유지

## E0-04 Logging [P0]
- 서버 Access/Error Log
- 개인정보/민감정보 과다 로그 금지

## E0-05 Design Token / Common UI [P0]
- Color
- Typography
- Button
- Form
- Modal
- Badge
- Card

---

# 3. EPIC E1 - Application Shell

## E1-01 Sidebar [P0]
메뉴:
- Dashboard
- Issue 관리
- MY
- + Issue 등록
- 설정(Admin)

## E1-02 Header [P0]
- 고객사/프로젝트
- 검색
- 사용자
- 사용자 변경

## E1-03 Responsive Layout [P1]
- 1440 기준
- 1280 최소
- table horizontal scroll

## E1-04 KT Logo [P0]
- Sidebar left-bottom
- 32~40px
- aspect ratio 유지

---

# 4. EPIC E2 - 사용자 식별 / Session

## E2-01 User JSON Repository [P0]
- users.json read/write
- employeeId unique

## E2-02 최초 사용자 등록 API/UI [P0]
- 사번
- 이름
- 소속

## E2-03 Session Start [P0]
- employeeId 기반
- HttpOnly session cookie 권장

## E2-04 마지막 사용자 기억 [P1]
- 브라우저 local storage에는 employeeId만 저장
- 세션 Actor는 서버가 결정

## E2-05 Quality Admin Bootstrap [P0]
- 초기 관리자 server config
- UI self-elevation 금지

## E2-06 사용자 관리 [P0]
Admin:
- 이름/소속
- active
- admin 여부

---

# 5. EPIC E3 - 프로젝트 설정

## E3-01 Project Config Repository [P0]
- customerName
- projectName
- revision

## E3-02 환경 설정 [P0]
- add/edit/inactive/order
- 기존 참조 환경 삭제 금지

## E3-03 Priority 설정 [P1]
- displayName
- description
- active/order
- internal code 유지

## E3-04 운영 설정 [P1]
- staleIssueDays
- file size
- allowed extensions
- deployment/changeRef toggle

## E3-05 설정 UI [P0]
Tabs:
- 프로젝트
- 환경
- 사용자
- 운영

---

# 6. EPIC E4 - 저장소 / 동시성 / ID

## E4-01 Issue File Repository [P0]
- file-per-issue JSON
- CRUD read/update

## E4-02 Atomic Write [P0]
- temp file
- fsync
- rename/replace

## E4-03 Issue Lock [P0]
- issue-level lock
- timeout/error 처리

## E4-04 Revision Conflict [P0]
- expectedRevision
- 409 handling
- UI refresh prompt

## E4-05 Sequence Generator [P0]
- DEF/IMP/INQ sequence
- exclusive lock
- duplicate 방지

## E4-06 Audit JSONL [P0]
- append-only
- monthly rotate

---

# 7. EPIC E5 - Issue 등록

## E5-01 Issue Type Selector [P0]
- Defect
- Improvement
- Inquiry

## E5-02 Defect Form [P0]
필드:
- location
- environment
- symptom
- reproductionSteps
- expectedResult
- attachment optional

## E5-03 Defect Sample UX [P0]
- 각 필드 예시
- 재현절차 단계 추가/삭제

## E5-04 Defect Create API [P0]
자동:
- ID
- Reporter
- Open
- History

## E5-05 Improvement Form/API [P0]

## E5-06 Inquiry Form/API [P0]

## E5-07 등록 성공 UX [P0]
- Issue ID
- 상세 보기
- 계속 등록
- 목록 이동

---

# 8. EPIC E6 - Issue 조회 / Detail

## E6-01 Issue List API [P0]
- filter
- search
- sort
- pagination

## E6-02 Issue Detail API [P0]
- current snapshot
- comments
- history
- permission hints

## E6-03 Issue Summary UI [P0]
- ID
- type
- title
- status
- priority
- reporter/assignee
- environment
- created

## E6-04 등록내용 표시 [P0]
- symptom
- reproduction
- expected
- attachments

## E6-05 Reporter 수정 [P0]
- 본인 issue only
- admin all
- before/after event

## E6-06 ID 복사 [P1]
- `DEF-xxxx` clipboard

---

# 9. EPIC E7 - Assignee / Priority

## E7-01 Claim [P0]
- unassigned Open
- `[내가 조치]`

## E7-02 Assignee 변경 [P0]
- current assignee → 다른 사용자
- admin override
- 타인 최초 배정은 admin

## E7-03 Priority 변경 [P0]
- Assignee/Admin
- Critical/Major/Minor

## E7-04 변경 이력 [P0]
- ASSIGNED
- PRIORITY_CHANGED

---

# 10. EPIC E8 - Workflow

## E8-01 State Machine [P0]
```text
OPEN → IN_PROGRESS → DONE → CLOSED
DONE/CLOSED → IN_PROGRESS
OPEN/IN_PROGRESS/DONE → CANCEL
```

## E8-02 Start Action [P0]
- Assignee/Admin
- Open → In Progress

## E8-03 Resolve Action [P0]
- Assignee/Admin
- description required
- In Progress → Done

## E8-04 Reporter Reopen [P0]
- reason required
- Done/Closed → In Progress

## E8-05 Reporter Verified Close [P0]
- Done → Closed
- closeType VERIFIED

## E8-06 Assignee Agreed Close [P0]
- agreement comment required
- closeType AGREED

## E8-07 Cancel [P0]
- Assignee/Admin
- reason required

## E8-08 Admin Status Override [P1]
- reason required
- distinct audit event

## E8-09 Invalid Transition Guard [P0]
- server-side

---

# 11. EPIC E9 - Comment / Timeline

## E9-01 Comment Create [P0]
- body
- actor
- time

## E9-02 Comment UI [P0]
- composer
- timeline render

## E9-03 Timeline Merge [P0]
- system events + comments chronological

## E9-04 Before/After Viewer [P1]
- content update diff

## E9-05 Comment Hide [P1]
- admin only
- reason
- audit preserve

---

# 12. EPIC E10 - Attachment

## E10-01 Upload API [P1]
- extension allowlist
- MIME
- size
- sanitized stored name

## E10-02 Issue Attachment UI [P1]
- upload
- list
- download

## E10-03 Logical Delete [P1]
- author/admin
- audit

## E10-04 Path Traversal Test [P0 security]
- malicious file name
- nested path

---

# 13. EPIC E11 - Kanban / List / MY

## E11-01 Kanban API/View [P0]
- Open/In Progress/Done/Closed

## E11-02 Kanban Card [P0]
- ID
- title
- priority
- environment
- reporter
- assignee

## E11-03 Quick Filter [P0]
- all
- unassigned
- my reported
- my assigned
- waiting verification
- critical

## E11-04 Drag Drop Disable [P0]
- no status mutation via drag

## E11-05 List Table [P0]
- columns
- sort/filter

## E11-06 MY Tabs [P0]
- 내가 등록
- 내가 조치
- 확인대기

---

# 14. EPIC E12 - Dashboard

## E12-01 Summary API [P0]
- total/status
- critical
- unassigned
- stale
- reopen
- deploy/verify waiting

## E12-02 KPI Cards [P0]
- clickable drilldown

## E12-03 Daily Activity API [P0]
- created
- first resolved
- closed

## E12-04 Daily Bar Chart [P0]
- offline bundled chart library or native SVG/Canvas

## E12-05 Burn Up API [P0]
- created cumulative
- first-resolved cumulative
- closed cumulative optional

## E12-06 Burn Up Chart [P0]
- tooltip
- summary
- current unresolved note

## E12-07 Distribution API/Charts [P0]
- status
- priority
- environment

## E12-08 Attention List [P0]
- critical unresolved
- unassigned
- stale
- waiting deploy
- waiting verification
- reopen

## E12-09 Drill-down [P0]
- KPI/Chart → List filter

## E12-10 Dashboard Filter [P0]
- type/date/env/priority

---

# 15. EPIC E13 - Change / Deployment Traceability

## E13-01 Resolution Fields [P1]
- description
- changeReference
- targetVersion

## E13-02 Change Reference UI [P1]
- generic label
- tool neutral

## E13-03 Deployment API [P1]
- env
- version
- time
- actor

## E13-04 Deployment UI [P1]
- 배포 완료 Modal
- status badge

## E13-05 Timeline DEPLOYED Event [P1]

## E13-06 Dashboard waitingDeploy/waitingVerification [P1]

---

# 16. EPIC E14 - 검색

## E14-01 Global Quick Search [P1]
- ID
- title/symptom
- user

## E14-02 Full Search [P0]
- issue list q filter

## E14-03 Comment Search [P1]

---

# 17. EPIC E15 - Backup / 운영 안정성

## E15-01 Scheduled Backup [P1]
- data
- uploads

## E15-02 Retention [P1]
- 30 days default

## E15-03 Backup Status [P1]
- last success/fail

## E15-04 Startup Validation [P0]
- JSON schema/required file check
- corruption fail-safe

## E15-05 Recovery Procedure [P1]
- documented restore

---

# 18. EPIC E16 - 보안

## E16-01 XSS Escape [P0]
- all user content

## E16-02 CSRF Protection [P0]
- session cookie 사용 시

## E16-03 File Security [P0]
- allowlist
- MIME
- path
- execution block

## E16-04 Authorization Server-side [P0]
- UI permission만 믿지 않음

## E16-05 No External Request Test [P0]
- CSP or network inspection
- CDN/API 0

## E16-06 Security Headers [P1]
- CSP
- X-Content-Type-Options
- frame options as appropriate

---

# 19. EPIC E17 - 테스트

## E17-01 Unit Test [P0]
대상:
- state transition
- permission
- ID generator
- revision conflict
- dashboard calculation

## E17-02 API Integration Test [P0]
- create/update/comment/resolve/close
- concurrent update

## E17-03 File Corruption/Failure Test [P0]
- write failure
- temp file
- recovery

## E17-04 E2E Test [P0]
Scenario:
1. Reporter 등록
2. Assignee claim
3. Priority
4. Start
5. Comment
6. Resolve
7. Deploy
8. Reporter Close
9. Timeline 검증

## E17-05 Assignee Close E2E [P0]
- agreement comment 없으면 실패
- 있으면 Closed

## E17-06 Admin Override E2E [P1]

## E17-07 Dashboard Data Test [P0]
- daily
- burnup
- reopen edge case
- drilldown count consistency

---

# 20. EPIC E18 - 배포 패키지 / 운영문서

## E18-01 Offline Package [P0]
포함:
- runtime 또는 설치가이드
- frontend assets
- backend
- data seed
- no CDN

## E18-02 Bootstrap Admin Guide [P0]

## E18-03 Backup/Restore Guide [P1]

## E18-04 User Quick Guide [P1]
1 page:
- 등록
- 조치
- Close
- Comment

## E18-05 Admin Guide [P1]
- project/env/user
- status override
- audit

---

# 21. MVP Release Gate

다음 항목이 모두 충족되어야 MVP 완료로 본다.

## 기능
- [ ] 사용자 등록/식별
- [ ] Project/Environment 설정
- [ ] Defect/Improvement/Inquiry 등록
- [ ] Issue Detail
- [ ] Reporter 수정
- [ ] Assignee/Priority
- [ ] Workflow
- [ ] Comment
- [ ] Timeline
- [ ] Kanban/List/MY
- [ ] Quality Admin
- [ ] Dashboard
- [ ] Daily Chart
- [ ] Burn Up
- [ ] Drill-down

## 데이터
- [ ] Atomic Write
- [ ] Issue Lock
- [ ] revision conflict
- [ ] ID duplicate 방지
- [ ] Audit Log

## 보안
- [ ] XSS
- [ ] Authorization
- [ ] File Security
- [ ] External Request 0

## 운영
- [ ] Server restart 후 data 유지
- [ ] JSON corruption 대응
- [ ] Backup/Restore 절차

---

# 22. 권장 Delivery Milestone

## M0 Foundation
E0, E1, E2, E3, E4

완료 결과:
- 서비스 Shell 실행
- 사용자 식별
- 설정 저장
- JSON 저장 안정성 확보

## M1 Core Issue
E5, E6, E7, E8, E9

완료 결과:
- 결함 등록 → 조치 → Close 전체 흐름 가능

## M2 Work Management
E10, E11, E14

완료 결과:
- Kanban/List/MY/첨부/검색

## M3 Quality Dashboard
E12

완료 결과:
- KPI
- 일별
- Burn Up
- Drill-down

## M4 Traceability & Hardening
E13, E15, E16, E17, E18

완료 결과:
- 소스/배포 추적
- 보안/백업
- 운영배포 가능
