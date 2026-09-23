# UI_DESIGN_GUIDE.md

## 1. 문서 목적

본 문서는 **금융권 폐쇄망 프로젝트용 경량 결함관리 서비스**의 UI/UX 디자인 및 화면 구현 기준을 정의한다.

본 서비스는 화려한 기능보다 다음 3가지를 최우선으로 한다.

1. **결함을 빠르고 쉽게 등록**
2. **등록 → 조치 → 배포 → 재검증 → 종료까지 이력을 명확하게 추적**
3. **품질담당자/Test Manager가 Dashboard에서 품질상태를 빠르게 판단**

첨부된 디자인 시안은 **Visual Reference**로 활용하되, 화면 구조와 기능은 본 문서에 정의된 실제 서비스 요구사항을 기준으로 구현한다.

> **중요**
>
> - 디자인 시안을 이미지 그대로 복제하지 않는다.
> - 화면마다 동일한 Layout / Component / Design Token을 재사용한다.
> - 폐쇄망 환경을 전제로 외부 CDN, 외부 API, 외부 폰트 호출에 의존하지 않는다.
> - 현재 MVP에는 AI 분석/추천 기능을 포함하지 않는다.
> - `AI Agent` 명칭과 미래지향적 Visual Identity는 사용할 수 있으나, 실제로 동작하지 않는 AI 기능을 UI에 표시하지 않는다.

---

# 2. 서비스 전제조건

## 2.1 운영 환경

본 서비스는 다음 환경을 전제로 한다.

- 금융권/공공 등 인터넷 사용이 제한된 **폐쇄망**
- 외부 인터넷 접속 불가
- 외부 SaaS 사용 불가
- GitHub / Jira 사용 불가
- 외부 API 사용 불가
- 외부 CDN 사용 불가
- 별도 DBMS 구축 없음
- 내부 경량 Backend + JSON/File 기반 저장
- 프로젝트 단위의 소규모 사용자 공동 사용
- Desktop Browser 중심 사용
- 기준 해상도: `1440px 이상`
- 최소 지원 해상도: `1280px`

외부 Library가 필요한 경우 서비스 Package 내부에 포함한다.

---

## 2.2 서비스 관리 대상

서비스는 다음 3가지 Issue Type을 관리한다.

| 유형 | ID Prefix | 목적 |
|---|---|---|
| 결함 | `DEF-` | 기능/업무 오류 관리 |
| 개선요청 | `IMP-` | 기능/UX 개선 요청 |
| 문의 | `INQ-` | 요구사항/업무/정책 확인 |

Dashboard의 품질 지표는 기본적으로 **Defect 기준**으로 표시하고, 필요 시 Issue Type Filter로 Improvement / Inquiry까지 조회할 수 있도록 한다.

---

# 3. UX 핵심 원칙

## 3.1 사용자가 표준의 복잡함을 느끼지 않게 한다

결함관리 표준에서 필요한 정보를 모두 확보하되, 사용자가 문서 양식을 작성하는 느낌이 들지 않도록 질문형 UI를 사용한다.

예:

- `현상` → **어떤 문제가 발생했나요?**
- `재현절차` → **어떻게 하면 다시 발생하나요?**
- `기대결과` → **정상이라면 어떻게 되어야 하나요?**

---

## 3.2 시스템이 알고 있는 정보는 입력받지 않는다

다음 정보는 자동 생성한다.

- Issue ID
- 등록자
- 등록자 소속
- 등록일시
- 최초 상태
- 상태 변경일시
- Comment 작성자
- Timeline Event

---

## 3.3 등록과 조치의 책임을 분리한다

### 등록자 Reporter

- 문제를 재현 가능하게 등록
- 본인 등록내용 수정
- Comment 작성
- 첨부 추가
- 재검증
- Close 가능

### 조치자 Assignee

- 조치자 지정/변경
- Priority 지정/변경
- 조치 수행
- 상태 변경
- Comment 작성
- 조치결과 작성
- 배포정보 등록
- Close 가능

### Quality Admin

품질담당자/Test Manager이며 Super User 권한을 가진다.

- 모든 Issue 조회/수정
- 모든 상태 변경
- Assignee/Priority 관리
- Project/Environment/User 설정
- Dashboard/통계 관리

`PL`은 별도 시스템 Role로 두지 않는다.

---

## 3.4 상태값보다 행동을 보여준다

사용자에게 Status Dropdown을 중심으로 제공하지 않는다.

예:

- `Open → In Progress` : **[조치 시작]**
- `In Progress → Done` : **[조치 완료]**
- `Done → Closed` : **[정상 확인 · Close]**
- `Done → In Progress` : **[재조치 요청]**

단, Quality Admin은 관리 목적상 상태 수정 기능을 사용할 수 있다.

---

## 3.5 모든 중요한 행동은 Timeline으로 남긴다

다음 이벤트는 반드시 History에 저장하고 Issue 상세 Timeline에 표시한다.

- 신규 등록
- 등록내용 수정
- Comment
- 조치자 지정/변경
- Priority 변경
- 상태 변경
- 조치 완료
- 배포 완료
- Re-open
- Cancel
- Close

---

# 4. Design Concept

## 4.1 Design Keywords

- Enterprise
- Quality Management
- Traceability
- Simple
- Reliable
- Professional
- Intelligent Visual Identity
- Clean & Efficient

AI Agent의 미래지향적 이미지는 Brand Identity 수준에서 활용하되, 로그인 이후 업무 화면에서는 **업무 효율성, 정보 가독성, Traceability**를 우선한다.

과도한 Neon, Glow, Animation은 사용하지 않는다.

---

# 5. Visual Direction

## 5.1 로그인 화면

로그인 화면은 첨부 시안의 Visual Identity를 유지할 수 있다.

권장 구성:

- Full Screen Dark Navy Visual
- AI / Digital Quality / Network 이미지
- Blue / Cyan Accent
- Glassmorphism Login Card
- 서비스명과 프로젝트 품질관리 메시지 표시

권장 서비스명:

**KT AI Agent**

보조 설명:

**프로젝트 품질 · 결함관리 서비스**

메시지 예시:

**함께 만드는 더 나은 품질,  
빠르게 등록하고 끝까지 추적합니다**

> 로그인 화면의 `비밀번호` 입력은 사용하지 않는다.

---

## 5.2 로그인 이후 업무 화면

기본 구조:

`Dark Navy Sidebar + Dark Header + White Main Workspace`

업무 화면에서는 미래지향적 배경 이미지보다 다음을 우선한다.

1. 정보 탐색성
2. 빠른 입력
3. 상태 인지
4. 이력 확인
5. Dashboard 분석

---

# 6. Design Token

## 6.1 Color

| 용도 | 권장 색상 |
|---|---|
| Primary Navy | `#071A33` |
| Deep Navy | `#041225` |
| Primary Blue | `#126BFF` |
| Bright Blue | `#1D8FFF` |
| Cyan Accent | `#16C7FF` |
| Background | `#F5F7FB` |
| Surface | `#FFFFFF` |
| Border | `#E5EAF2` |
| Primary Text | `#172033` |
| Secondary Text | `#667085` |
| Success | `#18B981` |
| Warning | `#F5A623` |
| Danger | `#F04438` |

KT Red는 KT Logo에 우선 사용하며 Primary Action Color로 과도하게 사용하지 않는다.

---

## 6.2 Typography

폐쇄망을 고려하여 외부 Web Font 호출을 사용하지 않는다.

권장:

```css
font-family: "Pretendard", "Noto Sans KR", "Malgun Gothic", Arial, sans-serif;
```

Pretendard 또는 Noto Sans KR을 사용할 경우 필요한 Font File을 Package 내부에 포함하거나 시스템 기본 Font로 fallback 한다.

| 구분 | 권장 크기 |
|---|---:|
| Page Title | 24~28px |
| Section Title | 18~20px |
| Card Title | 15~17px |
| Body | 14px |
| Secondary | 12~13px |
| Caption | 11~12px |
| KPI | 24~32px |

---

# 7. Application Layout

로그인 이후 모든 화면에서 동일한 Application Shell을 사용한다.

```text
┌──────────────────────────────────────────────────────────────┐
│ Global Header                                                │
├──────────────┬───────────────────────────────────────────────┤
│              │                                               │
│ Sidebar      │ Main Workspace                                │
│              │                                               │
│              │                                               │
│              │                                               │
│ KT Logo      │                                               │
└──────────────┴───────────────────────────────────────────────┘
```

Sidebar Width:

`220~240px`

Header Height:

`56~64px`

Main Content Padding:

`24~32px`

---

# 8. Sidebar Navigation

기존 시안의 메뉴 구조를 실제 MVP 기능에 맞게 단순화한다.

```text
AI Agent

Dashboard

Issue 관리
 ├ Kanban
 └ 목록

MY
 ├ 내가 등록
 ├ 내가 조치
 └ 확인대기

+ Issue 등록

설정        # Quality Admin only
```

### 메뉴 원칙

- 결함/개선/문의를 별도의 시스템 메뉴로 분리하지 않는다.
- `Issue 관리` 화면에서 Type Filter로 구분한다.
- 현재 메뉴는 Primary Blue Background로 강조한다.
- 메뉴 Depth는 최대 2단계로 제한한다.
- `+ Issue 등록`은 Sidebar 또는 Main Header에서 항상 빠르게 접근 가능해야 한다.

---

# 9. KT Logo

KT Logo는 로그인 이후 Sidebar 왼쪽 하단에 배치한다.

권장:

- Width: `32~40px`
- Bottom: `20~24px`
- Left: `20~24px`
- 원본 Aspect Ratio 유지
- 임의 색상 변경 금지

Navigation보다 시각적으로 강조하지 않는다.

---

# 10. Global Header

권장 구성:

```text
[고객사 / 프로젝트명]         [통합검색]      [사용자]
```

예:

```text
KB국민은행 | Gen AI 2.0      결함 검색...     김성훈
                                             Quality Admin
```

### 포함 요소

- 현재 고객사/프로젝트
- 통합 Issue 검색
- 사용자명
- 사용자 소속 또는 Role
- 사용자 변경
- 필요 시 도움말

MVP에서는 의미 없는 Notification 아이콘을 만들지 않는다.

---

# 11. 최초 사용자 등록 / 로그인

## 11.1 최초 접속

최초 접속 시 최소 정보만 입력한다.

```text
사번 *
[________________]

이름 *
[________________]

소속 *
[________________]

[시작]
```

비밀번호 입력은 제공하지 않는다.

---

## 11.2 재접속

이전에 사용한 사용자가 있으면 다음과 같이 표시한다.

```text
김성훈 (AX리스크/품질팀)

[이 사용자로 시작]
[사용자 변경]
```

본 기능은 강한 인증이 아니라 폐쇄망 내부 사용자 식별 목적이다.

---

# 12. Main Page Header

모든 업무 화면은 다음 기본 패턴을 사용한다.

```text
Page Title
Page Description

[Filter Area]                             [Primary Action]

[Main Content]
```

예:

```text
Issue 관리
등록된 결함, 개선요청, 문의사항의 처리 상태를 확인합니다.

[유형] [상태] [환경] [Priority] [담당자]         [+ Issue 등록]
```

---

# 13. Issue 등록 진입

`+ Issue 등록` 선택 시 먼저 유형을 선택한다.

```text
무엇을 등록하시겠어요?

┌────────────────┐
│ 🐞 결함        │
│ 오류가 발생했어요 │
└────────────────┘

┌────────────────┐
│ 💡 개선요청    │
│ 더 좋게 개선하고 싶어요 │
└────────────────┘

┌────────────────┐
│ ❓ 문의        │
│ 확인이 필요한 내용이 있어요 │
└────────────────┘
```

3개 Card 중 하나를 선택하면 해당 입력 화면으로 이동한다.

---

# 14. Defect 등록 화면

## 14.1 핵심 원칙

기존의 복잡한 4-Step Wizard를 사용하지 않는다.

Defect는 **한 화면에서 1분 이내 등록 가능**하도록 구성한다.

Reporter는 Assignee와 Priority를 등록하지 않는다.

---

## 14.2 화면 구조

```text
결함 등록
문제를 다른 사람이 다시 재현할 수 있도록 간단하게 작성해주세요.

┌──────────────────────────────────────────────────────────┐
│ 1. 어디에서 발생했나요? *                               │
│ [고객관리 > 고객정보 조회___________________________]   │
│ 예) 고객관리 > 고객정보 조회                            │
│                                                          │
│ 발생 환경 *                                              │
│ [검증계 ▼]                                               │
│                                                          │
│ 2. 어떤 문제가 발생했나요? *                            │
│ [___________________________________________________]    │
│ [___________________________________________________]    │
│ 예) 조회 버튼을 누르면 로딩 상태가 계속됩니다.          │
│                                                          │
│ 3. 어떻게 하면 다시 발생하나요? *                       │
│ 1. [_______________________________________________]     │
│ 2. [_______________________________________________]     │
│ 3. [_______________________________________________]     │
│                              [+ 단계 추가]               │
│                                                          │
│ 4. 정상이라면 어떻게 되어야 하나요? *                   │
│ [___________________________________________________]    │
│                                                          │
│ 5. 화면 캡처 / 증적                                      │
│ [ + 파일 추가 ]                                          │
│                                                          │
│                                      [취소] [결함 등록]  │
└──────────────────────────────────────────────────────────┘
```

---

## 14.3 각 항목의 작성 Sample

각 입력란 하단에 항상 짧은 Sample을 표시한다.

### 발생 위치

`예) 고객관리 > 고객정보 조회`

### 발생 현상

`예) 고객명을 입력하고 조회 버튼을 누르면 결과가 표시되지 않고 로딩 상태가 계속됩니다.`

### 재현 절차

```text
예)
1. 고객관리 메뉴 접속
2. 고객정보 조회 선택
3. 고객명 입력
4. 조회 버튼 클릭
5. 로딩 화면에서 멈춤
```

### 기대 결과

`예) 조회조건에 해당하는 고객 목록이 표시되어야 합니다.`

---

## 14.4 자동 생성

등록 시 다음 데이터는 자동 처리한다.

- `DEF-xxxx`
- Reporter
- Reporter Team
- Created Date/Time
- Status = Open
- Timeline `CREATED`

등록자가 별도로 입력하지 않는다.

---

# 15. Improvement 등록 화면

입력항목은 최대한 단순하게 한다.

```text
개선요청 등록

개선 대상 *
[________________________________]

어떻게 개선했으면 좋겠나요? *
[________________________________]
[________________________________]

왜 개선이 필요한가요?
[________________________________]

참고자료
[ + 파일 추가 ]

[취소] [개선요청 등록]
```

자동 생성:

- `IMP-xxxx`
- Reporter
- Created Date
- Open

---

# 16. Inquiry 등록 화면

```text
문의 등록

문의 대상 *
[________________________________]

문의 내용 *
[________________________________]
[________________________________]

참고자료
[ + 파일 추가 ]

[취소] [문의 등록]
```

자동 생성:

- `INQ-xxxx`
- Reporter
- Created Date
- Open

---

# 17. Issue Detail 화면

Issue Detail은 본 서비스의 핵심 화면이다.

## 17.1 화면 정보구조

```text
┌──────────────────────────────────────────────────────────┐
│ DEF-0023   [Major]   [In Progress]                       │
│ 로그인 후 화면이 계속 로딩되는 현상                     │
│                                                          │
│ 등록자  김성훈 (AX리스크/품질팀)                        │
│ 조치자  홍길동 (개발팀)                                 │
│ 환경    검증계                                           │
│ 등록일  2026-09-24 09:32                                │
│                                                          │
│ [ID 복사]                            [수정] [More...]     │
├──────────────────────────────────────────────────────────┤
│ 결함 내용                                                │
│                                                          │
│ 발생 현상                                                │
│ ...                                                      │
│                                                          │
│ 재현 절차                                                │
│ 1. ...                                                   │
│ 2. ...                                                   │
│                                                          │
│ 기대 결과                                                │
│ ...                                                      │
│                                                          │
│ 첨부파일                                                 │
│ error01.png                                              │
├──────────────────────────────────────────────────────────┤
│ 조치 / 배포 정보                                         │
├──────────────────────────────────────────────────────────┤
│ Timeline / Comment                                       │
└──────────────────────────────────────────────────────────┘
```

---

# 18. Issue Summary 영역

상단 Summary에서 한눈에 확인해야 하는 정보:

- Issue ID
- Issue Type
- 제목/현상 요약
- Status
- Priority
- Reporter
- Assignee
- Environment
- Created Date

### 조치자 미지정

```text
조치자
미지정

[내가 조치]
```

### Priority 미지정

```text
Priority
미지정
```

Assignee 또는 Quality Admin이 지정 가능하다.

---

# 19. Reporter 수정 UX

Reporter는 본인이 등록한 Issue를 수정할 수 있다.

버튼:

`[등록내용 수정]`

수정 가능한 항목:

- 발생 위치
- 환경
- 발생 현상
- 재현 절차
- 기대 결과
- 첨부파일

수정 후 Timeline:

```text
10:25 김성훈
등록내용 수정

발생 현상 변경
[변경내용 보기]
```

`변경내용 보기` 선택 시 Before / After를 표시한다.

---

# 20. Assignee / Priority UX

Assignee와 Quality Admin은 Issue Detail 상단에서 바로 수정한다.

```text
조치자
홍길동 (개발팀)  [변경]

Priority
Major            [변경]
```

변경 완료 시 자동 Timeline을 생성한다.

```text
10:30 홍길동
Priority 변경
Minor → Major
```

---

# 21. 상태 Workflow

기본 상태:

```text
Open
 ↓
In Progress
 ↓
Done
 ↓
Closed
```

예외:

```text
Done / Closed
      ↓
In Progress
```

및:

```text
Open / In Progress / Done
          ↓
        Cancel
```

---

# 22. 상태 Action UI

## 22.1 Open

조치자가 보면:

```text
[조치 시작]
```

결과:

`Open → In Progress`

Comment는 필수 아님.

Timeline:

```text
10:15 홍길동
조치를 시작했습니다.
Open → In Progress
```

---

## 22.2 In Progress

조치자가 보면:

```text
[조치 완료]
```

선택 시 Modal:

```text
조치 완료

처리 결과 *
[________________________________________]
[________________________________________]

Change Reference
[ Commit / Revision / Change ID          ]

반영 예정 버전
[ Release 1.2.3                          ]

[취소] [조치 완료]
```

처리 결과:

`In Progress → Done`

---

## 22.3 Done

Reporter가 보면:

```text
조치가 완료되었습니다.
재검증 후 결과를 선택해주세요.

[재조치 요청]   [정상 확인 · Close]
```

### 재조치 요청

사유 필수.

```text
재조치 사유 *
[검증계에서 동일 현상이 계속 발생합니다.]
```

결과:

`Done → In Progress`

### 정상 확인

결과:

`Done → Closed`

Close Type:

`verified`

---

## 22.4 Assignee Close

Assignee도 Closed 가능하다.

단, 고객/업무담당자 확인 또는 합의 내용을 반드시 입력한다.

```text
결함을 종료하시겠습니까?

가능하면 고객/등록자가 직접 확인 후 종료하는 것을 권장합니다.
조치자가 종료하는 경우 확인/합의 내용을 남겨주세요.

확인/합의 내용 *
[김OO 책임과 검증계 정상동작을 확인하였으며
 해당 결함을 종료하기로 협의함.]

[취소] [Close]
```

Close Type:

`agreed`

---

# 23. Comment

Issue Detail 하단에는 항상 Comment 입력영역을 제공한다.

```text
추가로 확인한 내용이나 조치에 필요한 정보를 남겨주세요.

[______________________________________________________]
[______________________________________________________]

[파일 첨부]                                      [등록]
```

Comment 작성 가능:

- Reporter
- Assignee
- Quality Admin

자동 저장:

- 사용자
- 소속
- 작성시간
- Comment 내용
- 첨부파일

---

# 24. Timeline

Timeline은 Comment와 시스템 Event를 시간순으로 통합 표시한다.

예:

```text
● 09:32 김성훈
│ 결함 등록
│
● 10:03 홍길동
│ 조치자 지정
│ 미지정 → 홍길동
│
● 10:15 홍길동
│ 조치 시작
│ Open → In Progress
│
💬 10:42 김성훈
│ 특정 고객번호에서도 동일 현상이 발생합니다.
│
💬 11:20 홍길동
│ 조회 조건 오류 확인했습니다.
│
● 13:10 홍길동
│ 조치 완료
│ 조회 조건 처리 로직 수정
│ In Progress → Done
│
● 18:30 홍길동
│ 검증계 배포 완료
│ Release 1.2.3
│
✓ 19:10 김성훈
  정상 확인
  Done → Closed
```

### Event 시각 구분

- System Event: Neutral/Blue
- Comment: Speech Bubble Icon
- Deployment: Cyan Accent
- Closed: Success
- Re-open / Cancel: Warning/Danger

---

# 25. Source / CI·CD Traceability

MVP에서는 CI/CD를 자동 연동하지 않는다.

대신 다음 추적정보를 사람이 간단히 기록할 수 있도록 한다.

```text
Issue ID
  ↓
Source Change
  ↓
Deployment
  ↓
Verification
  ↓
Closed
```

---

## 25.1 ID 복사

Issue Detail 상단:

```text
DEF-0023   [ID 복사]
```

복사 결과:

`DEF-0023`

권장 Commit Message:

```text
[DEF-0023] 로그인 Token 처리 오류 수정
```

---

## 25.2 Change Reference

조치 완료 시 선택 입력:

```text
Change Reference
[ a84fd23 ]
```

다음 값을 모두 허용할 수 있다.

- Git Commit Hash
- SVN Revision
- 고객사 형상관리 Change ID
- 기타 Source Change Identifier

특정 형상관리 Tool 명칭에 종속시키지 않는다.

---

# 26. Deployment

조치 완료와 배포 완료는 구분한다.

## 26.1 Deployment Status

```text
미배포
배포완료
```

Issue Status는 기존 상태체계를 유지한다.

예:

```text
Done · 배포대기
```

또는

```text
Done · 검증계 배포완료
```

---

## 26.2 배포 완료 Action

버튼:

`[배포 완료]`

Modal:

```text
배포 완료

배포 환경 *
[검증계 ▼]

배포 버전
[Release 1.2.3]

배포 일시
[2026-09-24 18:30]

[취소] [배포 완료]
```

배포자와 등록시간은 자동 저장한다.

---

# 27. Kanban

Kanban은 조치자가 현재 처리해야 할 Issue를 빠르게 파악하기 위한 화면이다.

## 27.1 Columns

```text
Open
접수

In Progress
조치중

Done
확인대기

Closed
완료
```

`Cancel`은 별도 Filter로 조회한다.

---

## 27.2 Card 정보

```text
DEF-0031        Critical

로그인 후 화면이 멈추는 현상

검증계
Reporter  김성훈

Assignee  미지정 ⚠

2026-09-24
```

카드에 표시할 최소 정보:

- ID
- Type
- 현상 요약
- Priority
- Environment
- Reporter
- Assignee
- 등록일

---

## 27.3 Drag & Drop

**Drag & Drop으로 상태를 변경하지 않는다.**

Kanban은 현황 조회용이다.

상태 변경은 Issue Detail Action Button으로만 수행한다.

---

## 27.4 Quick Filter

```text
[전체]
[신규/미지정]
[내가 등록]
[내가 조치]
[확인대기]
[Critical]
```

추가 Filter:

- Type
- Environment
- Status
- Priority
- Assignee
- 등록기간

---

# 28. List View

Kanban과 동일 데이터를 Table 형태로 볼 수 있다.

권장 Column:

| ID | 유형 | 제목/현상 | 환경 | Priority | Status | Reporter | Assignee | 등록일 |
|---|---|---|---|---|---|---|---|---|

기능:

- Sort
- Filter
- Search
- Pagination 또는 Virtual Scroll

Issue ID 또는 제목 선택 시 Detail로 이동한다.

---

# 29. MY 화면

MY 화면은 로그인한 사용자에게 필요한 Issue만 보여준다.

상단 Tab:

```text
내가 등록
내가 조치
확인대기
```

### 내가 등록

현재 사용자가 Reporter인 Issue.

### 내가 조치

현재 사용자가 Assignee인 Issue.

### 확인대기

현재 사용자가 Reporter이며 `Done` 상태인 Issue.

---

# 30. Dashboard

Dashboard는 품질담당자/Test Manager가 프로젝트 품질상태를 빠르게 판단하기 위한 핵심 화면이다.

Dashboard는 화려한 Visualization보다 **현재 관리가 필요한 상태를 발견하는 것**을 우선한다.

---

# 31. Dashboard Global Filter

상단에 다음 Filter를 배치한다.

```text
Issue Type [결함 ▼]
기간       [전체 ▼]
환경       [전체 ▼]
Priority   [전체 ▼]
```

기본값:

- Issue Type = **결함**
- 기간 = 전체
- 환경 = 전체
- Priority = 전체

모든 KPI와 Chart는 동일 Filter를 적용한다.

---

# 32. Dashboard KPI

첫 번째 Row:

```text
전체 결함       Open        조치중       확인대기       Closed
  128            12           20            8             88
```

두 번째 관리 KPI:

```text
Critical      담당자 미지정      장기 미조치      Re-open
   3               4                6               2
```

필요 시:

```text
배포대기       재검증대기
   5              8
```

각 KPI Card는 클릭 가능해야 한다.

예:

`담당자 미지정 4` 선택  
→ Assignee 미지정 Issue 목록

---

# 33. 일자별 결함 등록 / 조치 Chart

Dashboard에 Bar Chart를 제공한다.

표시 데이터:

- 일자별 신규 결함 등록 건수
- 일자별 조치 완료 건수
- 필요 시 일자별 Closed 건수

`조치 완료 건수`는 해당 날짜에 **최초로 Done 상태에 도달한 Defect 수**를 기준으로 한다.

예:

```text
일자별 결함 처리 현황

15 ┤
12 ┤      █
 9 ┤  █   █       █
 6 ┤  ▓   █   ▓   █
 3 ┤  ▓   ▓   ▓   ▓
   └────────────────────
     9/21 9/22 9/23 9/24

   ■ 신규 등록
   ▓ 조치 완료
```

Bar 또는 해당 일자를 선택하면 해당 Issue List로 Drill-down 한다.

---

# 34. Burn Up Chart

Dashboard 핵심 Chart이다.

## 34.1 기본 Line

```text
결함 등록 누적
결함 조치 누적
```

선택적으로:

```text
Closed 누적
```

을 Toggle로 표시할 수 있다.

---

## 34.2 Summary

Chart 상단 또는 하단에 현재 누적 값을 표시한다.

```text
누적 등록    128
누적 조치     92
미조치 Gap    36
```

Closed를 표시하는 경우:

```text
누적 등록    128
누적 조치     92
누적 Closed   84
```

해석:

```text
미조치 Gap
128 - 92 = 36

재검증/종료 대기
92 - 84 = 8
```

---

## 34.3 UX 원칙

Burn Up Chart는 다음을 직관적으로 보여줘야 한다.

- 결함 증가 속도
- 조치 속도
- 누적 Gap
- 테스트 안정화 추세

Chart Point Hover 시:

```text
2026-09-24

누적 등록  128
누적 조치   92
Gap         36
```

를 표시한다.

---

# 35. Dashboard 분포 Chart

## 35.1 상태별

Donut Chart:

- Open
- In Progress
- Done
- Closed

## 35.2 Priority별

Bar Chart:

- Critical
- Major
- Minor

## 35.3 환경별

Bar 또는 Horizontal Bar:

프로젝트 설정의 Environment 값을 사용한다.

예:

```text
개발계       12
테스트계     68
검증계       48
```

---

# 36. 관리 필요 영역

Dashboard 하단 또는 우측에 `관리 필요` Card를 제공한다.

```text
관리 필요

Critical 미조치                  3건
담당자 미지정                    4건
3일 이상 장기 미조치             6건
조치완료 후 배포대기             5건
배포완료 후 재검증대기           8건
Re-open                          2건
```

각 Row는 클릭 가능한 Drill-down Link로 만든다.

Quality Admin에게는 단순 Chart보다 이 영역의 우선순위를 높인다.

---

# 37. Dashboard Layout 권장안

```text
┌──────────────────────────────────────────────────────────────┐
│ Dashboard                      [Type][기간][환경][Priority]   │
├──────────┬──────────┬──────────┬──────────┬──────────────────┤
│ 전체     │ Open     │ 조치중   │ 확인대기 │ Closed           │
├──────────┴──────────┴──────────┴──────────┴──────────────────┤
│                                                              │
│ 일자별 결함 등록 / 조치                                      │
│ [Bar Chart]                                                  │
│                                                              │
├───────────────────────────────────┬──────────────────────────┤
│ 결함 Burn Up                      │ 상태 분포                │
│ [Line Chart]                      │ [Donut]                  │
│ 등록 128 / 조치 92 / Gap 36      │                          │
├────────────────────┬──────────────┴──────────────────────────┤
│ Priority별         │ 환경별                                  │
│ [Bar]              │ [Bar]                                   │
├────────────────────┴─────────────────────────────────────────┤
│ 관리 필요                                                   │
│ Critical / 미지정 / 장기미처리 / 배포대기 / 재검증대기      │
└──────────────────────────────────────────────────────────────┘
```

---

# 38. 설정 화면

Quality Admin 전용.

## 38.1 프로젝트 설정

```text
고객사명
[A은행__________________]

프로젝트명
[Gen AI 플랫폼 구축_____]
```

---

## 38.2 발생환경 설정

```text
환경

[개발계       ] [삭제]
[테스트계     ] [삭제]
[검증계       ] [삭제]

[+ 환경 추가]
```

저장 즉시 신규 Issue 등록 화면 Select에 적용한다.

기존 Issue의 환경값은 이력 보존을 위해 임의 삭제하지 않는다.

---

## 38.3 Priority 설정

기본:

- Critical
- Major
- Minor

프로젝트별 Tailoring이 가능하되, 기존 Issue 데이터와 통계 영향에 대한 경고를 표시한다.

---

## 38.4 사용자 관리

표시:

| 사번 | 이름 | 소속 | 관리자 |
|---|---|---|---|
| 12345678 | 김성훈 | AX리스크/품질팀 | Yes |

Quality Admin 지정/해제가 가능해야 한다.

---

## 38.5 프로젝트 운영 설정

권장 설정:

- 장기 미조치 기준 일수
- 첨부파일 최대 크기
- 허용 확장자
- Close 시 합의 Comment 정책
- 배포정보 사용 여부
- Change Reference 사용 여부

---

# 39. Quality Admin UX

Quality Admin은 모든 데이터를 수정할 수 있다.

단, 관리자 수정은 일반 사용자보다 더 강한 권한이므로 모든 변경을 History에 기록한다.

예:

```text
14:35 김성훈 (Quality Admin)

Priority 변경
Major → Critical
```

또는:

```text
14:40 김성훈 (Quality Admin)

상태 변경
Done → In Progress

사유
고객 재검증 결과 동일 현상 발생
```

관리자가 변경한 데이터도 이력을 삭제할 수 없다.

---

# 40. Badge 규칙

## Status

- Open: Neutral/Gray
- In Progress: Blue
- Done: Cyan or Purple
- Closed: Green
- Cancel: Gray/Dark

## Priority

- Critical: Danger
- Major: Warning
- Minor: Neutral/Blue Gray

Color만으로 상태를 표현하지 않고 Text를 함께 표시한다.

---

# 41. Form 규칙

기본 높이:

`36~40px`

Textarea:

최소 `80~120px`

필수 항목:

`*`

Validation 오류:

- Red Border
- 입력 바로 아래 짧은 메시지

예:

```text
재현 절차를 1단계 이상 입력해주세요.
```

---

# 42. Button 규칙

## Primary

- 등록
- 저장
- 조치 완료
- 배포 완료
- 정상 확인 · Close

Primary Blue + White Text

## Secondary

- 취소
- 목록
- 수정
- 파일 추가

White + Gray Border

## Warning / Destructive

- 재조치 요청
- Cancel

필요한 경우에만 사용한다.

---

# 43. Modal 사용 원칙

Modal은 다음과 같이 짧은 의사결정 또는 추가 입력이 필요한 Action에만 사용한다.

- Assignee 변경
- Priority 변경
- 조치 완료
- 재조치 요청
- Close
- 배포 완료
- Cancel

긴 Form은 Modal에 넣지 않는다.

---

# 44. Search

Global Search 또는 Issue List Search에서 다음 검색을 지원한다.

- Issue ID
- 제목/현상
- Reporter
- Assignee
- Comment

예:

```text
DEF-0023
```

또는:

```text
로그인
```

---

# 45. Loading / Error UX

## 저장 중

Button Disabled + Spinner

```text
저장 중...
```

## 저장 실패

사용자 입력을 초기화하지 않는다.

```text
저장에 실패했습니다.
입력한 내용은 유지됩니다.
다시 시도해주세요.

[다시 시도]
```

## 데이터 조회 실패

```text
데이터를 불러오지 못했습니다.

[다시 불러오기]
```

---

# 46. Empty State

예:

```text
현재 조치할 Issue가 없습니다.

새 Issue가 배정되면 이곳에서 확인할 수 있습니다.
```

또는:

```text
등록된 결함이 없습니다.

[+ 결함 등록]
```

---

# 47. Accessibility

최소 준수사항:

- Keyboard Focus 표시
- Color + Text 동시 사용
- Button 최소 Click 영역 확보
- Label과 Input 연결
- Error Message를 입력항목 인접 위치에 표시
- Chart의 핵심 값은 숫자로도 제공
- Icon만 있는 Button에는 Tooltip 또는 Accessible Label 제공

---

# 48. Responsive

우선 지원:

`Desktop 1440px 이상`

최소 지원:

`1280px`

1280px에서는:

- Sidebar 유지
- Dashboard Card 재배치
- Table Horizontal Scroll
- Filter Area Wrap
- Issue Detail의 2-Column 영역은 필요 시 1-Column 전환

Mobile App은 MVP 범위가 아니다.

---

# 49. 구현 Component 구조

권장:

```text
components/

  layout/
    AppLayout
    Sidebar
    Header
    PageContainer

  common/
    Button
    Card
    Badge
    Input
    Textarea
    Select
    Modal
    Tabs
    FileUpload
    UserDisplay
    EmptyState

  issue/
    IssueTypeSelector
    DefectForm
    ImprovementForm
    InquiryForm
    IssueSummary
    IssueDetail
    IssueActionBar
    IssueComment
    IssueTimeline
    AssigneeSelector
    PrioritySelector
    DeploymentPanel
    TraceabilityPanel

  kanban/
    KanbanBoard
    KanbanColumn
    IssueCard

  list/
    IssueTable
    IssueFilter

  dashboard/
    DashboardFilter
    KPICard
    DailyActivityChart
    BurnUpChart
    StatusChart
    PriorityChart
    EnvironmentChart
    AttentionList

  settings/
    ProjectSettings
    EnvironmentSettings
    PrioritySettings
    UserSettings
    OperationSettings
```

---

# 50. 주요 화면 목록

MVP 화면:

1. 로그인 / 사용자 등록
2. Dashboard
3. Issue Type 선택
4. Defect 등록
5. Improvement 등록
6. Inquiry 등록
7. Issue Kanban
8. Issue List
9. Issue Detail
10. MY
11. Project 설정
12. Environment 설정
13. User 관리

별도 `결함 조치 화면`을 만들지 않고 **Issue Detail에서 조치/Comment/배포/Timeline을 통합 처리**한다.

---

# 51. 구현 금지사항

다음 구현은 금지한다.

- 외부 CDN 의존
- 외부 API 의존
- 실제 기능이 없는 AI 추천 Panel
- 입력자가 Assignee를 반드시 선택하도록 강제
- 입력자가 Priority를 반드시 선택하도록 강제
- Kanban Drag & Drop으로 상태 직접 변경
- 상태 변경이 History에 남지 않는 구조
- 관리자 수정이 History 없이 덮어써지는 구조
- 화면마다 Sidebar/Button 스타일 변경
- 과도한 Neon/Animation
- 긴 Form을 여러 Step으로 불필요하게 분리
- Dashboard에 의미 없는 장식성 Chart 추가

---

# 52. 개발 구현 우선순위

## P0

반드시 구현:

- 사용자 식별
- Project 설정
- Environment 설정
- Defect / Improvement / Inquiry 등록
- Issue Detail
- Assignee
- Priority
- Comment
- Timeline
- Status Action
- Kanban
- List
- MY
- Quality Admin 권한
- Dashboard KPI
- 일자별 등록/조치 Chart
- Burn Up Chart
- Drill-down

## P1

MVP 내 가능하면 구현:

- 첨부파일
- Change Reference
- Target Version
- Deployment 정보
- 변경 Before/After 보기
- 장기 미조치 관리
- Backup Status

## P2

향후 확장:

- CI/CD 자동연동
- SSO
- 조직도 연동
- AI 분석/추천
- Notification
- Report Export

---

# 53. 디자인 시안 적용 시 변경해야 할 부분

첨부된 현재 디자인 시안을 구현할 때 다음과 같이 변경한다.

## 로그인

기존:

```text
아이디
비밀번호
아이디 저장
```

변경:

```text
사번
이름 / 소속 최초 등록

재접속 시:
김성훈 (AX리스크/품질팀)으로 시작
```

---

## Sidebar

기존의 다음 메뉴는 MVP에서 제거한다.

- 요구사항관리
- 프로젝트관리
- 이슈/위험관리
- 보고서

변경:

```text
Dashboard
Issue 관리
MY
+ Issue 등록
설정
```

---

## 결함 등록

기존 Step Wizard 및 다음 항목을 제거한다.

- 결함유형 분류
- 등록자가 선택하는 Priority
- 등록자가 선택하는 Assignee
- AI 유사결함 추천
- AI 입력 도우미

대신 재현 중심 1-Page Form으로 변경한다.

---

## 결함 조치

별도 `결함 조치` 메뉴/화면보다 Issue Detail에서 처리한다.

추가:

- Assignee
- Priority
- Comment
- Action Button
- Change Reference
- Deployment
- Timeline

---

## Dashboard

현재의 Burn Up Chart 디자인 방향은 유지한다.

반드시 추가/정정:

- 일자별 신규 등록 / 조치 완료 Bar Chart
- 누적 등록 / 누적 조치 Burn Up
- Gap 숫자 표시
- 상태별 현황
- Priority별 현황
- 환경별 현황
- 관리 필요 목록
- KPI/Chart Drill-down

AI 품질 인사이트 Card는 MVP에서 제거한다.

---

# 54. Claude Code / 개발 AI 전달용 구현 지시문

```text
첨부된 UI 디자인 시안의 Visual Identity와 본 UI_DESIGN_GUIDE.md를 기준으로
금융권 폐쇄망용 경량 결함관리 서비스를 구현해줘.

중요한 점은 기존 디자인 이미지의 기능을 그대로 구현하는 것이 아니라,
UI_DESIGN_GUIDE.md에 정의된 실제 기능 요구사항을 기준으로 화면을 재구성하는 것이다.

서비스는 외부 인터넷, 외부 CDN, 외부 API, GitHub/Jira를 사용할 수 없는
폐쇄망 환경에서 실행된다.

로그인은 비밀번호 방식이 아니라 사번 기반 사용자 식별 방식을 사용한다.
최초 사용 시 사번/이름/소속을 등록하고 이후 동일 브라우저에서는
기존 사용자를 빠르게 선택할 수 있도록 한다.

Issue Type은 Defect / Improvement / Inquiry 3개이다.

Defect 등록은 복잡한 Wizard가 아니라 1-Page Simple Form으로 구현한다.
Reporter에게 Assignee나 Priority를 입력시키지 않는다.

Defect 필수 입력은 다음과 같다.
- 발생 위치
- 발생 환경
- 발생 현상
- 재현 절차
- 기대 결과

각 입력항목에는 사용자가 바로 이해할 수 있는 Sample을 표시한다.

Assignee와 Priority는 Assignee 또는 Quality Admin이 관리한다.

기본 Workflow는:
Open → In Progress → Done → Closed

상태 변경은 Kanban Drag & Drop이 아니라 Issue Detail의 Action Button을 통해 수행한다.

Issue Detail은 다음을 통합한다.
- 기본정보
- 등록내용
- Assignee / Priority
- 조치 Action
- Comment
- Change Reference
- Deployment 정보
- Timeline

Reporter는 본인이 등록한 내용을 수정하고 Comment를 추가할 수 있다.
Assignee는 조치자/우선순위/상태를 변경할 수 있다.
Quality Admin은 모든 Issue 및 설정을 수정할 수 있다.
모든 주요 변경은 Timeline History에 남아야 한다.

Assignee가 직접 Close하는 경우 고객/업무담당자와 합의한 내용을
필수 Comment로 입력받는다.

Dashboard는 Quality Admin/Test Manager 중심으로 구성한다.

Dashboard 필수 요소:
- 전체/Open/In Progress/Done/Closed KPI
- Critical
- 담당자 미지정
- 장기 미조치
- Re-open
- 일자별 신규 등록 / 조치 완료 Bar Chart
- 누적 등록 / 누적 조치 Burn Up Chart
- 미조치 Gap
- 상태별 분포
- Priority별 분포
- 환경별 분포
- 관리 필요 목록
- 모든 주요 KPI/Chart의 Issue List Drill-down

CI/CD를 자동 연동하지는 않지만 Traceability를 위해
Issue ID, Change Reference, Target Version, Deployment Environment,
Deployment Version, Deployment Date를 저장할 수 있도록 구현한다.

디자인은 Dark Navy Sidebar + Dark Header + White Main Workspace를 유지하고,
KT Logo는 Sidebar 왼쪽 하단에 약 32~40px 폭으로 배치한다.

로그인 화면에서는 AI Agent의 미래지향적 Visual Identity를 사용할 수 있으나,
로그인 이후 업무화면에서는 Enterprise 시스템의 가독성과 업무효율을 최우선으로 한다.

실제 AI 기능이 구현되지 않았으므로
AI 추천, AI 유사결함 분석, AI 품질 인사이트 등
동작하지 않는 UI는 구현하지 않는다.

모든 Component는 재사용 가능한 구조로 구현하고
외부 CDN이나 외부 Resource에 의존하지 않도록 한다.
```

---

# 55. 최종 디자인 원칙

> **Simple Registration + Clear Ownership + Complete Traceability + Actionable Quality Dashboard**

본 서비스의 화면은 화려한 결함관리 시스템을 만드는 것이 목적이 아니다.

사용자가 쉽게 등록하고,  
조치자가 빠르게 처리하고,  
고객/등록자가 검증하고,  
품질담당자가 전체 흐름을 추적할 수 있어야 한다.

특히 다음 질문에 화면만으로 즉시 답할 수 있어야 한다.

1. **어떤 결함이 발생했는가?**
2. **어떻게 재현하는가?**
3. **누가 조치하고 있는가?**
4. **어떻게 조치했는가?**
5. **어떤 변경/버전에 반영되었는가?**
6. **어디에 배포되었는가?**
7. **누가 어떤 근거로 종료했는가?**
8. **현재 프로젝트의 결함 발생 속도보다 조치 속도가 따라가고 있는가?**

이 8개 질문에 답할 수 있는 UI를 본 서비스의 완료 기준으로 한다.
