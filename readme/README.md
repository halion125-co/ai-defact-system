# 결함관리서비스 v1.0 - 개발 문서 Index

## 1. 목적
이 폴더는 금융권 폐쇄망용 경량 결함관리서비스 v1.0의 개발 기준 문서를 모아두는 Source of Truth이다.

서비스 핵심 원칙:
- 등록은 최대한 단순하게
- 조치 책임은 명확하게
- 모든 주요 변경은 Timeline으로 추적
- Quality Admin은 전체 수정 가능하되 이력은 남김
- 외부 인터넷/CDN/API/GitHub/Jira 의존 없음
- 별도 DBMS 없이 경량 Backend + JSON/File 저장
- CI/CD는 직접 연동하지 않고 Change/Deployment Traceability만 제공

## 2. 문서 목록
| 순서 | 문서 | 목적 |
|---|---|---|
| 00 | `00_IMPLEMENTATION_BLUEPRINT_v1.0.md` | 전체 구현 결정/원칙 |
| 01 | `01_SCREEN_IA_SPEC_v1.0.md` | IA, 화면정의, 화면 전환 |
| 02 | `02_API_JSON_SPEC_v1.0.md` | API, JSON, 저장구조, Audit |
| 03 | `03_DEV_TASK_BREAKDOWN_v1.0.md` | 개발 Epic/Task/Release Gate |
| 04 | `04_BACKEND_ARCHITECTURE_v1.0.md` | Backend 계층, 동시성, 파일 저장 |
| 05 | `05_FRONTEND_COMPONENT_SPEC_v1.0.md` | Frontend Component/State/UI 규칙 |
| 06 | `06_WORKFLOW_PERMISSION_MATRIX_v1.0.md` | Role/권한/상태전이 기준 |
| 07 | `07_SECURITY_OFFLINE_DEPLOYMENT_v1.0.md` | 폐쇄망 보안/배포/운영 기준 |
| 08 | `08_TEST_PLAN_ACCEPTANCE_v1.0.md` | 기능/통합/E2E/인수 테스트 |
| 09 | `09_DATA_DICTIONARY_v1.0.md` | 핵심 데이터 필드 정의 |
| 10 | `10_CLAUDE_CODE_DEV_PROMPT_v1.0.md` | 개발 AI 전달용 구현 지시문 |
| UI | `UI_DESIGN_GUIDE_v2.0.md` | UI/UX 디자인 시스템 및 화면 규칙 |

## 3. 구현 우선순위
1. 저장구조/Lock/Revision/Audit
2. 사용자/프로젝트/환경 설정
3. Defect/Improvement/Inquiry 등록
4. Issue Detail
5. Assignee/Priority/Workflow
6. Comment/Timeline
7. Kanban/List/MY
8. Dashboard/Burn Up
9. Change Reference/Deployment
10. Backup/Security/E2E

## 4. 개발 완료의 핵심 기준
- Reporter가 설명 없이 1분 이내 Defect 등록 가능
- Assignee가 미배정/내 담당 Issue를 즉시 식별 가능
- 모든 상태변경이 Action Button 기반으로 수행
- Comment/System Event가 하나의 Timeline으로 남음
- Assignee Close 시 고객/업무담당자 합의내용 필수
- Dashboard의 KPI/Chart가 실제 Issue 목록으로 Drill-down
- Burn Up에서 누적등록/누적조치/현재 미조치 상태를 일관된 기준으로 표시
- 외부 인터넷 호출 0건
- 동시 수정 시 데이터 유실이 없어야 함
