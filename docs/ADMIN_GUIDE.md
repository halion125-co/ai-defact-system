# Quality Admin 가이드

Quality Admin은 서비스 전체 Super User이며, 모든 변경이 Timeline/Audit에 "Quality Admin" 표시와 함께 기록된다.

## 1. 최초 관리자 (Bootstrap)
- `config/server.config.json` → `bootstrapAdminEmployeeIds: ["admin"]` (또는 `DMS_BOOTSTRAP_ADMIN=사번`)
- 해당 사번으로 등록/시작하면 자동 승격. UI에서 일반 사용자가 스스로 Admin이 될 수 없다.
- 추가 Admin: 설정 > 사용자 > **Admin 지정**

## 2. 설정 메뉴 (사이드바 하단, Admin만 표시)
| 탭 | 내용 |
|---|---|
| 프로젝트 | 고객사명, 프로젝트명 (헤더/로그인 화면 표시) |
| 발생환경 | 추가 / 이름 변경 / 순서 / 비활성화 / 삭제. 기존 Issue가 참조하면 삭제 대신 비활성 처리. 최소 1개 활성 필수 |
| Priority | Critical/Major/Minor의 표시 이름·설명·활성. 코드와 기존 데이터는 유지 |
| 사용자 | 이름/소속 수정, Admin 지정/해제, 비활성화(삭제 대신). 본인은 해제/비활성화 불가 |
| 운영설정 | 장기 미조치 기준 일수, 첨부 최대 크기/허용 확장자, Change Reference/Deployment 사용 여부, 백업 사용/보관일 |
| 백업·상태 | 수동 백업, 백업 목록, 손상 파일/Sequence/Uptime, 최근 Audit 100건 |

## 3. Issue 관리 권한
- 모든 Issue의 등록내용 수정 (UPDATED, Before/After 기록, byAdmin 표시)
- 미배정 Issue를 타인에게 최초 배정 / 언제든 조치자 변경
- Priority 변경
- 모든 Workflow Action (조치 시작/완료, 재조치, Close(VERIFIED 또는 AGREED), Cancel, 배포)
- **상태 강제 변경**: 상세 상단 "관리자: 상태 강제 변경" → 대상 상태 + 사유(필수) → `ADMIN_STATUS_OVERRIDE` 이벤트로 별도 표시
- Comment **숨김**: 사유 필수. 화면에서만 숨겨지고 원문은 파일/Audit에 보존. Admin에게는 원문이 계속 보임
- 첨부 삭제(논리 삭제)

## 4. Dashboard 읽는 법
- **전체/Open/In Progress/Done/Closed**: 필터(유형·기간·환경·Priority) 집합의 현재 상태. Cancel은 별도 표기
- **Critical 미조치**: Critical이면서 Open/In Progress
- **담당자 미지정**: Open + 조치자 없음
- **장기 미조치**: Open/In Progress이고 운영설정 일수 이상 업데이트 없음
- **Re-open**: 재조치 요청 이력이 있고 아직 종료되지 않음
- **배포대기**: Done + 미배포 / **재검증대기**: Done + 배포완료 (Deployment 기능 미사용 시 Done 전체)
- **Burn Up**: 누적 등록(createdAt) vs 누적 조치(최초 Done 도달, Re-open으로 줄지 않음). "현재 미조치"는 현재 상태 기준이라 Gap과 다를 수 있음(툴팁 설명)
- 모든 KPI/차트/관리 필요 행은 클릭 시 동일 조건의 Issue 목록으로 이동하며 건수가 일치한다

## 5. 정기 점검
- 주 1회: 설정 > 백업·상태에서 마지막 백업 성공 시각, 손상 파일 0건 확인
- 월 1회: 백업 반출, 로그 정리, 비활성 사용자 정리
