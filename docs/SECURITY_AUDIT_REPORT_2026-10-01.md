# 보안 취약점 사전점검 보고서

- 점검일: 2026-10-01 (Asia/Seoul)
- 대상: 결함관리서비스 v1.0
- 범위: 오픈소스/공급망, Node.js 소스코드, 인증·권한·API, 파일 업로드, 컨테이너·배포 설정
- 성격: 금융권 공식 인증 또는 외부 전문기관 침투시험이 아닌 개발단계 기술 사전점검

## 1. 실행 결과

| 항목 | 결과 |
|---|---|
| `npm test` | 73 pass / 0 fail |
| `npm run check:offline` | 외부 URL 0건, 외부 npm 의존성 0건 |
| 기존 보안 회귀 테스트 | 인증·권한·CSRF·XSS·첨부파일·경로탐색·정적파일 접근 테스트 통과 |
| 오픈소스 CVE | 애플리케이션 npm 의존성은 비어 있음. Node.js/Alpine 이미지 별도 스캔 필요 |
| 코드 변경 | 애플리케이션 코드는 변경하지 않음. 기존 사용자 수정 2개 파일 보존 |

## 2. 우선 조치가 필요한 발견사항

### SEC-001 — 고정 관리자 인증정보가 소스에 내장됨

- 등급: **높음(Critical에 준하는 운영 차단 권고)**
- 근거: `backend/app/services/UserService.js:16`, `README.md:66`, `backend/tests/ux-security.test.js:300`
- 내용: 관리자 비밀번호 검증값이 코드의 고정 SHA-256 해시로 존재하고, 테스트 코드에는 대응하는 고정 비밀번호가 평문으로 존재한다. 기본 관리자 사번도 `admin`으로 설정되어 있다.
- 영향: 소스 저장소 또는 테스트 산출물을 열람한 사람이 관리자 로그인을 시도할 수 있다. SHA-256은 비밀번호 저장용 KDF가 아니며 salt도 없다.
- 권고:
  1. 고정 비밀번호와 테스트 평문 제거
  2. 최초 기동 시 외부 주입된 일회성 관리자 비밀 또는 최초 설정 플로우 사용
  3. `scrypt`/`argon2id`/`bcrypt` 계열의 salt 포함 KDF 적용
  4. 운영 배포 전 관리자 비밀번호 설정 여부를 fail-closed로 검사
  5. 기존 배포본과 로그에 노출된 자격증명은 즉시 폐기·교체

### SEC-002 — 외부 API Key가 임의 사용자 대행권한으로 사용될 수 있음

- 등급: **높음** (외부 API를 활성화한 경우)
- 근거: `backend/app/server.js:94-97`, `backend/app/controllers/routes.js:252-270`
- 내용: API Key를 검증한 뒤 요청 본문 또는 query의 `employeeId`로 `ctx.user`를 결정한다. Key 자체가 특정 연동 주체나 허용 기능에 묶여 있지 않다.
- 영향: API Key를 획득한 호출자가 다른 사번을 지정하여 해당 사용자의 결함 등록·조회·배포·댓글·첨부 작업을 수행할 수 있다.
- 확인: 테스트 서버에서 관리자 세션으로 외부 API Key 발급·활성화 후 `X-Api-Key`와 요청 `employeeId`만으로 외부 결함 등록이 `201`로 처리됨을 확인했다.
- 권고:
  1. API Key를 특정 service principal에 매핑하고 요청의 `employeeId`를 신뢰하지 않기
  2. 연동별 허용 작업·허용 조직·허용 데이터 범위(scope) 적용
  3. 사용자 대행이 필요한 경우 명시적인 서버측 위임 정책과 감사 이벤트 기록
  4. API Key별 만료·폐기·교체·사용량·실패율 모니터링 추가
  5. 외부 API는 TLS와 네트워크 ACL 뒤에서만 활성화

### SEC-003 — TLS 종료 프록시 뒤에서 세션 쿠키가 Secure로 발급되지 않을 수 있음

- 등급: **중간~높음** (HTTPS를 역방향 프록시에서 종료하는 배포 구성인 경우)
- 근거: `backend/app/services/SessionService.js:47-50`, `backend/app/controllers/routes.js:34,53,73`
- 내용: `Secure` 속성이 `ctx.req.socket.encrypted`에만 의존한다. 프록시가 HTTPS를 종료하고 백엔드에 HTTP로 전달하면 브라우저에 Secure 없는 세션 쿠키가 발급될 수 있다.
- 영향: 내부 구간 또는 잘못 구성된 프록시/네트워크에서 세션 쿠키가 평문 HTTP로 전송될 가능성이 있다.
- 권고: `DMS_FORCE_SECURE_COOKIE` 또는 신뢰 가능한 프록시 헤더 정책을 도입하고, 신뢰 프록시 IP/헤더 검증 없이 `X-Forwarded-Proto`를 그대로 신뢰하지 않는다. 운영은 HTTPS-only와 HSTS를 적용한다.

### SEC-004 — 관리자 로그인 실패 잠금이 프로세스 전역·메모리 기반임

- 등급: **중간**
- 근거: `backend/app/services/UserService.js:36,93-104`
- 내용: 모든 관리자 로그인 실패가 하나의 전역 카운터를 공유하고, 서버 재시작 시 초기화된다.
- 영향: 공격자가 실패 요청 5회로 정상 관리자 로그인을 일시 차단할 수 있고, 다중 프로세스/재시작 환경에서는 보호가 일관되지 않다.
- 권고: 계정·원격지·시간창별 rate limit을 적용하고 reverse proxy/WAF 또는 영속 저장소와 연계한다. 잠금 이벤트는 감사·운영 알림으로 남긴다.

### SEC-005 — 컨테이너 빌드가 공급망 실패를 무시함

- 등급: **중간**
- 근거: `Dockerfile:3,12-13`
- 내용: `node:20-alpine`이 digest로 고정되지 않았고, `npm install --omit=dev --no-audit --no-fund || true`로 설치 실패를 무시한다. `package-lock.json`도 없다.
- 영향: 이미지 재빌드 시 동일 소스가 동일한 런타임·패키지로 재현되지 않으며, 설치 실패가 배포 성공처럼 보일 수 있다.
- 권고: Node 이미지 digest 고정, lockfile 도입, `npm ci --omit=dev` 사용, 설치 실패 즉시 중단, 이미지·OS 패키지 SBOM/CVE 스캔을 릴리스 게이트에 포함한다.

### SEC-006 — 컨테이너 권한 및 데이터 보호 기준이 명시적으로 강제되지 않음

- 등급: **중간**
- 근거: `Dockerfile:9-30`, `docker-compose.yml:17-22`
- 내용: 별도 비root `USER`, read-only root filesystem, capability drop, 데이터 디렉터리 권한, 백업 암호화/분리 보관이 배포 파일에서 강제되지 않는다.
- 영향: 서비스 취약점이 발생하면 컨테이너 내부 권한과 마운트된 운영 데이터에 대한 피해 범위가 커질 수 있다.
- 권고: 비root 실행, 최소 capability, read-only rootfs, 별도 쓰기 볼륨, 백업 저장소 분리·암호화, 운영 계정 권한 최소화를 적용한다.

## 3. 양호 또는 추가 검증이 필요한 영역

- 서버 보안 헤더, CSP, SameSite/HttpOnly 세션 쿠키, CSRF custom header 검사는 기존 자동 테스트에서 통과했다.
- 권한 매트릭스와 서버측 권한 재검증, 숨김 댓글·삭제 첨부파일 노출 차단, 정적 경로 traversal 차단은 자동 테스트에서 통과했다.
- 첨부파일 확장자·MIME·magic bytes·크기·파일명 traversal 방어가 구현되어 있다. 다만 운영 반입 파일에 대한 바이러스/악성코드 검사는 별도 통제가 필요하다.
- npm 의존성이 없으므로 애플리케이션 패키지 CVE는 현재 스캔 대상이 없지만, `node:20-alpine`, Alpine 패키지, 운영 OS와 Docker 런타임은 별도 SCA/이미지 스캔 대상이다.

## 4. 권장 조치 순서

1. SEC-001 관리자 인증정보 제거 및 운영 비밀 주입 방식 확정
2. SEC-002 외부 API를 기본 비활성화하고 service principal/scope 기반으로 재설계
3. SEC-003 HTTPS·프록시·Secure cookie 배포 기준 확정
4. Dockerfile/Compose hardening 및 이미지 digest/SBOM 적용
5. API 외부 연동, 프록시 TLS, 비밀번호 정책을 회귀 테스트에 추가
6. 수정 후 SAST/SCA/DAST와 실제 배포 대상의 health·UI·권한 검증 재실행

## 5. 판정

현재 자동 테스트 기준으로 핵심 기능과 기존 보안 회귀 시나리오는 통과했지만, **금융권 폐쇄망 운영 승인 상태로 판정할 수는 없다.** SEC-001과 SEC-002를 해결하기 전에는 외부 제공 또는 운영망 연결을 보류하는 것이 안전하다.
