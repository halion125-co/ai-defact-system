# 06. Workflow & Permission Matrix v1.0

## 1. 역할 정의
### Reporter
Issue를 등록한 사람.

### Assignee
해당 Issue의 처리 책임자. 개발자, 개발 PL, 업무 담당자 등 가능.

### Quality Admin
품질담당자/Test Manager. PL Role은 아니며 서비스 전체 Super User.

---

# 2. 기능 권한
| 기능 | Reporter | Assignee | Quality Admin |
|---|:---:|:---:|:---:|
| Issue 등록 | O | O | O |
| 본인 등록내용 수정 | O | - | O(전체) |
| Comment | O | O | O |
| 첨부 추가 | O | O | O |
| 미배정 Issue Claim | O | O | O |
| 타인에게 최초 배정 | - | - | O |
| 현재 Assignee 인계 | - | O | O |
| Priority 변경 | - | O | O |
| 조치 시작 | - | O | O |
| 조치 완료 | - | O | O |
| 재조치 요청 | O | O | O |
| Reporter 확인 Close | O | - | O |
| 합의 후 Assignee Close | - | O | O |
| Re-open | O | O | O |
| Cancel | - | O | O |
| Admin 강제 상태변경 | - | - | O |
| Project/Environment/User 설정 | - | - | O |

---

# 3. 상태
```text
OPEN
IN_PROGRESS
DONE
CLOSED
CANCEL
```

UI:
- Open = 접수
- In Progress = 조치중
- Done = 조치완료/확인대기
- Closed = 완료
- Cancel = 취소

---

# 4. 상태전이
| From | Action | 수행자 | To | 필수 입력 |
|---|---|---|---|---|
| Open | 내가 조치 | 모든 사용자 | Open | 없음 |
| Open | 조치 시작 | Assignee/Admin | In Progress | 없음 |
| In Progress | 조치 완료 | Assignee/Admin | Done | 처리결과 |
| Done | 재조치 요청 | Reporter/Assignee/Admin | In Progress | 사유 |
| Done | 정상 확인·Close | Reporter/Admin | Closed | 선택 Comment |
| Done | 합의 후 Close | Assignee/Admin | Closed | 합의내용 |
| Closed | Re-open | Reporter/Assignee/Admin | In Progress | 사유 |
| Open/In Progress/Done | Cancel | Assignee/Admin | Cancel | 사유 |

---

# 5. Claim 정책
미배정 Open Issue는 모든 프로젝트 사용자가 `[내가 조치]`할 수 있다.

Claim은 배정만 수행하며 자동으로 In Progress로 변경하지 않는다.
이후 `[조치 시작]`을 눌러야 In Progress가 된다.

이유:
- 배정과 실제 작업 시작 시점을 구분
- Timeline의 의미를 명확히 유지

---

# 6. Assignee 변경
- Quality Admin: 언제든 변경 가능
- 현재 Assignee: 다른 사용자에게 인계 가능
- Reporter: 타인 배정 불가
- 최초 미배정 Issue를 타인에게 지정: Quality Admin

모든 변경은 History.

---

# 7. Close 정책
## Reporter Close
재검증 후 정상 확인.
- closeType=`VERIFIED`

## Assignee Close
가능하지만 고객/업무담당자 확인 또는 합의내용 필수.
- closeType=`AGREED`
- comment 필수

예:
`김OO 책임과 검증계 정상동작을 확인하였으며 종료하기로 협의함.`

## Admin Close
VERIFIED 또는 AGREED 중 하나로 기록하여 통계 의미를 유지한다.

---

# 8. Re-open
Done 또는 Closed에서 In Progress로 전환.
사유 필수.

예:
`검증계에서 동일 현상이 재발함.`

---

# 9. Admin Override
Quality Admin은 모든 상태를 변경할 수 있다.
단:
- 사유 필수
- Event Type=`ADMIN_STATUS_OVERRIDE`
- 일반 상태 변경과 시각적으로 구분

---

# 10. 수정 이력
Reporter/Admin이 등록내용을 수정할 경우:
- Before/After 보존
- Timeline에 UPDATED
- 기존 Comment/History 삭제 금지

---

# 11. Comment
- Reporter/Assignee/Admin 작성 가능
- 원칙적으로 수정/삭제 금지
- 정정은 새 Comment
- Admin 숨김 시 원문 Audit 보존

---

# 12. Permission Acceptance
- UI에서 숨겨진 기능도 서버에서 권한 검증
- Assignee가 아닌 일반 사용자는 상태 변경 불가
- Reporter는 자기 Issue 내용만 수정 가능
- Admin 모든 수정이 History에 남음
