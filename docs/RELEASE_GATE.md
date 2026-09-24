# MVP Release Gate 검증 결과 (2026-09-24)

`readme/03_DEV_TASK_BREAKDOWN_v1.0.md` §21 및 `readme/08_TEST_PLAN_ACCEPTANCE_v1.0.md` 기준. 자동 테스트는 `npm test`(53건), 브라우저 검증은 Edge headless 시나리오(개발 PC)로 수행했다.

## 기능

| 항목 | 상태 | 근거 |
|---|---|---|
| 사용자 등록/식별 | ✅ | api.test "세션/CSRF/설정 권한", 브라우저 로그인 화면 |
| Project/Environment 설정 | ✅ | api.test "Config: 환경 참조 시 삭제 대신 inactive" |
| Defect/Improvement/Inquiry 등록 | ✅ | api.test Scenario A, Search 테스트, 브라우저 등록 흐름 |
| Issue Detail | ✅ | 브라우저 05/12 스크린샷, permission hints |
| Reporter 수정 (Before/After) | ✅ | api.test Permission matrix (UPDATED before/after) |
| Assignee/Priority | ✅ | Permission matrix, Scenario A |
| Workflow (Action Endpoint, Raw status 없음) | ✅ | Scenario A/B/D, INVALID_STATE_TRANSITION |
| Comment / Timeline 통합 | ✅ | Scenario A history 순서, 브라우저 Timeline |
| Kanban/List/MY | ✅ | 브라우저 03/04/06, Drag&Drop 없음 |
| Quality Admin (설정/Override/숨김) | ✅ | Scenario D, Comment hide 테스트, 설정 화면 |
| Dashboard / Daily / Burn Up / Drill-down | ✅ | unit.test "dashboard 계산", 브라우저 02/16, drilldown count 일치 검증 |

## 데이터

| 항목 | 상태 | 근거 |
|---|---|---|
| Atomic Write | ✅ | unit.test atomic write, storage.test I/O 실패 시 원본 유지 |
| Issue Lock | ✅ | unit.test mutex, Scenario E |
| revision conflict (409) | ✅ | Scenario E (동시 Comment 중 하나 409, 데이터 유실 없음) |
| ID duplicate 방지 | ✅ | Scenario E 20건 동시 생성, storage.test sequence 보정 |
| Audit Log | ✅ | Scenario A (Mutation 8건 = Audit 8줄), storage.test |

## 보안

| 항목 | 상태 | 근거 |
|---|---|---|
| XSS | ✅ | Frontend 모든 사용자 콘텐츠 textContent 삽입, CSP `script-src 'self'` |
| Authorization 서버 재검증 | ✅ | Permission matrix (403 케이스 7종) |
| File Security | ✅ | Attachment 테스트: exe 거부, MIME/magic 불일치 거부, traversal 무력화, 413 |
| CSRF | ✅ | Custom Header 누락 시 403, SameSite=Strict, HttpOnly |
| External Request 0 | ✅ | `scripts/check-offline.js` 통과, 브라우저 요청 모니터링 외부 도메인 0건 |

## 운영

| 항목 | 상태 | 근거 |
|---|---|---|
| Server restart 후 data 유지 | ✅ | storage.test |
| JSON corruption 대응 | ✅ | storage.test (Issue 격리/쓰기 차단, 핵심 파일 손상 시 시작 중단) |
| Backup/Restore 절차 | ✅ | storage.test Backup, `scripts/restore.js`, OPERATIONS_GUIDE |

## README §4 핵심 기준

| 기준 | 상태 |
|---|---|
| Reporter가 설명 없이 1분 이내 Defect 등록 | ✅ 5개 항목 + Sample, 브라우저 자동 등록 성공 |
| Assignee가 미배정/내 담당 Issue 즉시 식별 | ✅ Kanban Quick Filter, MY 탭 Count |
| 모든 상태변경이 Action Button 기반 | ✅ |
| Comment/System Event 단일 Timeline | ✅ |
| Assignee Close 시 합의내용 필수 | ✅ Scenario B |
| Dashboard KPI/Chart Drill-down | ✅ |
| Burn Up 누적등록/누적조치/현재 미조치 일관 기준 | ✅ unit.test (Re-open 후 누적 조치 유지, 현재 미조치 증가) |
| 외부 인터넷 호출 0건 | ✅ |
| 동시 수정 시 데이터 유실 없음 | ✅ |

## 수동 UAT 시나리오 (폐쇄망 내 확인용)

1. `admin` 등록 → 설정 메뉴 노출 확인
2. 일반 사용자 A 등록 → 결함 등록 → ID 확인, 미배정/Open
3. 사용자 B → Kanban [내가 조치] → Priority 지정 → 상세 [조치 시작] → Comment → [조치 완료] → [배포 완료]
4. A → MY 확인대기 → [정상 확인 · Close] → Timeline 전체 이벤트 확인
5. A → [Re-open] 사유 입력 → B 재조치 → B [Close] 합의내용 없이 → 실패 → 입력 후 성공
6. admin → 상태 강제 변경 사유 없이 → 실패 → 사유 입력 → Timeline에 관리자 표시
7. 두 브라우저에서 같은 Issue를 열고 순차 저장 → 두 번째는 충돌 안내 → 최신 불러오기
8. Dashboard 각 KPI 클릭 → 목록 건수 일치 확인
9. 브라우저 Network 탭 외부 도메인 0건
10. 서비스 재시작 → 데이터/Issue ID 연속성 확인
