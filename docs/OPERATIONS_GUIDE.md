# 운영 가이드 (Backup / Restore / 장애 대응)

## 1. Backup

- 자동: 매일 `backupSchedule.hour:minute`(기본 02:00)에 `data/` + `uploads/` 전체를 `backup/<YYYYMMDD_HHMMSS>/`로 복사. 운영설정의 `backup.enabled`가 꺼져 있으면 실행하지 않는다.
- 수동: UI 설정 > 백업·상태 > **지금 백업 실행**, 또는 `node scripts/backup.js`
- 보관: 운영설정 `backup.retainDays`(기본 30일) 초과 백업은 다음 백업 성공 시 삭제
- 상태: `backup/status.json`에 마지막 성공/실패, 이력 50건. UI에서도 확인 가능
- 권장: `backup/`을 별도 디스크/NAS 경로로 설정하고, 외부 매체로 주기적 반출

## 2. Restore

1. 서비스 중지
2. `node scripts/restore.js latest` (또는 백업명) → 대상 확인
3. `node scripts/restore.js latest --yes`
   - 현재 `data/`, `uploads/`는 `backup/_pre-restore_<시각>/`로 이동 후 교체
4. 서비스 시작 → 설정 > 백업·상태에서 Issue 수/손상 파일 확인

## 3. 단일 Issue 복구 (.bak)

모든 JSON 쓰기는 직전 버전을 `<file>.bak`으로 보존한다. 특정 Issue만 손상된 경우:

1. 서비스 중지
2. `data/issues/DEF-0001.json.bak` → `DEF-0001.json`으로 복사
3. 서비스 시작

## 4. 시작 시 검증 동작

| 상황 | 동작 |
|---|---|
| Issue 파일 JSON 파싱 실패 | 해당 Issue 격리, 목록에서 제외, 쓰기 차단(STORAGE_WRITE_FAILED). 설정 > 백업·상태에 표시 |
| users.json / project.json / operation.json / sequence.json 손상 | 서비스 시작 중단. error 로그 확인 후 `.bak` 또는 백업으로 복구 |
| sequence.json 없음/뒤처짐 | Issue 파일 기준 자동 보정 (경고 로그) |
| `.tmp` 잔여 파일 | 자동 삭제 |

## 5. 로그

`logs/` 아래 일자별 파일:

- `access-YYYY-MM-DD.log`: requestId, method, path, status, elapsedMs, errorCode (본문 미기록)
- `app-YYYY-MM-DD.log`: 시작/설정 변경/백업 등
- `error-YYYY-MM-DD.log`: 예외, 파일 시스템 오류, Audit 실패

로그 보관/삭제는 OS 스케줄로 관리한다(예: 90일).

## 6. 장애 대응

| 증상 | 조치 |
|---|---|
| 저장 실패(STORAGE_WRITE_FAILED) 반복 | 디스크 용량/권한 확인 → error 로그의 reason 확인 → 필요 시 서비스 재시작 |
| "다른 요청이 처리 중" (LOCK_TIMEOUT) | 일시적 동시 요청 폭주. 재시도. 지속 시 error 로그 확인 |
| 사용자 세션 만료 | 서버 재시작/12시간 미사용 시 정상 동작. 사용자 시작 화면에서 다시 선택 |
| 관리자 부재 | `config/server.config.json`의 `bootstrapAdminEmployeeIds`에 사번 추가 후 재시작 → 해당 사번 로그인 시 자동 승격 |
| 포트 충돌 | `DMS_PORT` 환경변수 또는 config 변경 |

## 7. Audit 조회

- UI: 설정 > 백업·상태 > 최근 Audit (100건)
- 파일: `data/audit/events-YYYY-MM.jsonl` (append-only, 편집 금지). 각 줄은 Issue history event와 동일 구조 + `issueId`, `actorId`
- 특정 Issue: `GET /api/admin/audit?issueId=DEF-0001&limit=1000`
