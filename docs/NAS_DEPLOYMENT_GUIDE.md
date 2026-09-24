# Synology NAS 배포 가이드 (Container Manager / Docker)

이 문서는 개인 Synology NAS에 결함관리서비스를 올려 **외부 인터넷에서 접속**할 수 있게 하는 절차다.

> ⚠️ **보안 경고**: 이 서비스는 금융권 폐쇄망(외부 인터넷 완전 차단) 전용으로 설계되었다.
> 비밀번호 없이 사번만으로 로그인하며, HTTPS·요청 제한·계정 잠금 같은 인터넷 노출 방어가 없다.
> 아래 절차로 외부에 열면 **사번을 아는(또는 추측한) 누구나 그 사람으로 로그인하고 Quality Admin까지 될 수 있다.**
> 실제 결함 데이터나 개인정보를 올리지 말고, 데모/시연 목적으로만 짧게 열어두는 것을 권장한다.
> 최소한의 안전장치가 필요하면 부록 A(Reverse Proxy 기본 인증)를 참고한다.

## 사전 준비

- Synology DSM 7.x 이상, **Container Manager**(구 Docker) 패키지 설치
- 제어판 > 터미널 및 SNMP > SSH 서비스 활성화 (git clone용, 이후 꺼도 됨)
- 공유기에서 NAS로 포트포워딩 권한(관리자 계정)

## 1. 소스 가져오기

NAS에 SSH로 접속한다.

```bash
ssh <NAS계정>@<NAS 내부 IP>
```

원하는 공유 폴더 아래에 클론한다 (예: `docker` 공유 폴더).

```bash
cd /volume1/docker
git clone https://github.com/halion125-co/ai-defact-system.git
cd ai-defact-system
```

> SSH를 쓰지 않으려면: PC에서 저장소를 zip으로 내려받아 **File Station**으로 NAS의 같은 경로에 업로드해도 된다.

## 2. Container Manager로 빌드/실행

### 방법 A — SSH에서 docker-compose로 (가장 간단)

Synology Container Manager가 제공하는 CLI는 대부분 `docker compose`(공백)가 아니라
`docker-compose`(하이픈, v1 계열)다. 아래로 먼저 시도하고, 안 되면 `docker compose`로 바꿔본다.

```bash
sudo docker-compose up -d --build
```

`docker-compose.yml`에 정의된 대로:
- 이미지가 빌드되고 `ai-defect-system` 컨테이너가 뜬다
- 호스트 포트 `18030`이 컨테이너 내부 `8080`으로 연결된다(NAS의 8080이 이미 다른 서비스에 사용 중인 경우가 흔해 기본값을 18030으로 설정)
- `data/ uploads/ backup/ logs/` 가 NAS의 실제 폴더로 마운트되어, 컨테이너를 지웠다 다시 만들어도 데이터가 남는다

동작 확인:

```bash
curl http://localhost:18030/api/health
# {"ok":true,...} 가 나오면 정상
```

### 방법 B — DSM 화면(Container Manager 앱)에서

1. **Container Manager** 앱 실행 → 프로젝트 → 생성
2. 프로젝트 이름: `ai-defect-system`
3. 경로: 위에서 클론한 폴더(`/docker/ai-defact-system`) 선택
4. `docker-compose.yml`이 자동 인식됨 → 빌드하여 실행

## 3. 최초 접속 및 데모 데이터

컨테이너가 뜨면 처음엔 사용자/Issue가 하나도 없는 빈 상태다.

**빈 상태로 시작**: `http://<NAS IP>:18030` 접속 → 사번 `admin`으로 신규 등록 → Quality Admin 자동 승격

**데모 데이터로 시작** (Kanban/Dashboard를 바로 보여주고 싶을 때):

```bash
sudo docker exec ai-defect-system node scripts/seed.js
```

데모 계정: `admin`(김성훈, Admin), `10001`(이영희), `10002`(박민수), `20001`(홍길동), `20002`(최지우)

## 4. 외부 인터넷에서 접속하기

### 4-1. 포트포워딩

공유기 관리 화면에서 외부 포트(예: `18080`) → NAS 내부 IP:`18030`으로 포워딩한다.
80/443처럼 흔한 포트는 피하는 걸 권장한다(자동 스캔 봇의 표적이 되기 쉽다).

> **포트 충돌 시**: `up` 실행 중 `port is already allocated` 에러가 나면 NAS의 해당 포트를
> 이미 다른 서비스(Web Station 등)가 쓰고 있다는 뜻이다. `docker-compose.yml`의 `ports`
> 왼쪽 값(호스트 포트, 기본 `18030`)만 다른 값으로 바꾸고 `sudo docker-compose up -d --build`를
> 다시 실행하면 된다.

### 4-2. 접속 주소

- 공유기가 고정 IP면: `http://<공인 IP>:18080`
- 유동 IP면 **Synology QuickConnect** 또는 DDNS(제어판 > 외부 액세스 > DDNS)로 도메인을 하나 만들어 쓰는 걸 권장한다.
  예: `http://내NAS이름.synology.me:18080`

### 4-3. DSM 방화벽 확인

제어판 > 보안 > 방화벽에서 해당 포트가 차단되어 있지 않은지 확인한다.

## 5. 운영 관리

| 작업 | 명령 |
|---|---|
| 로그 확인 | `sudo docker logs -f ai-defect-system` |
| 재시작 | `sudo docker-compose restart` |
| 코드 업데이트 반영 | `git pull && sudo docker-compose up -d --build` |
| 백업 | `sudo docker exec ai-defect-system node scripts/backup.js` (또는 NAS 자체 폴더 백업 기능으로 `data/ uploads/`를 스냅샷) |
| 완전 초기화 | 컨테이너 정지 후 `data/ uploads/ logs/ backup/` 폴더 내용 삭제 → 재시작 |

## 6. 그만 보여주고 싶을 때

```bash
sudo docker-compose down
```

공유기 포트포워딩 규칙도 함께 삭제하는 것을 권장한다(포워딩만 남아있으면 컨테이너가 꺼져도 포트 자체는 계속 인터넷에 응답 시도한다).

---

## 부록 A: 최소 안전장치 — Reverse Proxy 기본 인증 (권장)

사번 기반 로그인 앞에 비밀번호 한 겹을 추가하고 싶다면, 포트를 직접 열지 말고 DSM의 **Reverse Proxy**를 거치게 한다.

1. 제어판 > 로그인 포털 > 고급 > 역방향 프록시 → 생성
2. 원본: `HTTP`, 호스트명(DDNS 주소), 포트(예: `18080`)
3. 대상: `HTTP`, `localhost`, `18030`
4. 생성된 프록시 규칙에 커스텀 헤더/응답 헤더 설정 후, DSM의 **사용자 홈** 또는 nginx 커스텀 설정으로 `auth_basic`을 추가(패키지 센터의 "커스텀 인증서" 또는 SSH로 `/etc/nginx/sites-enabled/` 편집이 필요해 난이도가 다소 있음)

더 간단한 대안은 **Application Portal**이 아니라 **Synology VPN Server** 또는 **Tailscale** 패키지로 가상 사설망을 구성해, 포트를 인터넷에 전혀 열지 않고 등록된 기기에서만 접속하게 하는 것이다. 시연을 볼 사람이 한정적이라면 이 방법이 가장 안전하다.
