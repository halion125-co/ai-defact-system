# 07. Security & Offline Deployment v1.0

## 1. 환경 전제
- 금융권 폐쇄망
- 인터넷 연결 없음
- 외부 SaaS 없음
- GitHub/Jira 없음
- 외부 CDN/API 없음
- 내부 서버 + Browser

## 2. 외부 통신 금지
배포 Package는 모든 Resource를 포함해야 한다.
- JS
- CSS
- Font(필요 시)
- Icon
- Chart Library
- 이미지/로고

운영 검증 시 Browser Network에서 외부 Domain 요청이 0건이어야 한다.

## 3. 사용자 식별
MVP는 비밀번호 없는 사번 기반 식별.
이는 강한 인증이 아니므로 다음 전제를 문서에 명시한다.
- 내부 폐쇄망 사용
- 공용 PC에서는 사용자 변경 제공
- Mutation Actor는 Client payload가 아니라 서버 Session에서 결정

가능하면 HttpOnly Session Cookie 사용.

## 4. Authorization
모든 Mutation Endpoint는 서버에서 재검증.
UI에서 버튼 숨김만으로 보안 통제하지 않는다.

## 5. 입력 보안
- HTML Escape
- script/event handler 무효화
- JSON validation
- 길이 제한
- 허용 field allowlist

## 6. 파일 업로드
필수:
- Extension allowlist
- MIME 검증
- Max size
- 서버 저장명 재생성
- 실행권한 제거
- upload directory web executable 금지
- path traversal 차단

금지 예:
- `../../server.exe`
- double extension 우회
- scriptable html 업로드(정책상 필요 없다면 비허용)

## 7. 보안 Header
권장:
- Content-Security-Policy
- X-Content-Type-Options: nosniff
- Referrer-Policy
- 적절한 frame-ancestors

CSP는 폐쇄망 local resource 기준으로 설정한다.

## 8. CSRF
Cookie Session을 쓰면 CSRF Token 또는 SameSite 정책 적용.

## 9. 저장소 권한
OS 계정 기준:
- Backend service account만 data write
- 일반 사용자에게 data directory 공유 금지
- uploads/data를 직접 파일공유로 노출하지 않음

## 10. Audit
Audit JSONL은 append-only.
일반 UI에서 편집 불가.

Audit 최소:
- Actor
- Timestamp
- Issue ID
- Event Type
- Before/After
- Comment/Reason

## 11. Backup
권장:
- Daily
- Data + Upload
- 30일 기본
- 백업 대상 위치를 운영서버와 논리적으로 분리 권장
- 복구 절차 문서화

## 12. 배포 구조
예:
```text
/defect-service
  /app
  /backend
  /data
  /uploads
  /backup
  /logs
```

## 13. 운영 Port/URL
고객사 표준에 맞게 설정.
예:
`http://internal-server:8080/`

TLS 내부인증서 사용이 가능하면 HTTPS 권장.

## 14. Runtime
고객사 허용 Runtime을 사용한다.
- Python
- Node.js
- .NET

중요한 것은 특정 언어가 아니라:
- 오프라인 설치 가능
- Runtime 버전 고정
- 패키지 Vendor/Lock
- 재현 가능한 배포

## 15. Dependency
- 모든 dependency version pinning
- offline package/cache 확보
- production에서 package download 금지

## 16. 로그
로그에 다음 정보 과다 저장 금지:
- 전체 Comment 본문
- 첨부 내용
- 불필요한 개인정보

운영 로그는:
- request id
- route
- status
- elapsed
- error code
중심.

## 17. 장애 시
저장 실패 시:
- 원본 JSON 유지
- 사용자 입력 유지
- 재시도 안내

데이터 손상 감지 시:
- 해당 Issue write 중단
- Admin에게 오류 표시
- backup restore 절차 수행

## 18. 배포 Checklist
- [ ] 외부 요청 0건
- [ ] Runtime 설치/실행 확인
- [ ] data/upload write 권한 확인
- [ ] Quality Admin bootstrap 확인
- [ ] 프로젝트/환경 설정 확인
- [ ] 첨부 제한 확인
- [ ] Backup 경로 확인
- [ ] Server restart 후 data 유지 확인
- [ ] 2명 동시 수정 conflict 확인
- [ ] Audit 생성 확인
