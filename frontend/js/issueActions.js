/**
 * Issue 상태전이 "다음 작업(Primary Action)" 판단 + 실행 공용 모듈.
 * 상세 화면(detail.js)과 Kanban 드래그앤드롭이 동일한 기준으로 동작하도록 이 모듈만 참조한다.
 * 권한 판단은 백엔드 permissions.js와 1:1 대응(서버가 최종 검증하므로 여기서는 UI 힌트 목적).
 */
import { api } from './api.js';
import { store } from './store.js';
import { toast, errorMessage, formModal } from './ui.js';

const isAdmin = (user) => !!(user && user.isQualityAdmin);
const isReporter = (user, issue) => !!(user && issue && issue.reporterId === user.userId);
const isAssignee = (user, issue) => !!(user && issue && issue.assigneeId === user.userId);
const canWorkflow = (user, issue) => isAdmin(user) || isAssignee(user, issue);

/**
 * 상태별 Primary Action 1개를 순수하게 판단한다(부수효과 없음).
 * "내게 배정"(CLAIM)은 배정 전용 버튼/흐름으로 별도 처리하므로 여기서는 다루지 않는다
 * (드래그 가능 여부 = 이 함수가 값을 반환하는지로만 판단 → 미배정 카드는 항상 드래그 불가).
 * needsAssignee: 이 액션을 실행하려면 "내가 조치자"여야 하는지(START/RESOLVE). CLOSE_*는 Reporter/Assignee
 *   중 하나의 권한만 있으면 되므로 false — 서버에 조치자 인계(assign) 권한이 없는 일반 사용자도 그대로 실행 가능하다
 *   (assign 액션 자체가 "현재 조치자 또는 Admin만 인계 가능"이라 남의 배정을 강제로 가져올 수 없다).
 * @param {{status:string, reporterId:string|null, assigneeId:string|null}} issue - 목록 요약(toSummary) 형태.
 *   상세 API 응답을 넘길 때는 toActionIssue()로 변환해서 넘긴다.
 * 반환: { key, label, variant, needsAssignee } | null — key는 runPrimaryAction()에 그대로 전달한다.
 */
export function getPrimaryAction(issue, user) {
  const st = issue.status;
  if (canWorkflow(user, issue) && st === 'OPEN') return { key: 'START', label: '조치 시작', variant: 'btn-primary', needsAssignee: true };
  if (canWorkflow(user, issue) && st === 'IN_PROGRESS') return { key: 'RESOLVE', label: '조치 완료', variant: 'btn-primary', needsAssignee: true };
  if (st === 'DONE') {
    const canVerified = isAdmin(user) || isReporter(user, issue);
    const canAgreed = isAdmin(user) || isAssignee(user, issue);
    // 상세 화면 nextAction()과 동일한 우선순위: 정상 확인(Reporter/Admin)을 합의 Close(Assignee/Admin)보다 우선한다.
    if (canVerified) return { key: 'CLOSE_VERIFIED', label: '정상 확인', variant: 'btn-success', needsAssignee: false };
    if (canAgreed) return { key: 'CLOSE_AGREED', label: isAdmin(user) ? '합의 Close' : 'Close', variant: 'btn-success', needsAssignee: false };
  }
  return null;
}

/** 상세 API 응답(issue.reporter/assignee가 객체)을 getPrimaryAction이 기대하는 요약 형태로 변환 */
export function toActionIssue(detailIssue) {
  return {
    status: detailIssue.status,
    reporterId: detailIssue.reporter ? detailIssue.reporter.userId : null,
    assigneeId: detailIssue.assignee ? detailIssue.assignee.userId : null,
  };
}

/**
 * key에 해당하는 액션을 실행한다. 필수 입력이 있는 액션은 formModal을 띄운다.
 * mutate: (fn) => Promise — 409(revision 충돌) 등 공통 에러 처리를 호출부(run 래퍼)가 감싸도록 위임.
 * 성공 시 onSuccess(), 실패(취소 포함) 시 아무 것도 하지 않는다(카드는 원위치 유지).
 */
export function runPrimaryAction(key, issue, { mutate, onSuccess }) {
  const op = store.operation || {};
  const call = async (fn, msg) => {
    await mutate((rev) => fn(rev), msg);
    if (onSuccess) onSuccess();
  };

  if (key === 'START') return call((rev) => api.issues.action(issue.id, 'start', { expectedRevision: rev }), '조치를 시작했습니다. (접수 → 조치중)');

  // 나머지는 필수 입력을 받는 모달을 띄운다. 사용자가 취소하면 formModal이 조용히 닫히고 아무 일도 일어나지 않는다(카드 원위치 유지).
  if (key === 'RESOLVE') {
    formModal({
      title: '조치 완료',
      description: '처리 결과를 남기면 확인대기 상태가 되며 등록자가 재검증합니다.',
      fields: [
        { name: 'description', label: '처리 결과', type: 'textarea', required: true, placeholder: '예) 로그인 Token 검증 로직 오류를 수정했습니다.', rows: 4 },
        ...(op.enableChangeReference ? [{ name: 'changeReference', label: 'Change Reference', placeholder: 'Commit / Revision / Change ID' }] : []),
        { name: 'targetVersion', label: '반영 예정 버전', placeholder: '예) Release 1.2.3' },
      ],
      submitLabel: '조치 완료',
      onSubmit: (v) => call((rev) => api.issues.action(issue.id, 'resolve', { expectedRevision: rev, resolution: v }), '조치 완료 처리되었습니다. (조치중 → 확인대기)'),
    });
    return;
  }
  if (key === 'CLOSE_VERIFIED') {
    formModal({
      title: '정상 확인',
      description: '재검증 결과 정상 동작을 확인했습니다.',
      fields: [{ name: 'comment', label: '확인 내용 (선택)', type: 'textarea', placeholder: '예) 검증계에서 정상 동작 확인' }],
      submitLabel: '정상 확인',
      submitVariant: 'btn-success',
      onSubmit: (v) => call((rev) => api.issues.action(issue.id, 'close', { expectedRevision: rev, closeType: 'VERIFIED', comment: v.comment }), 'Close 되었습니다. (정상 확인)'),
    });
    return;
  }
  if (key === 'CLOSE_AGREED') {
    formModal({
      title: '결함을 종료하시겠습니까?',
      description: '가능하면 고객/등록자가 직접 확인 후 종료하는 것을 권장합니다.\n조치자가 종료하는 경우 확인/합의 내용을 남겨주세요.',
      fields: [{ name: 'comment', label: '확인/합의 내용', type: 'textarea', required: true, placeholder: '예) 김OO 책임과 검증계 정상동작을 확인하였으며 해당 결함을 종료하기로 협의함.', rows: 4 }],
      submitLabel: 'Close',
      submitVariant: 'btn-success',
      onSubmit: (v) => call((rev) => api.issues.action(issue.id, 'close', { expectedRevision: rev, closeType: 'AGREED', comment: v.comment }), 'Close 되었습니다. (합의 종료)'),
    });
    return;
  }
}

export function actionErrorToast(err, reload) {
  toast(err.isConflict ? '다른 사용자가 먼저 변경했습니다. 목록을 새로고침합니다.' : errorMessage(err), 'error');
  if (reload) reload();
}
