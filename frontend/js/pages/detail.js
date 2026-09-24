/**
 * SCR-032 Issue Detail. Summary / 등록내용 / 조치·Traceability / Action Bar / Timeline / Composer.
 * 모든 Mutation은 expectedRevision 포함. 409 시 conflict 안내 + 최신 재조회.
 */
import { api } from '../api.js';
import { store } from '../store.js';
import {
  h, clear, card, statusBadge, priorityBadge, typeBadge, deployBadge, fmtDateTime, fmtBytes, userLabel, initials, toast, errorMessage, errorBox, conflictBox,
  loadingState, formModal, confirmModal, openModal, copyText, setBusy, EVENT_LABEL, STATUS_LABEL, STATUS_KO, CLOSE_LABEL, localDateTimeValue, josa,
} from '../ui.js';

const FIELD_LABEL = {
  location: '발생 위치', environment: '발생 환경', symptom: '발생 현상', reproductionSteps: '재현 절차', expectedResult: '기대 결과',
  target: '대상', request: '개선 내용', reason: '개선 필요 사유', question: '문의 내용', status: '상태', priority: 'Priority', assignee: '조치자', deployment: '배포',
};

/** 환경 표시: 설정의 현재 이름 우선(삭제된 환경은 스냅샷) */
function envName(env) {
  const cur = store.project && store.project.environments.find((e) => e.id === env.id);
  return (cur && cur.displayName) || env.displayNameSnapshot || env.id;
}

function fieldValueText(k, v) {
  if (v == null) return '(없음)';
  if (k === 'reproductionSteps' && Array.isArray(v)) return v.map((s) => `${s.order}. ${s.text}`).join('\n');
  if (k === 'environment') return v.displayNameSnapshot || v.id;
  if (k === 'assignee') return v ? userLabel(v) : '미지정';
  if (k === 'status') return `${STATUS_KO[v]} · ${STATUS_LABEL[v]}`;
  if (k === 'priority') return store.priorityName(v);
  if (k === 'deployment') return v && v.status === 'DEPLOYED' ? `${v.environmentNameSnapshot || ''} ${v.version || ''}`.trim() : '미배포';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

export async function renderDetail(main, { params, navigate }) {
  const issueId = params.id;
  let data = null;
  let conflict = false;
  const root = h('div', {});
  main.append(root);
  try {
    await store.refreshProject({ silent: true });
  } catch {
    /* 기존 캐시 사용 */
  }

  async function load({ silent = false } = {}) {
    if (!silent) clear(root).append(loadingState(8));
    try {
      data = await api.issues.get(issueId);
      conflict = false;
      draw();
    } catch (err) {
      clear(root).append(err.status === 404 ? h('div', { class: 'forbidden' }, h('h2', {}, 'Issue를 찾을 수 없습니다'), h('p', { class: 'muted' }, issueId), h('a', { class: 'btn btn-secondary', href: '#/issues/list' }, '목록으로')) : errorBox(err, () => load()));
    }
  }

  /** mutation 공통 래퍼: 409 → conflict 표시 후 재조회 */
  async function run(fn, successMsg) {
    try {
      await fn(data.issue.revision);
      if (successMsg) toast(successMsg, 'success');
      await load({ silent: true });
    } catch (err) {
      if (err.isConflict) {
        conflict = true;
        draw();
        throw err;
      }
      throw err;
    }
  }

  function draw() {
    const { issue, permissions: p } = data;
    const op = store.operation || {};
    const me = store.user;
    clear(root);
    if (conflict) root.append(conflictBox(() => load()));

    /* ---------- Summary ---------- */
    const idCopy = h('button', { class: 'btn btn-secondary btn-xs', onClick: () => copyText(issue.id).then(() => toast(`${issue.id} 복사됨 · Commit 예: [${issue.id}] 수정내용`, 'info')) }, 'ID 복사');
    const summaryHead = h('div', { class: 'summary-head' }, h('span', { class: 'id' }, issue.id), idCopy, typeBadge(issue.type, true), priorityBadge(issue.priority, true), statusBadge(issue.status, true), issue.reopenCount ? h('span', { class: 'badge warn badge-lg' }, `Re-open ${issue.reopenCount}회`) : null, issue.status === 'DONE' && op.enableDeployment ? deployBadge(issue.deployment && issue.deployment.status) : null);
    const summaryActions = h('div', { class: 'flex' });
    if (p.canEditContent && issue.status !== 'CANCEL') summaryActions.append(h('button', { class: 'btn btn-secondary btn-sm', onClick: openEdit }, '등록내용 수정'));
    if (p.canAdminOverride) summaryActions.append(h('button', { class: 'btn btn-ghost btn-sm', onClick: openAdminOverride }, '관리자: 상태 강제 변경'));
    const summary = h(
      'section',
      { class: 'card' },
      h(
        'div',
        { class: 'card-body' },
        h('div', { class: 'flex', style: { justifyContent: 'space-between', alignItems: 'flex-start' } }, summaryHead, summaryActions),
        h('h1', { class: 'summary-title' }, issue.title),
        h(
          'div',
          { class: 'meta-grid' },
          h('div', {}, h('div', { class: 'k' }, '등록자'), h('div', { class: 'v' }, userLabel(issue.reporter))),
          h('div', {}, h('div', { class: 'k' }, '조치자'), h('div', { class: 'v' }, issue.assignee ? userLabel(issue.assignee) : h('span', { class: 'badge warn' }, '미지정 ⚠'))),
          h('div', {}, h('div', { class: 'k' }, '환경'), h('div', { class: 'v' }, issue.environment ? envName(issue.environment) : '-')),
          h('div', {}, h('div', { class: 'k' }, '등록일'), h('div', { class: 'v' }, fmtDateTime(issue.createdAt), ' ', h('small', {}, `· 업데이트 ${fmtDateTime(issue.updatedAt)}`)))
        )
      )
    );

    /* ---------- 등록 내용 ---------- */
    const block = (title, body) => h('div', { class: 'content-block' }, h('h4', {}, title), body);
    const contentBody = h('div', {});
    if (issue.type === 'DEFECT') {
      contentBody.append(
        block('발생 위치', h('div', { class: 'body' }, issue.location)),
        block('발생 현상', h('div', { class: 'body' }, issue.symptom)),
        block('재현 절차', h('ol', {}, ...(issue.reproductionSteps || []).map((s) => h('li', {}, s.text)))),
        block('기대 결과', h('div', { class: 'body' }, issue.expectedResult))
      );
    } else if (issue.type === 'IMPROVEMENT') {
      contentBody.append(block('개선 대상', h('div', { class: 'body' }, issue.target)), block('개선 내용', h('div', { class: 'body' }, issue.request)), issue.reason ? block('개선 필요 사유', h('div', { class: 'body' }, issue.reason)) : null);
    } else {
      contentBody.append(block('문의 대상', h('div', { class: 'body' }, issue.target)), block('문의 내용', h('div', { class: 'body' }, issue.question)));
    }
    contentBody.append(block('첨부파일', attachmentList(issue, p)));
    const content = card(`${{ DEFECT: '결함', IMPROVEMENT: '개선요청', INQUIRY: '문의' }[issue.type]} 내용`, contentBody);

    /* ---------- Action Bar ---------- */
    const actions = h('div', { class: 'action-bar' });
    const st = issue.status;
    if (st !== 'CLOSED' && st !== 'CANCEL' && p.canClaim) actions.append(h('button', { class: 'btn btn-primary', onClick: doClaim }, '내가 조치'));
    if (p.canStart) actions.append(h('button', { class: 'btn btn-primary', onClick: doStart }, '조치 시작'));
    if (p.canResolve) actions.append(h('button', { class: 'btn btn-primary', onClick: openResolve }, '조치 완료'));
    if (p.canDeploy && !(issue.deployment && issue.deployment.status === 'DEPLOYED' && st === 'CLOSED')) actions.append(h('button', { class: 'btn btn-secondary', onClick: openDeploy }, issue.deployment && issue.deployment.status === 'DEPLOYED' ? '배포 정보 갱신' : '배포 완료'));
    if (st === 'DONE' && p.isReporter && !p.isAdmin) actions.append(h('div', { class: 'note' }, '조치가 완료되었습니다. 재검증 후 결과를 선택해주세요.'));
    if (p.canReopen) actions.append(h('button', { class: 'btn btn-warning', onClick: openReopen }, st === 'CLOSED' ? 'Re-open' : '재조치 요청'));
    if (p.canCloseVerified) actions.append(h('button', { class: 'btn btn-success', onClick: openCloseVerified }, '정상 확인 · Close'));
    if (p.canCloseAgreed && !(p.canCloseVerified && !p.isAdmin)) actions.append(h('button', { class: `btn ${p.canCloseVerified ? 'btn-secondary' : 'btn-success'}`, onClick: openCloseAgreed }, p.isAdmin ? '합의 Close' : 'Close'));
    if (p.canCancel) actions.append(h('button', { class: 'btn btn-danger-outline', onClick: openCancel }, 'Cancel'));
    if (!actions.childElementCount) actions.append(h('div', { class: 'note' }, st === 'CLOSED' ? '종료된 Issue입니다.' : st === 'CANCEL' ? `취소된 Issue입니다. ${issue.cancelReason ? `사유: ${issue.cancelReason}` : ''}` : issue.assignee ? '현재 수행 가능한 Action이 없습니다. 조치자 또는 Quality Admin이 진행합니다.' : '조치자가 지정되지 않았습니다. [내가 조치]로 배정받거나 Quality Admin이 배정합니다.'));
    const actionCard = card('Action', actions);

    /* ---------- Timeline ---------- */
    const timeline = card('Timeline', buildTimeline(issue, p), { headRight: h('span', { class: 'small muted' }, 'System Event + Comment 시간순') });

    /* ---------- Composer ---------- */
    const composer = buildComposer(issue, p);

    /* ---------- Side: 조치/Traceability ---------- */
    const sideKv = h(
      'div',
      { class: 'side-kv' },
      h('div', { class: 'row' }, h('span', { class: 'k' }, '조치자'), h('span', { class: 'v' }, issue.assignee ? userLabel(issue.assignee) : h('span', { class: 'badge warn' }, '미지정'), p.canAssign ? h('button', { class: 'btn btn-ghost btn-xs', onClick: openAssign }, '변경') : null)),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Priority'), h('span', { class: 'v' }, priorityBadge(issue.priority), p.canChangePriority ? h('button', { class: 'btn btn-ghost btn-xs', onClick: openPriority }, '변경') : null)),
      h('div', { class: 'row' }, h('span', { class: 'k' }, '상태'), h('span', { class: 'v' }, statusBadge(issue.status)))
    );
    const r = issue.resolution;
    const d = issue.deployment || {};
    const traceRow = (k, v, mono) => h('div', {}, h('div', { class: 'k' }, k), h('div', { class: `v${v ? '' : ' empty'}${mono && v ? ' mono' : ''}` }, v || '-'));
    const trace = h(
      'div',
      { class: 'trace' },
      h('div', { style: { gridColumn: '1 / -1' } }, h('div', { class: 'k' }, '조치 결과'), h('div', { class: `v pre${r && r.description ? '' : ' empty'}` }, (r && r.description) || '-')),
      op.enableChangeReference ? traceRow('Change Reference', r && r.changeReference, true) : null,
      traceRow('반영 예정 버전', r && r.targetVersion),
      traceRow('최초 조치완료', r && r.firstResolvedAt ? fmtDateTime(r.firstResolvedAt) : null),
      traceRow('최근 조치완료', r && r.resolvedAt ? fmtDateTime(r.resolvedAt) : null),
      op.enableDeployment ? h('div', { style: { gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: '10px' } }, h('div', { class: 'k' }, '배포'), h('div', { class: 'v' }, deployBadge(d.status || 'NOT_DEPLOYED'), d.status === 'DEPLOYED' ? h('span', { style: { marginLeft: '8px' } }, `${d.environmentNameSnapshot || ''} ${d.version || ''} · ${fmtDateTime(d.deployedAt)}`) : null)) : null,
      issue.close && issue.close.type ? h('div', { style: { gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: '10px' } }, h('div', { class: 'k' }, `Close (${CLOSE_LABEL[issue.close.type] || issue.close.type})`), h('div', { class: 'v pre' }, issue.close.comment || '-'), h('div', { class: 'small muted' }, `최초 ${fmtDateTime(issue.close.firstClosedAt)} · 최근 ${fmtDateTime(issue.close.closedAt)}`)) : null
    );

    root.append(
      h('div', { class: 'flex mb-16', style: { justifyContent: 'space-between' } }, h('a', { class: 'btn btn-ghost btn-sm', href: '#/issues/list' }, '← 목록'), h('span', { class: 'small muted' }, `revision ${issue.revision}`)),
      h('div', { class: 'detail-grid' }, h('div', { class: 'detail-main' }, summary, content, actionCard, timeline, composer), h('aside', { class: 'detail-side' }, card('조치 / 배정', sideKv), card('조치 결과 · Traceability', trace)))
    );

    /* ================= Actions ================= */
    async function doClaim() {
      const ok = await confirmModal({ title: '내가 조치', message: `${issue.id}의 조치자를 나(${me.name})로 지정합니다.\n배정 후 실제 조치를 시작할 때 [조치 시작]을 선택하세요.`, confirmLabel: '내가 조치' });
      if (!ok) return;
      try {
        await run((rev) => api.issues.action(issue.id, 'claim', { expectedRevision: rev }), '조치자로 지정되었습니다.');
        if (issue.priority === 'UNASSIGNED') openPriority(true);
      } catch (err) {
        if (!err.isConflict) toast(errorMessage(err), 'error');
      }
    }
    async function doStart() {
      try {
        await run((rev) => api.issues.action(issue.id, 'start', { expectedRevision: rev }), '조치를 시작했습니다. (Open → In Progress)');
      } catch (err) {
        if (!err.isConflict) toast(errorMessage(err), 'error');
      }
    }
    function openResolve() {
      formModal({
        title: '조치 완료',
        description: '처리 결과를 남기면 Done(확인대기) 상태가 되며 등록자가 재검증합니다.',
        fields: [
          { name: 'description', label: '처리 결과', type: 'textarea', required: true, placeholder: '예) 로그인 Token 검증 로직 오류를 수정했습니다.', rows: 4 },
          ...(op.enableChangeReference ? [{ name: 'changeReference', label: 'Change Reference', placeholder: 'Commit / Revision / Change ID', help: `Commit message 권장: [${issue.id}] 수정 내용` }] : []),
          { name: 'targetVersion', label: '반영 예정 버전', placeholder: '예) Release 1.2.3' },
        ],
        submitLabel: '조치 완료',
        onSubmit: (v) => run((rev) => api.issues.action(issue.id, 'resolve', { expectedRevision: rev, resolution: v }), '조치 완료 처리되었습니다. (In Progress → Done)'),
      });
    }
    function openDeploy() {
      formModal({
        title: '배포 완료',
        description: '배포 정보는 상태와 별도로 기록됩니다. 배포자와 등록시각은 자동 저장됩니다.',
        fields: [
          { name: 'environmentId', label: '배포 환경', type: 'select', required: true, options: store.activeEnvironments().map((e) => ({ value: e.id, label: e.displayName })), value: (issue.environment && issue.environment.id) || undefined },
          { name: 'version', label: '배포 버전', placeholder: '예) Release 1.2.3', value: (r && r.targetVersion) || '' },
          { name: 'deployedAt', label: '배포 일시', type: 'datetime-local', required: true, value: localDateTimeValue() },
        ],
        submitLabel: '배포 완료',
        onSubmit: (v) => run((rev) => api.issues.deploy(issue.id, { expectedRevision: rev, environmentId: v.environmentId, version: v.version, deployedAt: v.deployedAt ? new Date(v.deployedAt).toISOString() : undefined }), '배포 완료가 기록되었습니다.'),
      });
    }
    function openReopen() {
      formModal({
        title: issue.status === 'CLOSED' ? 'Re-open' : '재조치 요청',
        description: '사유를 남기면 In Progress 상태로 돌아가 조치자가 재조치합니다.',
        fields: [{ name: 'reason', label: '재조치 사유', type: 'textarea', required: true, placeholder: '예) 검증계에서 동일 현상이 계속 발생합니다.' }],
        submitLabel: '재조치 요청',
        submitVariant: 'btn-warning',
        onSubmit: (v) => run((rev) => api.issues.action(issue.id, 'reopen', { expectedRevision: rev, reason: v.reason }), '재조치 요청되었습니다. (→ In Progress)'),
      });
    }
    function openCloseVerified() {
      formModal({
        title: '정상 확인 · Close',
        description: '재검증 결과 정상 동작을 확인했습니다. Close Type = VERIFIED',
        fields: [{ name: 'comment', label: '확인 내용 (선택)', type: 'textarea', placeholder: '예) 검증계에서 정상 동작 확인' }],
        submitLabel: '정상 확인 · Close',
        submitVariant: 'btn-success',
        onSubmit: (v) => run((rev) => api.issues.action(issue.id, 'close', { expectedRevision: rev, closeType: 'VERIFIED', comment: v.comment }), 'Close 되었습니다. (VERIFIED)'),
      });
    }
    function openCloseAgreed() {
      formModal({
        title: '결함을 종료하시겠습니까?',
        description: '가능하면 고객/등록자가 직접 확인 후 종료하는 것을 권장합니다.\n조치자가 종료하는 경우 확인/합의 내용을 남겨주세요. Close Type = AGREED',
        fields: [{ name: 'comment', label: '확인/합의 내용', type: 'textarea', required: true, placeholder: '예) 김OO 책임과 검증계 정상동작을 확인하였으며 해당 결함을 종료하기로 협의함.', rows: 4 }],
        submitLabel: 'Close',
        submitVariant: 'btn-success',
        onSubmit: (v) => run((rev) => api.issues.action(issue.id, 'close', { expectedRevision: rev, closeType: 'AGREED', comment: v.comment }), 'Close 되었습니다. (AGREED)'),
      });
    }
    function openCancel() {
      formModal({
        title: 'Issue Cancel',
        description: 'Cancel된 Issue는 통계에서 제외되며 Kanban 기본 화면에 표시되지 않습니다. 이력은 보존됩니다.',
        fields: [{ name: 'reason', label: 'Cancel 사유', type: 'textarea', required: true, placeholder: '예) 중복 결함 DEF-0019로 관리' }],
        submitLabel: 'Cancel',
        submitVariant: 'btn-danger',
        onSubmit: (v) => run((rev) => api.issues.action(issue.id, 'cancel', { expectedRevision: rev, reason: v.reason }), 'Cancel 처리되었습니다.'),
      });
    }
    function openAdminOverride() {
      formModal({
        title: '관리자 상태 강제 변경',
        description: 'Quality Admin 전용. 일반 Workflow와 별도로 ADMIN_STATUS_OVERRIDE 이력이 남습니다. 사유는 필수입니다.',
        fields: [
          { name: 'status', label: '변경할 상태', type: 'select', required: true, options: Object.entries(STATUS_LABEL).filter(([c]) => c !== issue.status).map(([value, label]) => ({ value, label: `${STATUS_KO[value]} · ${label}` })) },
          { name: 'reason', label: '변경 사유', type: 'textarea', required: true, placeholder: '예) 고객 재검증 결과 동일 현상 발생' },
        ],
        submitLabel: '강제 변경',
        submitVariant: 'btn-danger',
        onSubmit: (v) => run((rev) => api.issues.action(issue.id, 'admin-status', { expectedRevision: rev, status: v.status, reason: v.reason }), '상태가 강제 변경되었습니다.'),
      });
    }
    async function openAssign() {
      let users = [];
      try {
        users = (await api.users.list({ active: 'true' })).users;
      } catch (err) {
        return toast(errorMessage(err), 'error');
      }
      formModal({
        title: issue.assignee ? '조치자 변경 (인계)' : '조치자 지정',
        description: issue.assignee ? `현재 조치자: ${userLabel(issue.assignee)}` : '미배정 Issue를 타인에게 최초 배정합니다. (Quality Admin)',
        fields: [
          { name: 'assigneeUserId', label: '조치자', type: 'select', required: true, options: users.filter((u) => !issue.assignee || u.userId !== issue.assignee.userId).map((u) => ({ value: u.userId, label: `${u.name} (${u.team})${u.isQualityAdmin ? ' · Admin' : ''}` })) },
          { name: 'reason', label: '사유 (선택)', placeholder: '예) Frontend 담당자에게 이관' },
        ],
        submitLabel: '변경',
        onSubmit: (v) => run((rev) => api.issues.action(issue.id, 'assign', { expectedRevision: rev, assigneeUserId: v.assigneeUserId, reason: v.reason }), '조치자가 변경되었습니다.'),
      });
    }
    function openPriority(afterClaim = false) {
      formModal({
        title: 'Priority 변경',
        description: afterClaim ? '조치자로 지정되었습니다. 이어서 Priority를 지정해주세요. (나중에 변경 가능)' : `현재: ${store.priorityName(issue.priority)}`,
        fields: [
          { name: 'priority', label: 'Priority(심각도)', type: 'select', required: true, options: store.activePriorities().map((pr) => ({ value: pr.code, label: `${pr.displayName} — ${pr.description || ''}` })), value: issue.priority !== 'UNASSIGNED' ? issue.priority : undefined },
          { name: 'reason', label: '사유 (선택)', placeholder: '예) 로그인 불가로 테스트 진행 불가' },
        ],
        submitLabel: '변경',
        cancelLabel: afterClaim ? '나중에' : '취소',
        onSubmit: (v) => run((rev) => api.issues.action(issue.id, 'priority', { expectedRevision: rev, priority: v.priority, reason: v.reason }), 'Priority가 변경되었습니다.'),
      });
    }
    function openEdit() {
      const isDef = issue.type === 'DEFECT';
      const fields = isDef
        ? [
            { name: 'location', label: '발생 위치', required: true, value: issue.location },
            { name: 'environmentId', label: '발생 환경', type: 'select', required: true, options: store.project.environments.filter((e) => e.active || e.id === issue.environment.id).map((e) => ({ value: e.id, label: e.displayName })), value: issue.environment.id },
            { name: 'symptom', label: '발생 현상', type: 'textarea', required: true, value: issue.symptom, rows: 4 },
            { name: 'reproductionSteps', label: '재현 절차 (한 줄에 한 단계)', type: 'textarea', required: true, value: (issue.reproductionSteps || []).map((s) => s.text).join('\n'), rows: 5 },
            { name: 'expectedResult', label: '기대 결과', type: 'textarea', required: true, value: issue.expectedResult, rows: 3 },
          ]
        : issue.type === 'IMPROVEMENT'
          ? [
              { name: 'target', label: '개선 대상', required: true, value: issue.target },
              { name: 'request', label: '개선 내용', type: 'textarea', required: true, value: issue.request, rows: 4 },
              { name: 'reason', label: '개선 필요 사유', type: 'textarea', value: issue.reason || '', rows: 3 },
            ]
          : [
              { name: 'target', label: '문의 대상', required: true, value: issue.target },
              { name: 'question', label: '문의 내용', type: 'textarea', required: true, value: issue.question, rows: 4 },
            ];
      formModal({
        title: '등록내용 수정',
        description: '변경 전/후 내용은 Timeline에 기록됩니다.',
        wide: true,
        fields,
        submitLabel: '저장',
        onSubmit: (v) => {
          const changes = {};
          for (const f of fields) {
            let nv = v[f.name];
            let ov;
            if (f.name === 'environmentId') ov = issue.environment.id;
            else if (f.name === 'reproductionSteps') {
              nv = nv.split('\n').map((s) => s.replace(/^\s*\d{1,3}[.)]\s+/, '').trim()).filter(Boolean);
              ov = (issue.reproductionSteps || []).map((s) => s.text);
              if (JSON.stringify(nv) === JSON.stringify(ov)) continue;
              changes.reproductionSteps = nv;
              continue;
            } else ov = issue[f.name] || '';
            if (nv !== ov) changes[f.name] = nv;
          }
          if (!Object.keys(changes).length) throw new Error('변경된 내용이 없습니다.');
          return run((rev) => api.issues.update(issue.id, rev, changes), '등록내용이 수정되었습니다.');
        },
      });
    }
  }

  /* ================= Sub-builders ================= */
  function attachmentList(issue, p) {
    const atts = (issue.attachments || []).filter((a) => !a.deleted);
    const wrap = h('div', {});
    const list = h('div', { class: 'attachment-list' });
    for (const a of atts) {
      const url = `/api/issues/${issue.id}/attachments/${a.attachmentId}`;
      const isImg = /^image\//.test(a.mimeType);
      const el = h('span', { class: 'att' }, h('a', { class: 'name', href: url, title: a.originalName }, '📎 ', a.originalName), h('span', { class: 'size' }, fmtBytes(a.size)), isImg ? h('button', { class: 'btn btn-ghost btn-xs', onClick: () => previewImage(url, a.originalName) }, '미리보기') : null);
      if (p.isAdmin || a.uploadedBy === store.user.userId) {
        el.append(h('button', { class: 'del', title: '삭제', 'aria-label': `${a.originalName} 삭제`, onClick: async () => {
          if (!(await confirmModal({ title: '첨부 삭제', message: `${josa(a.originalName, '을/를')} 삭제합니다. (논리 삭제, 이력 보존)`, confirmLabel: '삭제', variant: 'btn-danger' }))) return;
          try {
            await run((rev) => api.issues.deleteAttachment(issue.id, a.attachmentId, rev), '첨부가 삭제되었습니다.');
          } catch (err) {
            if (!err.isConflict) toast(errorMessage(err), 'error');
          }
        } }, '✕'));
      }
      list.append(el);
    }
    if (!atts.length) list.append(h('span', { class: 'muted small' }, '첨부파일 없음'));
    wrap.append(list);
    if (p.canAttach) {
      const input = h('input', { type: 'file', multiple: true, class: 'hidden' });
      const btn = h('button', { class: 'btn btn-secondary btn-xs mt-8', onClick: () => input.click() }, '+ 파일 추가');
      input.addEventListener('change', async () => {
        if (!input.files.length) return;
        const fd = new FormData();
        for (const f of input.files) fd.append('file', f, f.name);
        fd.append('expectedRevision', String(data.issue.revision));
        setBusy(btn, true, '+ 파일 추가');
        try {
          await run(async () => {
            const res = await api.issues.upload(issue.id, fd);
            if (res.rejected && res.rejected.length) toast(`일부 첨부가 거부되었습니다: ${res.rejected.map((r) => `${r.name} (${r.message})`).join(', ')}`, 'error', { timeout: 8000 });
          }, '첨부가 추가되었습니다.');
        } catch (err) {
          if (!err.isConflict) toast(errorMessage(err), 'error');
        } finally {
          setBusy(btn, false, '+ 파일 추가');
        }
      });
      wrap.append(btn, input);
    }
    return wrap;
  }

  function previewImage(url, name) {
    openModal({ title: name, wide: true, body: h('img', { src: `${url}?inline=1`, alt: name, class: 'att-preview', style: { maxHeight: '70vh', margin: '0 auto' } }), actions: [{ label: '다운로드', variant: 'btn-secondary', onClick: () => window.open(url, '_blank') }, { label: '닫기', variant: 'btn-primary', onClick: (c) => c() }] });
  }

  function buildTimeline(issue, p) {
    const items = [];
    let seq = 0;
    for (const ev of issue.history || []) {
      if (ev.eventType === 'COMMENTED') {
        const c = (issue.comments || []).find((x) => ev.data && x.commentId === ev.data.commentId);
        if (c) items.push({ kind: 'comment', at: c.createdAt, c, seq: seq++ });
      } else items.push({ kind: 'event', at: ev.timestamp, ev, seq: seq++ });
    }
    // COMMENTED 이벤트가 없는 Comment(호환) 보완
    for (const c of issue.comments || []) if (!items.some((i) => i.kind === 'comment' && i.c.commentId === c.commentId)) items.push({ kind: 'comment', at: c.createdAt, c, seq: seq++ });
    items.sort((a, b) => a.at.localeCompare(b.at) || a.seq - b.seq);
    const tl = h('div', { class: 'timeline' });
    if (!items.length) tl.append(h('div', { class: 'muted' }, '이력이 없습니다.'));
    const attMap = new Map((issue.attachments || []).map((a) => [a.attachmentId, a]));
    for (const it of items) {
      if (it.kind === 'comment') {
        const c = it.c;
        const body = c.hidden ? h('div', { class: 'tl-comment hidden-c' }, p.isAdmin ? `[숨김 처리됨 · ${c.hiddenReason || ''}] ${c.body || ''}` : '관리자에 의해 숨김 처리된 Comment입니다.') : h('div', { class: 'tl-comment' }, c.body);
        const atts = (c.attachments || []).map((id) => attMap.get(id)).filter(Boolean);
        tl.append(
          h(
            'div',
            { class: 'tl-item' },
            h('div', { class: 'tl-dot blue' }, '💬'),
            h(
              'div',
              {},
              h('div', { class: 'tl-head' }, h('span', { class: 'who' }, c.author.nameSnapshot), h('span', { class: 'team' }, c.author.teamSnapshot), h('span', { class: 'time' }, fmtDateTime(c.createdAt))),
              body,
              atts.length ? h('div', { class: 'attachment-list mt-8' }, ...atts.map((a) => h('a', { class: 'att', href: `/api/issues/${issue.id}/attachments/${a.attachmentId}` }, '📎 ', h('span', { class: 'name' }, a.originalName)))) : null,
              p.canHideComment && !c.hidden ? h('button', { class: 'btn btn-ghost btn-xs mt-8', onClick: () => hideComment(c) }, '숨김') : null
            )
          )
        );
        continue;
      }
      const ev = it.ev;
      const t = ev.eventType;
      const dot = { CREATED: ['', '●'], UPDATED: ['', '✎'], ASSIGNED: ['blue', '👤'], PRIORITY_CHANGED: ['blue', '!'], STATUS_CHANGED: ['blue', '→'], RESOLVED: ['purple', '✔'], DEPLOYED: ['cyan', '⇪'], REOPENED: ['warn', '↺'], CANCELLED: ['danger', '✕'], CLOSED: ['green', '✓'], ADMIN_STATUS_OVERRIDE: ['admin', 'A'], COMMENT_HIDDEN: ['admin', '⊘'], ATTACHMENT_ADDED: ['', '📎'], ATTACHMENT_DELETED: ['', '📎'] }[t] || ['', '•'];
      const byAdmin = ev.data && ev.data.byAdmin;
      const rows = [];
      let label = EVENT_LABEL[t] || t;
      if (t === 'CLOSED' && ev.data && ev.data.closeType) label = `Close · ${CLOSE_LABEL[ev.data.closeType] || ev.data.closeType}`;
      if (t === 'ASSIGNED' && ev.data && ev.data.mode === 'CLAIM') label = '조치자 지정 (내가 조치)';
      if (t === 'STATUS_CHANGED' && ev.data && ev.data.action === 'START') label = '조치 시작';
      if (ev.before && ev.after) {
        for (const k of Object.keys(ev.after)) {
          if (k === 'deployment') continue;
          if (['status', 'priority', 'assignee'].includes(k)) rows.push(h('div', { class: 'tl-change' }, fieldValueText(k, ev.before[k]), h('span', { class: 'arrow' }, '→'), h('strong', {}, fieldValueText(k, ev.after[k]))));
          else rows.push(h('details', { class: 'tl-diff' }, h('summary', {}, `${FIELD_LABEL[k] || k} 변경 · 변경내용 보기`), h('div', { class: 'pair' }, h('div', {}, h('div', { class: 'h' }, 'BEFORE'), fieldValueText(k, ev.before[k])), h('div', {}, h('div', { class: 'h' }, 'AFTER'), fieldValueText(k, ev.after[k])))));
        }
      }
      if (t === 'DEPLOYED' && ev.data) rows.push(h('div', { class: 'tl-change' }, `${ev.data.environment || ''} 배포 · ${ev.data.version || '버전 미기재'} · ${fmtDateTime(ev.data.deployedAt)}`));
      if (t === 'RESOLVED' && ev.data && (ev.data.changeReference || ev.data.targetVersion)) rows.push(h('div', { class: 'tl-change' }, ev.data.changeReference ? h('span', { class: 'mono' }, `Change ${ev.data.changeReference}`) : null, ev.data.targetVersion ? ` · ${ev.data.targetVersion}` : null));
      if (t === 'ATTACHMENT_ADDED' && ev.data) rows.push(h('div', { class: 'tl-change' }, (ev.data.files || []).map((f) => f.name).join(', ')));
      if (t === 'ATTACHMENT_DELETED' && ev.data) rows.push(h('div', { class: 'tl-change' }, ev.data.name));
      if (ev.comment) rows.push(h('div', { class: ['REOPENED', 'CANCELLED', 'ADMIN_STATUS_OVERRIDE', 'COMMENT_HIDDEN'].includes(t) ? 'tl-reason' : 'tl-comment' }, ev.comment));
      tl.append(
        h(
          'div',
          { class: 'tl-item' },
          h('div', { class: `tl-dot ${dot[0]}` }, dot[1]),
          h('div', {}, h('div', { class: 'tl-head' }, h('span', { class: 'who' }, ev.actor.nameSnapshot), h('span', { class: 'team' }, ev.actor.teamSnapshot), byAdmin || t === 'ADMIN_STATUS_OVERRIDE' ? h('span', { class: 'badge admin' }, 'Quality Admin') : null, h('span', { class: 'time' }, fmtDateTime(ev.timestamp))), h('div', { class: 'tl-label' }, label), ...rows)
        )
      );
    }
    return tl;
  }

  function hideComment(c) {
    formModal({
      title: 'Comment 숨김',
      description: '화면에서 숨김 처리됩니다. 원문은 파일/Audit에 보존됩니다.',
      fields: [{ name: 'reason', label: '숨김 사유', type: 'textarea', required: true, placeholder: '예) 오등록된 개인정보 포함' }],
      submitLabel: '숨김',
      submitVariant: 'btn-danger',
      onSubmit: (v) => run((rev) => api.issues.hideComment(issueId, c.commentId, { expectedRevision: rev, reason: v.reason }), 'Comment가 숨김 처리되었습니다.'),
    });
  }

  function buildComposer(issue, p) {
    if (!p.canComment) return card('Comment', h('div', { class: 'muted small' }, '등록자, 조치자, Quality Admin만 Comment를 작성할 수 있습니다.'));
    const ta = h('textarea', { class: 'input', placeholder: '추가로 확인한 내용이나 조치에 필요한 정보를 남겨주세요.', 'aria-label': 'Comment' });
    const fileInput = h('input', { type: 'file', multiple: true, class: 'hidden' });
    const fileNames = h('span', { class: 'small muted' });
    fileInput.addEventListener('change', () => (fileNames.textContent = [...fileInput.files].map((f) => f.name).join(', ')));
    const btn = h('button', { class: 'btn btn-primary' }, '등록');
    const err = h('div', { class: 'error-msg hidden' });
    btn.addEventListener('click', async () => {
      const body = ta.value.trim();
      err.classList.add('hidden');
      if (!body) {
        err.textContent = 'Comment 내용을 입력해주세요.';
        err.classList.remove('hidden');
        return;
      }
      setBusy(btn, true, '등록');
      try {
        let attachmentIds = [];
        if (fileInput.files.length) {
          const fd = new FormData();
          for (const f of fileInput.files) fd.append('file', f, f.name);
          fd.append('expectedRevision', String(data.issue.revision));
          const up = await api.issues.upload(issue.id, fd);
          attachmentIds = up.attachments.map((a) => a.attachmentId);
          data.issue.revision = up.revision;
        }
        await run((rev) => api.issues.comment(issue.id, { expectedRevision: rev, body, attachmentIds }), 'Comment가 등록되었습니다.');
      } catch (e) {
        err.textContent = e.isConflict ? '다른 사용자가 먼저 수정했습니다. 최신 내용을 불러온 후 다시 등록해주세요. (입력 내용 유지)' : errorMessage(e);
        err.classList.remove('hidden');
        // 입력값 유지: conflict 시 draw()가 root를 다시 그리므로 textarea 값을 복원
        if (e.isConflict) setTimeout(() => { const t = root.querySelector('.composer textarea'); if (t) t.value = body; }, 0);
      } finally {
        setBusy(btn, false, '등록');
      }
    });
    return card('Comment', h('div', { class: 'composer' }, ta, err, h('div', { class: 'row' }, h('div', { class: 'flex' }, h('button', { class: 'btn btn-secondary btn-sm', onClick: () => fileInput.click() }, '파일 첨부'), fileInput, fileNames), btn)));
  }

  await load();
}

void initials;
