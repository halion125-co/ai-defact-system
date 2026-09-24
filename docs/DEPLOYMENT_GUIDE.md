# 폐쇄망 배포 가이드

## 1. 패키지 구성

```text
defect-service/
  backend/           서버 소스 (Node.js 내장 모듈만 사용)
  frontend/          정적 자산 (외부 CDN/폰트/아이콘 없음)
  config/            server.config.json
  scripts/           seed / backup / restore / check-offline
  docs/              가이드
  package.json
  start.bat / start.sh
  data/ uploads/ backup/ logs/   최초 실행 시 자동 생성
```

`node_modules`는 필요 없다. 반입 전 `node scripts/check-offline.js`로 외부 참조 0건을 확인한다.

## 2. Runtime

- Node.js 18 이상 LTS (검증: v24). 고객사 승인 버전의 오프라인 설치 파일(.msi/.tar.xz)을 함께 반입한다.
- 버전 고정: 배포 문서에 Node 버전을 명기하고 `node --version`으로 확인.

## 3. 설치

1. 패키지를 운영 경로에 복사 (예: `D:\defect-service` 또는 `/opt/defect-service`)
2. `config/server.config.json` 편집
   - `port`: 고객사 표준 포트
   - `dataDir/uploadDir/backupDir/logDir`: 절대경로 권장. `backupDir`는 가능하면 운영 디스크와 논리적으로 분리
   - `bootstrapAdminEmployeeIds`: 최초 Quality Admin 사번 목록
3. 서비스 계정(OS)만 data/uploads/backup/logs에 쓰기 권한을 부여. 일반 사용자에게 디렉터리를 공유하지 않는다.
4. 실행: `start.bat` / `./start.sh` (또는 `node backend/server.js`)
5. 브라우저 접속 → bootstrap 사번으로 **신규 사용자 등록** → 자동으로 Quality Admin
6. 설정 > 프로젝트/발생환경/운영설정 확인

## 4. 서비스 등록 (예시)

### Windows (작업 스케줄러 또는 NSSM)

```text
프로그램: C:\Program Files\nodejs\node.exe
인수:     backend\server.js
시작 위치: D:\defect-service
```

### Linux (systemd)

```ini
[Unit]
Description=Defect Management Service
After=network.target

[Service]
User=dms
WorkingDirectory=/opt/defect-service
ExecStart=/usr/bin/node backend/server.js
Restart=always
Environment=DMS_PORT=8080

[Install]
WantedBy=multi-user.target
```

## 5. HTTPS (선택)

내부 인증서가 있으면 리버스 프록시(Nginx/IIS)에서 TLS 종료 후 `http://127.0.0.1:8080`으로 전달한다. 프록시는 `X-Requested-With` 헤더를 그대로 전달해야 한다(CSRF 검사).

## 6. 배포 Checklist (07 §18)

- [ ] `node scripts/check-offline.js` 통과 (외부 요청 0건)
- [ ] 브라우저 개발자도구 Network에서 외부 도메인 요청 0건 확인
- [ ] Runtime 설치/실행 확인 (`node --version`)
- [ ] data/uploads/backup/logs 쓰기 권한 확인
- [ ] Quality Admin bootstrap 확인 (설정 메뉴 노출)
- [ ] 프로젝트/환경 설정 확인
- [ ] 첨부 제한(크기/확장자) 확인
- [ ] Backup 경로 및 스케줄 확인 (설정 > 백업·상태)
- [ ] 서버 재시작 후 데이터 유지 확인
- [ ] 2명 동시 수정 시 409 안내 확인
- [ ] 설정 > 백업·상태 > 최근 Audit 생성 확인
- [ ] `npm test` 42건 통과 (개발 PC)

## 7. 업그레이드

1. 서비스 중지 → `node scripts/backup.js`
2. `backend/`, `frontend/`, `scripts/`, `docs/`만 교체 (`config/`, `data/`, `uploads/`는 유지)
3. 서비스 시작 → 설정 > 백업·상태에서 손상 파일/경고 확인
