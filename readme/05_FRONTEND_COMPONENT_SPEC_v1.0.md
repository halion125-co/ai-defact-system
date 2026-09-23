# 05. Frontend Component Spec v1.0

## 1. 목표
업무 효율성과 일관성을 우선하는 Enterprise UI를 Component 기반으로 구현한다.

## 2. Application Shell
공통:
- `AppLayout`
- `Sidebar`
- `Header`
- `PageContainer`

Sidebar:
- Dashboard
- Issue 관리 > Kanban / 목록
- MY
- + Issue 등록
- 설정(Admin)

## 3. 공통 Component
```text
common/
  Button
  Card
  Badge
  Input
  Textarea
  Select
  Modal
  Tabs
  FileUpload
  UserDisplay
  EmptyState
  Loading
  ErrorState
```

규칙:
- inline style 남용 금지
- 상태/우선순위 색상 token화
- button variant 통일
- 모든 입력은 label/error/helper 구조 통일

## 4. Issue Component
```text
issue/
  IssueTypeSelector
  DefectForm
  ImprovementForm
  InquiryForm
  IssueSummary
  IssueDetail
  IssueActionBar
  IssueCommentComposer
  IssueTimeline
  AssigneeSelector
  PrioritySelector
  ResolutionPanel
  DeploymentPanel
  TraceabilityPanel
```

## 5. Defect Form
한 화면 구성.

필수:
- location
- environment
- symptom
- reproductionSteps
- expectedResult

선택:
- attachments

Reporter에게 Assignee/Priority 입력을 요구하지 않는다.

재현절차 Component:
- 1개 이상 필수
- [+ 단계 추가]
- 단계 삭제 가능
- 순서 자동 재정렬

## 6. Issue Detail
권장 Section 순서:
1. Summary
2. 등록 내용
3. 조치/Traceability
4. Action Bar
5. Timeline
6. Comment Composer

Action Bar는 현재 사용자 권한과 상태에 따라 버튼을 동적으로 표시한다.

예:
- Open + Assignee → `조치 시작`
- In Progress + Assignee → `조치 완료`
- Done + Reporter → `재조치 요청`, `정상 확인 · Close`
- Done + Assignee → `Close`(합의내용 필수)

## 7. Kanban
Column:
- Open
- In Progress
- Done
- Closed

Drag & Drop 상태변경 금지.
Card 클릭 → Detail.

Card 필드:
- ID
- Type
- 제목/현상 요약
- Priority
- Environment
- Reporter
- Assignee
- Date

## 8. List
Table Column:
- ID
- 유형
- 제목/현상
- 환경
- Priority
- Status
- Reporter
- Assignee
- 등록일
- 업데이트

필터 상태는 URL Query와 동기화 권장.
Dashboard Drill-down에서 동일 List 화면을 재사용한다.

## 9. MY
Tabs:
- 내가 등록
- 내가 조치
- 확인대기

각 Tab Count Badge 제공.

## 10. Dashboard
Component:
```text
dashboard/
  DashboardFilter
  KPICard
  DailyActivityChart
  BurnUpChart
  StatusChart
  PriorityChart
  EnvironmentChart
  AttentionList
```

Dashboard Filter:
- Type
- 기간
- 환경
- Priority

기본 Type = Defect.

## 11. Burn Up
표시:
- 등록 누적
- 조치 누적
- 선택: Closed 누적

Summary:
- 누적 등록
- 누적 조치
- 현재 미조치

Tooltip에 날짜별 누적값 표시.

## 12. Timeline
Event와 Comment를 하나의 리스트로 표현.

Visual:
- System: Neutral/Blue
- Comment: Speech Bubble
- Deployment: Cyan
- Closed: Green
- Re-open/Cancel: Warning/Danger

각 Row:
- 시각
- 사용자명(소속)
- Action
- Before/After 또는 Comment

## 13. UI State
모든 Data Screen은 다음 상태를 가져야 한다.
- loading
- success
- empty
- error
- permission denied
- conflict(409)

409 UX:
```text
다른 사용자가 이 Issue를 먼저 수정했습니다.
최신 내용을 불러온 후 다시 시도해주세요.
[최신 내용 불러오기]
```

## 14. Form Save
저장 중:
- primary button disabled
- spinner
- duplicate submit 차단

저장 실패:
- 입력값 유지
- error inline/toast

## 15. 폐쇄망 UI 제약
- 외부 Web Font 호출 금지
- 외부 icon CDN 금지
- chart library는 local bundle
- 이미지/로고 local asset

## 16. Frontend Acceptance
- 1280px에서 주요 화면 사용 가능
- Tab/Keyboard Focus 노출
- Color만으로 Status 구분하지 않음
- Dashboard 모든 주요 지표가 Drill-down 가능
- 상태변경 UI가 raw dropdown이 아니라 업무 Action 중심
