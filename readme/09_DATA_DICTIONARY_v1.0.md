# 09. Data Dictionary v1.0

## 1. Issue Common
| Field | Type | 필수 | 설명 |
|---|---|---:|---|
| id | string | Y | DEF/IMP/INQ ID |
| type | enum | Y | DEFECT/IMPROVEMENT/INQUIRY |
| revision | int | Y | Optimistic concurrency |
| title | string | Y | 목록/카드 표시용 요약 |
| priority | enum | Y | CRITICAL/MAJOR/MINOR/UNASSIGNED |
| status | enum | Y | OPEN/IN_PROGRESS/DONE/CLOSED/CANCEL |
| reporter | object | Y | 등록자 Snapshot |
| assignee | object/null | N | 현재 조치자 Snapshot |
| attachments | array | N | 첨부 메타 |
| comments | array | N | Comment |
| history | array | Y | Timeline Event |
| createdAt | datetime | Y | ISO8601 +09:00 |
| updatedAt | datetime | Y | 최종 수정시각 |

## 2. Defect
| Field | Type | 필수 | 설명 |
|---|---|---:|---|
| location | string | Y | 화면/기능 위치 |
| environment | object | Y | 발생환경 Snapshot |
| symptom | text | Y | 발생 현상 |
| reproductionSteps | array | Y | 재현 절차 |
| expectedResult | text | Y | 기대 결과 |
| resolution | object | N | 조치 결과/Change Reference |
| deployment | object | N | 배포 정보 |
| close | object | N | Close 유형/근거 |

## 3. Improvement
| Field | Type | 필수 | 설명 |
|---|---|---:|---|
| target | string | Y | 개선 대상 |
| request | text | Y | 개선 내용 |
| reason | text | N | 개선 필요 사유 |

## 4. Inquiry
| Field | Type | 필수 | 설명 |
|---|---|---:|---|
| target | string | Y | 문의 대상 |
| question | text | Y | 문의 내용 |

## 5. Reporter/Assignee Snapshot
```json
{
  "userId": "U-000012",
  "employeeId": "12345678",
  "nameSnapshot": "김성훈",
  "teamSnapshot": "AX리스크/품질팀"
}
```

Snapshot을 저장하는 이유:
사용자의 이름/소속이 이후 변경되어도 과거 이력의 당시 표시를 유지.

## 6. Resolution
| Field | Type | 설명 |
|---|---|---|
| description | text | 처리결과 |
| changeReference | string | Commit/Revision/Change ID |
| targetVersion | string | 반영 예정 버전 |
| resolvedBy | userId | 최신 조치완료자 |
| resolvedAt | datetime | 최신 Done 시각 |
| firstResolvedAt | datetime | 최초 Done 시각, Burn Up 기준 |

## 7. Deployment
| Field | Type | 설명 |
|---|---|---|
| status | enum | NOT_DEPLOYED/DEPLOYED |
| environmentId | string | 배포 환경 |
| environmentNameSnapshot | string | 환경명 Snapshot |
| version | string | 배포버전 |
| deployedAt | datetime | 배포시각 |
| deployedBy | userId | 배포정보 등록자 |

## 8. Close
| Field | Type | 설명 |
|---|---|---|
| type | enum | VERIFIED/AGREED |
| comment | text | 종료 확인/합의내용 |
| closedBy | userId | 종료자 |
| closedAt | datetime | 최신 종료시각 |
| firstClosedAt | datetime | 최초 종료시각 |

## 9. Comment
| Field | Type | 설명 |
|---|---|---|
| commentId | string | ID |
| author | snapshot | 작성자 |
| body | text | 내용 |
| attachments | array | 첨부 |
| createdAt | datetime | 작성시각 |
| hidden | bool | 관리자 숨김 여부 |

## 10. History
| Field | Type | 설명 |
|---|---|---|
| eventId | string | Event ID |
| eventType | enum | CREATED 등 |
| actor | snapshot | 수행자 |
| timestamp | datetime | 발생시각 |
| before | object | 변경 전 |
| after | object | 변경 후 |
| comment | text | 사유/설명 |

## 11. User
| Field | Type | 설명 |
|---|---|---|
| userId | string | 내부 ID |
| employeeId | string | 사번 Unique |
| name | string | 이름 |
| team | string | 소속 |
| isQualityAdmin | bool | 관리자 |
| active | bool | 활성 |
| createdAt | datetime | 생성 |
| updatedAt | datetime | 수정 |

## 12. Environment
| Field | Type | 설명 |
|---|---|---|
| id | string | 내부 ID |
| code | string | 안정적인 내부 코드 |
| displayName | string | 고객사 사용 명칭 |
| active | bool | 신규 선택 가능 여부 |
| order | int | 표시 순서 |

## 13. 주요 계산 필드
### stale
현재 Open/In Progress이고 기준일 이상 updatedAt 또는 조치 이벤트가 없는 건.
정확한 정의는 운영설정 `staleIssueDays` 사용.

### waitingDeploy
status=DONE and deployment.status=NOT_DEPLOYED

### waitingVerification
배포 기능 사용 시 status=DONE and DEPLOYED
배포 기능 미사용 시 status=DONE
