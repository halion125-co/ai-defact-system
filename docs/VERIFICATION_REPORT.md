# PMD 기준 기능 검증 보고서 (2026-09-24)

검증 대상: 결함관리서비스 v1.0 (커밋 기준 최신). 검증 기준: `readme/` PMD 설계문서(00~10, UI 가이드).

## 검증 방법

| 구분 | 방법 | 결과 |
|---|---|---|
| 입력검증 (API) | `backend/tests/validation.test.js` 8건 — 경계값/타입/enum/XSS/제어문자/revision/요청 크기/경로 | 8/8 통과 |
| 기능검증 (API) | `backend/tests/api.test.js`, `storage.test.js`, `unit.test.js` 34건 — E2E 시나리오 A~F, 권한 매트릭스, 동시성, 파일 손상, Dashboard 계산 | 34/34 통과 |
| 기능/UI/입력검증 (브라우저) | Edge headless + 4개 사용자 컨텍스트(Admin/Reporter/Assignee/타인) 실제 화면 조작 102개 검사 | 102/102 통과 |
| 폐쇄망 | 정적 검사 + 브라우저 요청 모니터링 | 외부 요청 0건, JS 오류 0건 |
| 반응형 | 1440 / 1280px | 가로 스크롤 없음 |

실행: `npm test` (42건), 브라우저 스크립트는 [browser-verification.js](verification/browser-verification.js) (개발 PC 전용, puppeteer-core + Edge), 결과 [browser-results.txt](verification/browser-results.txt), 증적 [screenshots/](verification/screenshots/).

## PMD 기능별 검증 결과

### 1. 사용자 식별 (01 §4~5, 07 §3)
| 기능 | 결과 | 증적 |
|---|---|---|
| 신규 사용자 등록: 사번·이름·소속 필수, 인라인 오류 3개 표시 | ✅ | 01-register-validation.png |
| 사번 중복(대소문자/공백 무시) → 서버 오류를 필드에 표시 | ✅ | validation.test, 브라우저 |
| 이 사용자로 시작 / 사용자 변경 / 마지막 사용자 기억(브라우저에는 사번만) | ✅ | 03 (login-remembered) |
| Quality Admin bootstrap(사번 `admin` 자동 승격), UI self-elevation 불가 | ✅ | api.test 세션/CSRF |
| 세션 없음 401, CSRF 헤더 없음 403, 세션 종료 | ✅ | api.test |

### 2. Issue 등록 (01 §7~10, UI §13~16)
| 기능 | 결과 | 증적 |
|---|---|---|
| 유형 선택 3종 카드 → 각 등록 화면 | ✅ | 07-new |
| Defect 1-Page Form: 5개 항목 + Sample, Assignee/Priority 입력 없음 | ✅ | 04-defect-validation.png |
| 빈 제출 시 5개 필드 인라인 오류 + 첫 오류 필드 포커스, 5자 미만 오류 | ✅ | 04 |
| 재현절차 단계 추가/삭제/순서 재정렬, 빈 단계 자동 제거, 1단계 이상 필수 | ✅ | 브라우저, validation.test |
| 첨부: 허용(png) 저장 + 거부(exe) 안내, Issue는 등록됨 | ✅ | 05-create-success.png |
| ID 자동 생성(DEF/IMP/INQ-####), Reporter/CreatedAt/OPEN/UNASSIGNED/CREATED Event | ✅ | api.test Scenario A |
| 등록 성공 화면: 상세 보기 / 계속 등록 / 목록으로 | ✅ | 05 |
| Improvement(target/request/reason), Inquiry(target/question) 등록 및 필수 검증 | ✅ | 25-improvement-detail.png |
| 서버 검증: 길이(200/2000/500), 타입(문자열만), 환경 활성 여부, 제어문자 제거, XSS 원문 보존+textContent 렌더 | ✅ | validation.test |

### 3. Issue Detail / 권한별 Action (01 §13~17, 06)
| 기능 | 결과 | 증적 |
|---|---|---|
| Summary(ID/Type/Title/Status/Priority/Reporter/Assignee/Env/Created) + ID 복사 | ✅ | 10, 13 |
| Reporter(OPEN 미배정): [내가 조치], [등록내용 수정]만 | ✅ | 브라우저 |
| 타인(비관계자): [내가 조치]만, Comment 작성 불가 안내, 수정 버튼 없음 | ✅ | 06-detail-other-view |
| Admin(OPEN): 내가 조치/조치 시작/Cancel + 강제 변경 + 조치자 지정 | ✅ | 07-assign-modal.png |
| Assignee(OPEN): 조치 시작 / Cancel, 인계 모달 | ✅ | 브라우저 |
| Assignee(IN_PROGRESS): 조치 완료(처리결과 필수, Change Ref/버전 선택) | ✅ | 08-resolve-modal.png |
| Assignee(DONE): 배포 완료 / 재조치 요청 / Close(합의내용 필수) / Cancel | ✅ | 09-agreed-close-validation.png |
| Reporter(DONE): 안내문 + 재조치 요청(사유 필수) / 정상 확인·Close | ✅ | 12 |
| Reporter(CLOSED): Re-open만 | ✅ | 13-detail-closed.png |
| Cancel 후 Action 없음 + 사유 표시, Kanban 기본 제외, status=CANCEL로 조회 | ✅ | 브라우저 |
| 배포 완료: Done 이후만, 버전 기본값=반영 예정 버전, 배포완료 배지, DEPLOYED Event | ✅ | 10-detail-done-deployed.png |
| Traceability 패널: 조치 결과/Change Reference/버전/최초·최근 조치완료/배포/Close 유형 | ✅ | 10, 13 |

### 4. Workflow / History (00 §3~4, 06 §4~9)
| 기능 | 결과 | 증적 |
|---|---|---|
| OPEN→IN_PROGRESS→DONE→CLOSED, DONE/CLOSED→IN_PROGRESS, →CANCEL; 그 외 409 INVALID_STATE_TRANSITION | ✅ | validation.test Action |
| Claim은 배정만(상태 유지) → 조치 시작 별도 | ✅ | api.test A |
| Re-open: reopenCount 증가, firstResolvedAt/firstClosedAt 유지, resolvedAt 갱신, 배포 미배포로 복귀 | ✅ | unit.test |
| Close VERIFIED(Reporter/Admin) / AGREED(Assignee/Admin, comment 필수) | ✅ | api.test B |
| Admin 강제 변경: 사유 필수, ADMIN_STATUS_OVERRIDE, Timeline에 Quality Admin 배지 | ✅ | 15-admin-override.png |
| Timeline: System Event + Comment 시간순 통합, Before/After 변경내용 보기 | ✅ | 14-admin-edit-diff.png |
| Comment immutable, Admin 숨김(사유 필수) — Admin은 원문+사유, 타인은 숨김 안내만 | ✅ | 15, api.test |
| 모든 Mutation Audit JSONL 기록(8 Mutation = 8줄) | ✅ | api.test A |

### 5. 동시성 / 데이터 무결성 (04 §5~6, 08 §7~8)
| 기능 | 결과 | 증적 |
|---|---|---|
| 동시 Comment 2건 → 하나 201, 하나 409(currentRevision), 데이터 유실 없음 | ✅ | api.test E |
| UI 409: 안내 박스 + 입력값 유지 + [최신 내용 불러오기] → 상대 변경 반영 | ✅ | 12-conflict-409.png |
| 20건 동시 생성 ID 중복 0건, sequence.json 유실 시 자동 보정 | ✅ | api.test E, storage.test |
| Atomic write 실패(I/O) 시 원본 유지, temp 정리, STORAGE_WRITE_FAILED | ✅ | storage.test |
| 손상 Issue 격리/쓰기 차단, 핵심 파일 손상 시 시작 중단 | ✅ | storage.test |
| 서버 재시작 후 데이터/ID 연속성 | ✅ | storage.test |

### 6. Kanban / List / MY / 검색 (01 §11~12, §20, UI §27~29, §44)
| 기능 | 결과 | 증적 |
|---|---|---|
| Kanban 4열, 카드 정보 8종, 미지정 카드 [내가 조치] → 토스트+갱신, Drag&Drop 없음 | ✅ | 16-kanban-claimed.png |
| Quick Filter(전체/신규·미지정/내가 등록/내가 조치/확인대기/Critical) + 상세 필터 | ✅ | 브라우저 |
| List: 검색/유형/상태/환경/Priority/담당자/등록일 필터, 컬럼 정렬, 페이지네이션, size 변경, Empty State | ✅ | 18-list-empty.png |
| 헤더 Quick Search 팝업 + Enter 전체 검색(q) | ✅ | 17-quick-search.png |
| MY 3탭 + Count Badge, 확인대기 [재검증하기] | ✅ | 11-my-waiting.png |

### 7. Dashboard (01 §6, 02 §26~27, UI §30~37)
| 기능 | 결과 | 증적 |
|---|---|---|
| Global Filter(유형 기본 결함/기간/환경/Priority) 전 지표 공통 적용 | ✅ | 00-dashboard.png |
| KPI Row1(전체/Open/In Progress/Done/Closed) + Row2(Critical/미지정/장기/Re-open/배포대기/재검증대기) | ✅ | 00 |
| **KPI 11개 클릭 → 목록 건수 완전 일치** | ✅ | 브라우저 Drill-down 검사 |
| 일자별 Bar(신규/조치/Closed) 막대 클릭 Drill-down | ✅ | 00 |
| Burn Up(누적 등록/누적 조치/Closed 토글) + Summary(누적 등록/조치/Gap/현재 미조치 툴팁) | ✅ | 00 |
| 상태 Donut/Priority/환경 분포 클릭 Drill-down | ✅ | 브라우저 |
| 관리 필요 6행 + 샘플 + 클릭 Drill-down 칩 표시 | ✅ | 19-drilldown-list.png |
| 계산 정의: created=createdAt, resolved=firstResolvedAt unique, Re-open 후 누적 조치 유지·현재 미조치 증가, 단조 증가 | ✅ | unit.test dashboard |

### 8. 설정 (01 §21, UI §38)
| 기능 | 결과 | 증적 |
|---|---|---|
| 일반 사용자: 메뉴 숨김 + 직접 URL 접근 시 권한 없음 화면 | ✅ | 02-settings-forbidden.png |
| 프로젝트명 저장 → 헤더 즉시 반영 | ✅ | 브라우저 |
| 환경 추가/이름/순서/비활성/삭제(참조 시 비활성 처리), 최소 1개 활성, 등록 화면 Select 즉시 반영(타 사용자 포함) | ✅ | 20-settings-env.png |
| Priority displayName/설명/활성 Tailoring, 코드 유지 경고 | ✅ | 22 |
| 사용자: 수정/Admin 지정·해제/비활성화, 본인 해제 불가(disabled), 마지막 Admin 보호 | ✅ | 21-settings-users.png |
| 운영설정: 범위 검증(1~365 등) 오류 토스트, 위험 확장자 자동 제거, 저장 | ✅ | 23-settings-operation.png |
| 백업·상태: 수동 백업 실행/목록, 손상 파일/Sequence/Uptime, 최근 Audit | ✅ | 24-settings-backup.png |

### 9. 보안 / 폐쇄망 (07)
| 항목 | 결과 |
|---|---|
| 외부 URL/CDN/폰트/npm 0건 (정적 검사 + 브라우저 요청 모니터) | ✅ |
| CSP script-src 'self', nosniff, frame SAMEORIGIN, Referrer same-origin | ✅ |
| 첨부: 확장자 allowlist, MIME/magic bytes, double extension, path traversal, 413, 다운로드 nosniff | ✅ |
| 본문 1MB 초과 413(응답 후 연결 종료), 잘못된 JSON 400, 경로 traversal 404, 미지원 Method 405 | ✅ |
| 모든 Mutation 서버측 권한 재검증(403 케이스 9종) | ✅ |

## 검증 중 발견·수정한 결함

| # | 결함 | 수정 |
|---|---|---|
| F-01 | 혼합 첨부(허용+거부) 업로드 시 전체 거부되어 유효 파일 유실 | 파일별 검증 → 유효 파일 저장 + `rejected[]` 응답, UI 토스트 안내 |
| F-02 | 요청 본문 초과 시 413 응답 전 소켓 종료(클라이언트는 네트워크 오류만 수신) | 413 응답 후 `Connection: close`로 종료 |
| F-03 | 텍스트 필드에 숫자/객체 전달 시 문자열로 변환되어 통과 | 문자열 외 타입 400 |
| F-04 | 관리자가 환경/Priority 설정을 바꿔도 다른 사용자 브라우저의 등록/수정 화면에 반영 안 됨 | 등록/상세 화면 진입 시 설정 재조회 |
| F-05 | Sequence 파일 저장 실패가 500 INTERNAL로 노출 | STORAGE_WRITE_FAILED 표준화 + fs 오류 코드 매핑 |
| F-06 | Timeline에서 동일 초 이벤트 순서 불안정 | history 배열 순서를 tie-break로 사용 |
| F-07 | 1280px에서 상태 Donut 과대 확대, 목록 환경 컬럼 세로 줄바꿈 | CSS 고정 크기/nowrap |

## 미검증 / 제약

- 폐쇄망 실제 서버(고객사 Runtime)에서의 설치 검증은 배포 시 `docs/DEPLOYMENT_GUIDE.md` Checklist로 수행
- 성능 목표(08 §15: 5,000건/3초)는 별도 부하 데이터 미생성. 현재 구조(메모리 캐시 + 파일별 저장)에서 14건 기준 Dashboard 5개 API 합계 < 20ms
- 브라우저 자동화는 Edge headless 기준. IE 미지원(ES Module)
