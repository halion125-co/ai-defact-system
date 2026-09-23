# 10. Claude Code / 개발 AI 구현 지시문 v1.0

아래 문서들을 Source of Truth로 사용하여 금융권 폐쇄망용 경량 결함관리서비스 v1.0을 구현해줘.

## 반드시 읽을 문서
1. README.md
2. 00_IMPLEMENTATION_BLUEPRINT_v1.0.md
3. 01_SCREEN_IA_SPEC_v1.0.md
4. 02_API_JSON_SPEC_v1.0.md
5. 03_DEV_TASK_BREAKDOWN_v1.0.md
6. 04_BACKEND_ARCHITECTURE_v1.0.md
7. 05_FRONTEND_COMPONENT_SPEC_v1.0.md
8. 06_WORKFLOW_PERMISSION_MATRIX_v1.0.md
9. 07_SECURITY_OFFLINE_DEPLOYMENT_v1.0.md
10. 08_TEST_PLAN_ACCEPTANCE_v1.0.md
11. 09_DATA_DICTIONARY_v1.0.md
12. UI_DESIGN_GUIDE_v2.0.md

## 개발 원칙
- 인터넷 연결 없이 실행되어야 한다.
- 외부 CDN/API/GitHub/Jira를 사용하지 않는다.
- 별도 DBMS를 사용하지 않는다.
- 경량 Backend + JSON/File 저장을 사용한다.
- Issue는 file-per-issue JSON 구조를 우선한다.
- 모든 Mutation은 revision 기반 optimistic concurrency를 적용한다.
- 저장은 atomic write로 구현한다.
- 모든 주요 변경은 History와 Audit에 남긴다.

## 사용자
- 비밀번호 없는 사번 기반 사용자 식별
- Reporter / Assignee / Quality Admin
- Quality Admin은 Super User
- PL은 별도 Role이 아니다.

## Issue Type
- DEFECT
- IMPROVEMENT
- INQUIRY

## Defect 등록
Reporter에게 다음만 입력시킨다.
- 발생 위치
- 발생 환경
- 발생 현상
- 재현 절차
- 기대 결과
- 선택적 첨부

Assignee/Priority는 등록 시 묻지 않는다.
각 입력에는 Sample을 표시한다.

## Workflow
```text
OPEN → IN_PROGRESS → DONE → CLOSED
DONE/CLOSED → IN_PROGRESS
OPEN/IN_PROGRESS/DONE → CANCEL
```

Raw Status Dropdown으로 상태를 바꾸지 않는다.
Action Endpoint와 Action Button을 사용한다.

## 권한
- 미배정 Open Issue는 모든 사용자가 Claim 가능
- 타인 최초 배정은 Quality Admin
- 현재 Assignee는 다른 사용자에게 인계 가능
- Priority는 Assignee/Admin
- Reporter는 본인 등록내용 수정 및 Verified Close 가능
- Assignee Close는 고객/업무담당자 합의내용 필수
- Admin 강제 상태 변경은 사유 필수

## Comment / Timeline
- Comment와 System Event를 하나의 Timeline으로 렌더링
- Comment는 원칙적으로 immutable
- 변경 전/후 이력 보존

## CI/CD Traceability
자동연동하지 않는다.
다음 필드는 구현한다.
- Issue ID copy
- Change Reference
- Target Version
- Deployment Environment
- Deployment Version
- Deployment Date

## Dashboard
필수:
- 전체/Open/In Progress/Done/Closed
- Critical
- 미배정
- 장기 미조치
- Re-open
- 배포대기
- 재검증대기
- 일자별 신규/조치 Bar Chart
- 누적등록/누적조치 Burn Up
- 상태/Priority/환경 분포
- 관리 필요 목록
- Drill-down

Burn Up:
- 등록 누적 = createdAt unique cumulative
- 조치 누적 = firstResolvedAt unique cumulative
- Re-open은 별도 KPI
- 현재 미조치는 current status OPEN/IN_PROGRESS 별도 표시

## UI
- Dark Navy Sidebar + Dark Header + White Workspace
- KT Logo Sidebar 왼쪽 하단 32~40px
- Enterprise 가독성 우선
- 실제 기능 없는 AI 추천/분석 UI 구현 금지
- Kanban Drag & Drop 상태변경 금지

## 구현 순서
1. Foundation/Storage/Lock/Revision/Audit
2. User/Config
3. Issue Create/Detail
4. Workflow/Comment/Timeline
5. Kanban/List/MY
6. Dashboard
7. Traceability/Deployment
8. Backup/Security/Test

## 완료 조건
`08_TEST_PLAN_ACCEPTANCE_v1.0.md`의 P0 테스트와 Release Gate를 충족해야 한다.

개발 중 문서와 구현이 충돌하면 임의 판단하지 말고 해당 차이를 TODO/DECISION 항목으로 명시해라.
