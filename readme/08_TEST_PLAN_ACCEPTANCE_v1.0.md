# 08. Test Plan & Acceptance v1.0

## 1. 목적
서비스의 기능, 권한, 데이터 무결성, Dashboard 계산, 폐쇄망 운영 적합성을 검증한다.

## 2. Test Level
- Unit
- API Integration
- File/Concurrency
- Frontend Component
- E2E
- Security
- Offline Deployment
- UAT

## 3. 핵심 E2E Scenario A - Reporter 정상 Close
1. Reporter 사용자 시작
2. Defect 등록
3. ID 자동생성 확인
4. 미배정/Open 확인
5. Assignee가 Claim
6. Priority 지정
7. 조치 시작
8. Comment 입력
9. 조치 완료 + 처리결과
10. Deployment 입력
11. Reporter가 재검증
12. 정상 확인 Close
13. Timeline 전체 Event 확인

Expected:
- closeType VERIFIED
- 모든 Actor/시간 기록

## 4. Scenario B - Assignee 합의 Close
1. Done Issue 준비
2. Assignee Close 선택
3. 합의내용 미입력 → Validation Fail
4. 합의내용 입력
5. Close 성공

Expected:
- closeType AGREED
- comment 저장

## 5. Scenario C - Re-open
1. Closed Issue
2. Reporter Re-open
3. 사유 입력
4. In Progress
5. 재조치 완료
6. 다시 Close

검증:
- firstResolvedAt 유지
- firstClosedAt 유지
- latest resolved/closed timestamp 갱신
- Re-open Event 존재

## 6. Scenario D - Admin Override
1. Quality Admin 로그인
2. 상태 강제 변경
3. 사유 없이 저장 → 실패
4. 사유 입력 → 성공

Expected:
- ADMIN_STATUS_OVERRIDE Event

## 7. Scenario E - Concurrent Update
1. 사용자 A/B 동일 revision Issue 조회
2. A가 Comment/수정 저장
3. B가 이전 revision으로 저장

Expected:
- B는 409 Conflict
- A 데이터 유지
- B 입력값 UI 유지

## 8. Scenario F - Atomic Write Failure
강제 I/O Failure 테스트.

Expected:
- 원본 Issue JSON 유효
- temp 파일 정리 또는 복구 가능
- 사용자에게 STORAGE_WRITE_FAILED

## 9. Dashboard Test
### Daily Created
createdAt 날짜와 Bar Count 일치.

### Daily Resolved
firstResolvedAt 기준 Unique Defect Count.

### Burn Up
- created cumulative 단조 증가
- resolved cumulative 단조 증가
- Closed cumulative 단조 증가

### Current Unresolved
OPEN + IN_PROGRESS 현재 건수와 KPI 일치.

### Re-open
Re-open되어도 누적 resolved는 감소하지 않음.
현재 미조치 KPI는 증가할 수 있음.

## 10. Permission Test
- Reporter가 타인의 등록내용 수정 → 403
- 일반 사용자가 Priority 변경 → 403
- Assignee가 Priority 변경 → 200
- Reporter가 상태 조치완료 → 403
- Reporter가 Verified Close → 200
- Assignee가 Agreed Close without comment → 400
- Admin 전체 수정 → 200 + Audit

## 11. Attachment Test
- 허용 png → 성공
- 금지 exe → 실패
- 허용 확장자지만 MIME 불일치 → 실패
- oversized → 413
- `../../x` filename → safe stored name

## 12. Search/Filter
- ID exact
- keyword
- status
- priority
- environment
- assignee
- date
- combined filters

## 13. UI/UX Acceptance
- Defect 등록에 Assignee/Priority 필드가 없음
- 모든 필드 Sample 표시
- 재현 절차 최소 1단계
- Save 실패 시 입력 유지
- 상태변경은 Action Button
- Dashboard KPI 클릭 시 올바른 List Filter

## 14. Offline Acceptance
- 인터넷 차단 상태에서 모든 화면 동작
- 외부 CDN Request 0
- 외부 Font/Icon Request 0

## 15. Performance Target
소규모 프로젝트 기준:
- 일반 조회 2초 이내
- 등록/Comment 2초 이내
- Dashboard 3초 이내

테스트 데이터 예:
- Defect 5,000건
- Comment 20,000건
- 첨부 메타 10,000건

## 16. Release Gate
- P0 기능 Test Pass 100%
- Critical/High Security Defect 0
- Data loss defect 0
- State/Permission defect 0
- Burn Up 계산 검증 완료
- Backup/Restore 확인 완료
