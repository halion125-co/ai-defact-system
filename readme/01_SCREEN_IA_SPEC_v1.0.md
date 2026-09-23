# 01. 화면 IA / 화면정의서 v1.0

## 0. 문서 목적

본 문서는 금융권 폐쇄망용 경량 결함관리 서비스 PMD v1.0을 실제 화면으로 구현하기 위한 IA(Information Architecture), 화면별 기능, 권한, 입력/검증, 화면 이동 규칙을 정의한다.

---

# 1. IA 전체 구조

```text
[사용자 시작]
  ├─ 최초 사용자 등록
  └─ 기존 사용자 시작
        │
        ▼
[Application Shell]
  ├─ Dashboard
  ├─ Issue 관리
  │    ├─ Kanban
  │    ├─ List
  │    └─ Issue Detail
  ├─ MY
  │    ├─ 내가 등록
  │    ├─ 내가 조치
  │    └─ 확인대기
  ├─ + Issue 등록
  │    ├─ 유형 선택
  │    ├─ Defect 등록
  │    ├─ Improvement 등록
  │    └─ Inquiry 등록
  └─ 설정 (Quality Admin)
       ├─ 프로젝트
       ├─ 발생환경
       ├─ Priority
       ├─ 사용자
       └─ 운영설정
```

---

# 2. 화면 목록

| Screen ID | 화면명 | 주요 사용자 | 목적 |
|---|---|---|---|
| SCR-001 | 사용자 시작 | 전체 | 기존 사용자 선택/사용자 변경 |
| SCR-002 | 최초 사용자 등록 | 신규 사용자 | 사번·이름·소속 등록 |
| SCR-010 | Dashboard | 전체, 특히 Quality Admin | 품질 현황/관리 필요 항목 파악 |
| SCR-020 | Issue 유형 선택 | 전체 | Defect/Improvement/Inquiry 선택 |
| SCR-021 | Defect 등록 | 전체 | 재현 가능한 결함 등록 |
| SCR-022 | Improvement 등록 | 전체 | 개선요청 등록 |
| SCR-023 | Inquiry 등록 | 전체 | 문의 등록 |
| SCR-030 | Issue Kanban | 전체 | 상태별 Issue 현황 조회 |
| SCR-031 | Issue List | 전체 | 표 기반 검색/필터/정렬 |
| SCR-032 | Issue Detail | 전체 | 등록내용·조치·배포·Timeline 통합 |
| SCR-040 | MY | 전체 | 나와 관련된 Issue 조회 |
| SCR-050 | 설정 | Quality Admin | 프로젝트/환경/사용자/운영설정 |
| SCR-060 | 공통 Modal | 권한별 | Assignee/Priority/상태/배포 Action |

---

# 3. 공통 Application Shell

## 3.1 Sidebar

메뉴:

```text
Dashboard
Issue 관리
  ├ Kanban
  └ 목록
MY
+ Issue 등록
설정  # Quality Admin만 표시
```

규칙:
- 현재 메뉴는 Primary Blue 배경으로 표시한다.
- 메뉴 Depth는 최대 2단계.
- `+ Issue 등록`은 항상 보이는 Primary Action으로 제공한다.
- KT Logo는 Sidebar 좌측 하단에 고정한다.

## 3.2 Global Header

표시:
- 고객사명 / 프로젝트명
- 통합 Issue 검색
- 현재 사용자명
- 사용자 소속 또는 Role
- 사용자 변경

예:

```text
A은행 | Gen AI 플랫폼 구축        [Issue 검색...]      김성훈
                                                     Quality Admin
```

## 3.3 권한 표시 원칙

권한이 없는 기능은:
- 원칙적으로 숨김
- 사용자가 접근 URL을 직접 입력한 경우 403 화면 또는 "권한이 없습니다" 표시
- 버튼 Disabled로만 두어 혼동시키지 않는다.

---

# 4. SCR-001 사용자 시작

## 목적
비밀번호 없이 폐쇄망 내 사용자를 식별한다.

## 화면

```text
김성훈 (AX리스크/품질팀)

[이 사용자로 시작]
[사용자 변경]

처음 사용하시나요?
[신규 사용자 등록]
```

## 동작
- `[이 사용자로 시작]` → 세션 생성 → Dashboard
- `[사용자 변경]` → 등록 사용자 선택 또는 사번 입력
- `[신규 사용자 등록]` → SCR-002

## 주의
본 기능은 강한 인증이 아니라 사용자 식별이다.

---

# 5. SCR-002 최초 사용자 등록

## 입력항목

| 항목 | 필수 | 검증 |
|---|---|---|
| 사번 | Y | 공백 금지, 프로젝트 내 Unique |
| 이름 | Y | 2~50자 |
| 소속 | Y | 1~100자 |

## 화면

```text
사번 *
[________________]

이름 *
[________________]

소속 *
[________________]

[취소] [시작]
```

## 처리
1. 사번 중복 검사
2. User 생성
3. 세션 생성
4. Dashboard 이동

## Quality Admin Bootstrap
최초 Quality Admin은 일반 사용자가 UI에서 스스로 지정할 수 없다.
배포 시 bootstrap 설정 또는 서버 측 초기 관리자 사번 설정으로 생성한다.

---

# 6. SCR-010 Dashboard

## 6.1 목적

품질담당자/Test Manager가 다음 질문에 즉시 답할 수 있어야 한다.

- 결함이 얼마나 발생했는가?
- 얼마나 조치되었는가?
- 현재 미조치 Gap은 얼마인가?
- Critical/미배정/장기 미조치는 몇 건인가?
- 배포 후 재검증이 밀리고 있는가?

## 6.2 Global Filter

| Filter | 기본값 |
|---|---|
| Issue Type | Defect |
| 기간 | 전체 |
| 환경 | 전체 |
| Priority | 전체 |

Dashboard의 모든 KPI/Chart는 동일 Filter를 적용한다.

## 6.3 KPI Row 1

- 전체 결함
- Open
- In Progress
- Done
- Closed

모든 KPI 클릭 시 SCR-031 List 화면으로 이동하며 Filter를 전달한다.

## 6.4 KPI Row 2

- Critical
- 담당자 미지정
- 장기 미조치
- Re-open
- 배포대기
- 재검증대기

## 6.5 일자별 등록/조치 Chart

Bar Chart:
- 신규 등록 건수
- 조치 완료 건수
- 선택적으로 Closed 건수

정의:
- 신규 등록 = `createdAt` 기준
- 조치 완료 = 해당 Defect가 최초로 `Done`에 도달한 날짜 기준
- Closed = 해당 날짜의 Closed Event 건수 또는 최초 Closed 건수

Chart Bar 클릭 → 해당 날짜/지표 Filter가 적용된 SCR-031.

## 6.6 Burn Up Chart

기본 Line:
- 누적 등록
- 누적 조치 완료

선택 Toggle:
- 누적 Closed

표시 Summary:

```text
누적 등록 128
누적 조치 92
현재 미조치 36
```

중요:
- Burn Up의 `누적 조치`는 MVP에서 "최초 Done 도달 Unique Defect 누적"으로 정의한다.
- Re-open은 별도 KPI로 표시한다.
- 현재 미조치 KPI는 현재 상태가 `Open/In Progress`인 Defect 수를 기준으로 계산하며 Burn Up 선 간 단순 차이와 다를 수 있다.
- 이 차이를 UI Tooltip에 설명한다.

## 6.7 상태 분포

Donut:
- Open
- In Progress
- Done
- Closed

## 6.8 Priority 분포

Bar:
- Critical
- Major
- Minor
- 미지정

## 6.9 환경별 분포

프로젝트 환경 설정값 기준 Bar/Horizontal Bar.

## 6.10 관리 필요

리스트:
- Critical 미조치
- 담당자 미지정
- 장기 미조치
- 배포대기
- 재검증대기
- Re-open

각 Row 클릭 → List Drill-down.

---

# 7. SCR-020 Issue 유형 선택

## 화면

```text
무엇을 등록하시겠어요?

[🐞 결함]
오류가 발생했어요

[💡 개선요청]
더 좋게 개선하고 싶어요

[❓ 문의]
확인이 필요한 내용이 있어요
```

## 이동
- Defect → SCR-021
- Improvement → SCR-022
- Inquiry → SCR-023

---

# 8. SCR-021 Defect 등록

## 8.1 UX 원칙
- 1 Page Form
- 1분 내 등록 목표
- Reporter가 Assignee/Priority를 지정하지 않음
- 재현 가능성 확보가 최우선

## 8.2 입력항목

| Field | UI 질문 | 필수 | 검증 |
|---|---|---:|---|
| location | 어디에서 발생했나요? | Y | 1~200자 |
| environmentId | 발생 환경 | Y | 활성 환경 중 선택 |
| symptom | 어떤 문제가 발생했나요? | Y | 5~2000자 |
| reproductionSteps[] | 어떻게 하면 다시 발생하나요? | Y | 최소 1단계 |
| expectedResult | 정상이라면 어떻게 되어야 하나요? | Y | 5~2000자 |
| attachments[] | 화면 캡처/증적 | N | 허용 확장자/크기 |

## 8.3 Sample

발생 위치:
`예) 고객관리 > 고객정보 조회`

발생 현상:
`예) 고객명을 입력하고 조회 버튼을 누르면 결과가 표시되지 않고 로딩 상태가 계속됩니다.`

재현 절차:
```text
1. 고객관리 메뉴 접속
2. 고객정보 조회 선택
3. 고객명 입력
4. 조회 버튼 클릭
5. 로딩 화면에서 멈춤
```

기대 결과:
`예) 조회조건에 해당하는 고객 목록이 표시되어야 합니다.`

## 8.4 자동 생성
- ID: `DEF-####`
- reporter
- createdAt
- status=`OPEN`
- priority=`UNASSIGNED`
- assignee=`null`
- history CREATED Event

## 8.5 등록 성공
Toast:
`DEF-0023 결함이 등록되었습니다.`

Action:
- `[상세 보기]`
- `[계속 등록]`
- `[목록으로]`

---

# 9. SCR-022 Improvement 등록

## 입력

| Field | 필수 |
|---|---:|
| target | Y |
| request | Y |
| reason | N |
| attachments | N |

문구:
- 개선 대상
- 어떻게 개선했으면 좋겠나요?
- 왜 개선이 필요한가요?
- 참고자료

자동 생성:
- `IMP-####`
- Open
- Reporter
- Created Event

---

# 10. SCR-023 Inquiry 등록

## 입력

| Field | 필수 |
|---|---:|
| target | Y |
| question | Y |
| attachments | N |

자동 생성:
- `INQ-####`
- Open
- Reporter
- Created Event

---

# 11. SCR-030 Issue Kanban

## Columns

```text
Open       In Progress       Done       Closed
접수        조치중            확인대기    완료
```

Cancel은 별도 Filter에서 조회.

## Card 최소 정보
- Issue ID
- Type
- 제목/현상 요약
- Priority
- Environment
- Reporter
- Assignee
- Created Date

## 조치자 미지정 카드

```text
DEF-0031  Critical
로그인 후 화면이 멈추는 현상

검증계
Reporter 김성훈
Assignee 미지정 ⚠

[내가 조치]
```

`[내가 조치]` 규칙:
- 미배정 Open Issue에서 모든 프로젝트 사용자가 선택 가능
- 선택 즉시 본인을 Assignee로 설정
- 이어서 Priority 선택 Prompt 제공 가능
- 상태는 자동으로 In Progress로 변경하지 않고 `[조치 시작]`을 별도 선택하게 한다.
  - 이유: "배정"과 "실제 조치 시작"을 이력상 분리

## Drag & Drop
상태 변경 용도로 사용하지 않는다.
카드 위치는 상태 데이터에 따라 서버 응답을 렌더링한다.

## Quick Filter
- 전체
- 신규/미지정
- 내가 등록
- 내가 조치
- 확인대기
- Critical

---

# 12. SCR-031 Issue List

## Column

| ID | 유형 | 제목/현상 | 환경 | Priority | Status | Reporter | Assignee | 등록일 | 업데이트 |
|---|---|---|---|---|---|---|---|---|---|

## 기능
- 검색
- Type Filter
- Status Filter
- Environment Filter
- Priority Filter
- Assignee Filter
- Date Filter
- Sort
- Pagination

## Drill-down
ID/제목 클릭 → SCR-032

---

# 13. SCR-032 Issue Detail

## 13.1 Layout

```text
[Summary]
ID / Title / Status / Priority
Reporter / Assignee / Environment / Created
[ID 복사] [등록내용 수정] [More]

[등록 내용]
발생 위치
발생 현상
재현 절차
기대 결과
첨부

[조치 / Traceability]
Assignee
Priority
조치 결과
Change Reference
Target Version
Deployment

[Action Bar]
조치 시작 / 조치 완료 / 배포 완료 / 재조치 / Close

[Timeline]
System Event + Comment

[Comment Composer]
```

---

## 13.2 Summary Permission

Reporter:
- 본인 Issue `[등록내용 수정]`
- Comment
- Done이면 `[재조치 요청]`, `[정상 확인 · Close]`

Assignee:
- Assignee 변경
- Priority 변경
- 상태 Action
- Comment
- Deployment
- Close

Quality Admin:
- 모든 항목 수정 가능
- 모든 Action 가능
- 강제 상태 변경 시 사유 필수

---

## 13.3 Assignee 지정/변경

초기:
`미지정`

처리 규칙:
1. 누구나 미배정 Issue를 `[내가 조치]`로 Claim 가능
2. 타인에게 최초 배정은 Quality Admin이 가능
3. 현재 Assignee는 다른 사용자에게 인계 가능
4. Quality Admin은 언제든 변경 가능
5. 모든 변경은 Timeline 기록

---

## 13.4 Priority

기본:
`미지정`

변경 가능:
- 현재 Assignee
- Quality Admin

값:
- Critical
- Major
- Minor

변경 시 Timeline:
`Major → Critical`

---

# 14. Workflow / Action Matrix

| 현재 상태 | Action | 수행자 | 다음 상태 | 추가 입력 |
|---|---|---|---|---|
| Open | 내가 조치 | 모든 사용자 | Open | 없음 |
| Open | 조치 시작 | Assignee/Admin | In Progress | 없음 |
| In Progress | 조치 완료 | Assignee/Admin | Done | 처리결과 필수 |
| Done | 재조치 요청 | Reporter/Assignee/Admin | In Progress | 사유 필수 |
| Done | 정상 확인·Close | Reporter/Admin | Closed | 선택적 Comment |
| Done | 합의 후 Close | Assignee/Admin | Closed | 합의내용 필수 |
| Closed | Re-open | Reporter/Assignee/Admin | In Progress | 사유 필수 |
| Open/In Progress/Done | Cancel | Assignee/Admin | Cancel | 사유 필수 |

## Admin 강제 상태변경
- 모든 상태 → 허용 상태로 변경 가능
- `변경 사유` 필수
- Event Type=`ADMIN_STATUS_OVERRIDE`

---

# 15. 조치 완료 Modal

```text
조치 완료

처리 결과 *
[________________________________]
[________________________________]

Change Reference
[ Commit / Revision / Change ID ]

반영 예정 버전
[ Release 1.2.3 ]

[취소] [조치 완료]
```

Validation:
- 처리결과 필수
- Change Reference/Version 선택
- Success 후 status Done

---

# 16. 배포 완료 Modal

```text
배포 완료

배포 환경 *
[검증계 ▼]

배포 버전
[Release 1.2.3]

배포 일시 *
[자동 현재시각 / 수정 가능]

[취소] [배포 완료]
```

규칙:
- 배포정보는 상태와 별도
- Done 이전에도 기록 가능 여부: MVP에서는 `Done` 또는 `Closed`에서만 허용
- 배포 완료 후 deployment.status=`DEPLOYED`
- Timeline Event 생성

---

# 17. Close UX

## Reporter Close

```text
조치가 완료되었습니다.
재검증 후 결과를 선택해주세요.

[재조치 요청]
[정상 확인 · Close]
```

Close Type=`VERIFIED`

## Assignee Close

```text
결함을 종료하시겠습니까?

가능하면 고객/등록자가 직접 확인 후 종료하는 것을 권장합니다.
조치자가 종료하는 경우 확인/합의 내용을 남겨주세요.

확인/합의 내용 *
[________________________________]

[취소] [Close]
```

Close Type=`AGREED`

## Quality Admin Close
- 일반 Close 가능
- Reporter와 동일한 Verified Close 또는 Assignee와 동일한 Agreed Close 중 하나를 선택
- 또는 관리자 사유를 필수로 하는 Admin Close 제공 가능
- MVP 권장: Verified/Agreed 중 하나를 선택하도록 하여 통계 의미 유지

---

# 18. Comment UX

## Composer

```text
추가로 확인한 내용이나 조치에 필요한 정보를 남겨주세요.

[________________________________________]
[________________________________________]

[파일 첨부]                         [등록]
```

## 규칙
- Reporter/Assignee/Admin 작성 가능
- 작성자/소속/시간 자동 저장
- Comment는 원칙적으로 수정/삭제하지 않는다.
- 정정이 필요한 경우 새 Comment를 추가한다.
- Admin은 Comment를 "숨김" 처리할 수 있으나 원본은 Audit에 보존한다.

---

# 19. Timeline Event 표준

| Event Type | 화면 표현 |
|---|---|
| CREATED | Issue 등록 |
| UPDATED | 등록내용 수정 |
| COMMENTED | Comment |
| ASSIGNED | 조치자 변경 |
| PRIORITY_CHANGED | Priority 변경 |
| STATUS_CHANGED | 일반 상태 변경 |
| RESOLVED | 조치 완료 |
| DEPLOYED | 배포 완료 |
| REOPENED | Re-open |
| CANCELLED | Cancel |
| CLOSED | Closed |
| ADMIN_STATUS_OVERRIDE | 관리자 강제 변경 |

Event 표시:
- 시각
- 사용자명(소속)
- Event Label
- 핵심 변경값
- Comment/사유
- 필요 시 Before/After

---

# 20. SCR-040 MY

Tabs:
- 내가 등록
- 내가 조치
- 확인대기

### 내가 등록
`reporter.userId = currentUser`

### 내가 조치
`assignee.userId = currentUser` AND status != Closed/Cancel 기본

### 확인대기
`reporter.userId = currentUser` AND status = Done

각 Tab에 Count Badge 제공.

---

# 21. SCR-050 설정

Quality Admin only.

## Tab A 프로젝트
- 고객사명
- 프로젝트명

## Tab B 발생환경
- 환경 추가
- 이름 변경
- 비활성화
- 순서 변경

삭제 규칙:
- 기존 Issue가 참조 중이면 물리 삭제 금지
- inactive 처리

## Tab C Priority
- 기본 Critical/Major/Minor
- 이름/설명 Tailoring
- 기존 데이터 영향 경고

## Tab D 사용자
- 사번
- 이름
- 소속
- Active
- Quality Admin 여부

## Tab E 운영설정
- 장기 미조치 기준 일수
- 첨부 최대 크기
- 허용 확장자
- Change Reference 사용 여부
- Deployment 기능 사용 여부

---

# 22. 공통 Validation

## Text
- 앞/뒤 공백 Trim
- HTML Escape
- Script Tag / Event Handler 무효화

## File
- 확장자 Allowlist
- MIME 검증
- 파일명 서버 재생성
- Max Size 설정
- Path Traversal 방지

## Mutation
- 모든 수정 요청은 `expectedRevision` 포함
- 최신 revision과 다르면 409 Conflict
- 화면에서 최신 데이터 재조회 후 사용자에게 충돌 안내

예:
```text
다른 사용자가 이 Issue를 먼저 수정했습니다.
최신 내용을 불러온 후 다시 시도해주세요.

[최신 내용 불러오기]
```

---

# 23. Empty / Loading / Error

## Empty
```text
현재 조치할 Issue가 없습니다.
```

## Loading
Skeleton 또는 Spinner.

## Error
```text
저장에 실패했습니다.
입력한 내용은 유지됩니다.

[다시 시도]
```

---

# 24. 화면 전환 규칙

```text
로그인/사용자 시작
  → Dashboard

Dashboard KPI/Chart
  → Issue List (Filter 전달)

Issue Kanban/List
  → Issue Detail

Issue Detail
  → 수정 Modal/Action Modal
  → 완료 후 동일 Detail Refresh

Issue 등록
  → 등록 성공
  → Issue Detail 또는 계속 등록

MY
  → Issue Detail

설정
  → 저장 후 현재 Tab 유지
```

---

# 25. MVP UX Acceptance

1. 처음 보는 사용자가 설명 없이 Defect를 등록할 수 있어야 한다.
2. Defect 등록 화면에서 Assignee/Priority를 묻지 않아야 한다.
3. 조치자는 자신의 Issue와 미배정 Issue를 2 Click 이내 찾을 수 있어야 한다.
4. 모든 상태변경은 Action 버튼을 통해 수행한다.
5. Reporter와 Assignee 간 Comment 이력이 한 Timeline에 보여야 한다.
6. Assignee Close 시 합의내용 없이는 저장되지 않아야 한다.
7. Dashboard KPI/Chart는 Issue List로 Drill-down되어야 한다.
8. Admin 수정도 Timeline에서 식별 가능해야 한다.
