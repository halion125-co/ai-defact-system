/**
 * SCR-032 Issue Detail. 2-column 업무 처리 화면: 좌측 본문(내용/증적/활동), 우측 처리 패널(다음 작업/조치자/Priority/상태/Traceability).
 * 모든 Mutation은 expectedRevision 포함. 409 시 conflict 안내 + 최신 재조회.
 */
import { api } from '../api.js';
import { store } from '../store.js';
import {
  h, clear, card, statusBadge, priorityBadge, typeBadge, deployBadge, fmtDateTime, fmtBytes, userLabel, initials, toast, errorMessage, errorBox, conflictBox,
  loadingState, formModal, confirmModal, openModal, copyText, setBusy, EVENT_LABEL, STATUS_LABEL, STATUS_KO, CLOSE_LABEL, localDateTimeValue, josa, icon,
} from '../ui.js';
import { getPrimaryAction, toActionIssue } from '../issueActions.js';
import { renderIssueBodyText, createRichTextEditor, toDisplayHtml } from '../richText.js';

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
  let activityTab = 'all'; // all | comment | system
  let activityExpanded = false;
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
      if (data.issue.status === 'DRAFT') {
        const typePath = { DEFECT: 'defect', IMPROVEMENT: 'improvement', INQUIRY: 'inquiry' }[data.issue.type];
        navigate(`/new/${typePath}`, { draftId: issueId }, { replace: true });
        return;
      }
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
    /**
     * 다음 작업 판단: 상태별로 가장 자연스러운 Primary 액션 1개 + 나머지 보조 액션.
     * { primary: {label, onClick, variant}|null, secondary: [...], note }
     * 액션 핸들러(openResolve 등)는 이 draw() 스코프 하단에 함수 선언되어 있어 호이스팅으로 참조 가능하다.
     */
    // Kanban 드래그앤드롭과 primary action 판단 기준을 공유한다(issueActions.js). CLAIM(배정)만 이 화면 고유 흐름(doClaim)으로 남긴다.
    const PRIMARY_HANDLERS = { START: doStart, RESOLVE: openResolve, CLOSE_VERIFIED: openCloseVerified, CLOSE_AGREED: openCloseAgreed };
    function nextAction(issue, p) {
      const st = issue.status;
      const secondary = [];
      let primary = null;
      let note = null;

      if (st === 'CANCEL') {
        note = `취소된 Issue입니다.${issue.cancelReason ? ` 사유: ${issue.cancelReason}` : ''}`;
      } else if (st === 'CLOSED') {
        note = '종료된 Issue입니다.';
        if (p.canReopen) secondary.push({ label: 'Re-open', onClick: openReopen, variant: 'btn-warning' });
      } else {
        if (st !== 'CANCEL' && p.canClaim) primary = { label: '내게 배정', onClick: doClaim, variant: 'btn-primary' };
        else {
          const pa = getPrimaryAction(toActionIssue(issue), me);
          if (pa) primary = { label: pa.label, onClick: PRIMARY_HANDLERS[pa.key], variant: pa.variant };
        }

        if (st === 'DONE' && p.isReporter && !p.isAdmin && !primary) note = '조치가 완료되었습니다. 재검증 후 결과를 선택해주세요.';

        if (p.canDeploy && !(issue.deployment && issue.deployment.status === 'DEPLOYED' && st === 'CLOSED')) {
          secondary.push({ label: issue.deployment && issue.deployment.status === 'DEPLOYED' ? '배포 정보 갱신' : '배포 완료', onClick: openDeploy, variant: 'btn-secondary' });
        }
        if (p.canReopen) secondary.push({ label: '재조치 요청', onClick: openReopen, variant: 'btn-secondary' });
        if (p.canCloseVerified && primary && primary.label !== '정상 확인') secondary.push({ label: '정상 확인', onClick: openCloseVerified, variant: 'btn-secondary' });
        if (p.canCloseAgreed && primary && !primary.label.includes('Close')) secondary.push({ label: p.isAdmin ? '합의 Close' : 'Close', onClick: openCloseAgreed, variant: 'btn-secondary' });
        if (p.canCancel) secondary.push({ label: 'Cancel', onClick: openCancel, variant: 'btn-danger-outline' });

        if (!primary && !secondary.length && !note) {
          note = issue.assignee ? '현재 수행 가능한 작업이 없습니다. 조치자 또는 Quality Admin이 진행합니다.' : '조치자가 지정되지 않았습니다. [내게 배정]으로 받거나 Quality Admin이 배정합니다.';
        }
      }
      return { primary, secondary, note };
    }

    const { issue, permissions: p } = data;
    const op = store.operation || {};
    const me = store.user;
    clear(root);
    if (conflict) root.append(conflictBox(() => load()));

    /* ---------- 상단 요약 ---------- */
    const idCopy = h('button', { class: 'btn btn-ghost btn-xs', title: 'ID 복사', 'aria-label': 'ID 복사', onClick: () => copyText(issue.id).then(() => toast(`${issue.id} 복사됨 · Commit 예: [${issue.id}] 수정내용`, 'info')) }, 'ID 복사');
    const summaryHead = h('div', { class: 'summary-head' }, h('span', { class: 'id' }, issue.id), idCopy, typeBadge(issue.type, true), priorityBadge(issue.priority, true), statusBadge(issue.status, true), issue.reopenCount ? h('span', { class: 'badge warn badge-lg' }, `Re-open ${issue.reopenCount}회`) : null, issue.status === 'DONE' && op.enableDeployment ? deployBadge(issue.deployment && issue.deployment.status) : null);
    const moreMenu = buildMoreMenu(issue, p);
    const summaryActions = h('div', { class: 'flex' }, p.canEditContent && issue.status !== 'CANCEL' ? h('button', { class: 'btn btn-secondary btn-sm', onClick: openEdit }, '등록내용 수정') : null, moreMenu);
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
          h('div', {}, h('div', { class: 'k' }, '조치자'), h('div', { class: 'v' }, issue.assignee ? userLabel(issue.assignee) : h('span', { class: 'badge warn' }, icon('warn', { size: 11 }), ' 미지정'))),
          h('div', {}, h('div', { class: 'k' }, '환경'), h('div', { class: 'v' }, issue.environment ? envName(issue.environment) : '-')),
          h('div', {}, h('div', { class: 'k' }, '등록일'), h('div', { class: 'v' }, fmtDateTime(issue.createdAt), ' ', h('small', {}, `· 업데이트 ${fmtDateTime(issue.updatedAt)}`)))
        )
      )
    );

    /* ---------- 결함 내용 ---------- */
    const block = (title, body) => h('div', { class: 'content-block' }, h('h4', {}, title), body);
    const contentBody = h('div', {});
    const richBody = (raw, cls = 'body') => {
      const el = renderIssueBodyText(raw, 'div', cls);
      bindBodyImagePreview(el);
      return el;
    };
    if (issue.type === 'DEFECT') {
      contentBody.append(
        block('발생 현상', richBody(issue.symptom)),
        block('발생 위치', h('div', { class: 'body' }, issue.location)),
        block('재현 절차', h('ol', {}, ...(issue.reproductionSteps || []).map((s) => h('li', {}, s.text)))),
        block('기대 결과', richBody(issue.expectedResult))
      );
    } else if (issue.type === 'IMPROVEMENT') {
      contentBody.append(block('개선 대상', h('div', { class: 'body' }, issue.target)), block('개선 내용', richBody(issue.request)), issue.reason ? block('개선 필요 사유', h('div', { class: 'body' }, issue.reason)) : null);
    } else {
      contentBody.append(block('문의 대상', h('div', { class: 'body' }, issue.target)), block('문의 내용', richBody(issue.question)));
    }
    contentBody.append(block('첨부파일 / 증적', attachmentZone(issue, p)));
    const content = card(`${{ DEFECT: '결함', IMPROVEMENT: '개선요청', INQUIRY: '문의' }[issue.type]} 내용`, contentBody);

    /* ---------- 활동(Timeline + Comment 통합) ---------- */
    const activity = buildActivity(issue, p);

    /* ---------- 우측: 다음 작업 / 조치·배정 / Traceability ---------- */
    const na = nextAction(issue, p);
    const nextActionBody = h('div', { class: 'next-action' });
    if (na.primary) nextActionBody.append(h('button', { class: `btn ${na.primary.variant} btn-block`, onClick: na.primary.onClick }, na.primary.label));
    if (na.secondary.length) nextActionBody.append(h('div', { class: 'next-action-sub' }, ...na.secondary.map((s) => h('button', { class: `btn ${s.variant} btn-sm`, onClick: s.onClick }, s.label))));
    if (na.note) nextActionBody.append(h('div', { class: 'next-action-note' }, na.note));
    if (!na.primary && !na.secondary.length && !na.note) nextActionBody.append(h('div', { class: 'next-action-note' }, '현재 수행 가능한 작업이 없습니다.'));

    const sideKv = h(
      'div',
      { class: 'side-kv' },
      h('div', { class: 'row' }, h('span', { class: 'k' }, '조치자'), h('span', { class: 'v' }, issue.assignee ? userLabel(issue.assignee) : h('span', { class: 'badge warn' }, '미지정'), p.canAssign ? h('button', { class: 'btn btn-ghost btn-xs', onClick: openAssign }, '변경') : null)),
      h('div', { class: 'row' }, h('span', { class: 'k' }, 'Priority'), h('span', { class: 'v' }, priorityBadge(issue.priority), p.canChangePriority ? h('button', { class: 'btn btn-ghost btn-xs', onClick: openPriority }, '변경') : null)),
      h('div', { class: 'row' }, h('span', { class: 'k' }, '상태'), h('span', { class: 'v' }, statusBadge(issue.status)))
    );

    const r = issue.resolution;
    const d = issue.deployment || {};
    const hasTrace = !!((r && (r.description || r.targetVersion)) || (op.enableDeployment && d.status === 'DEPLOYED') || (issue.close && issue.close.type));
    const traceRow = (k, v, mono) => h('div', {}, h('div', { class: 'k' }, k), h('div', { class: `v${v ? '' : ' empty'}${mono && v ? ' mono' : ''}` }, v || '-'));
    const resolutionBody = r && r.description ? richBody(r.description, 'v pre') : h('div', { class: 'v pre empty' }, '-');
    const traceBody = hasTrace
      ? h(
          'div',
          { class: 'trace' },
          h('div', { style: { gridColumn: '1 / -1' } }, h('div', { class: 'k' }, '조치 결과'), resolutionBody),
          op.enableChangeReference ? traceRow('Change Reference', r && r.changeReference, true) : null,
          traceRow('반영 예정 버전', r && r.targetVersion),
          traceRow('최초 조치완료', r && r.firstResolvedAt ? fmtDateTime(r.firstResolvedAt) : null),
          traceRow('최근 조치완료', r && r.resolvedAt ? fmtDateTime(r.resolvedAt) : null),
          op.enableDeployment ? h('div', { style: { gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: '10px' } }, h('div', { class: 'k' }, '배포'), h('div', { class: 'v' }, deployBadge(d.status || 'NOT_DEPLOYED'), d.status === 'DEPLOYED' ? h('span', { style: { marginLeft: '8px' } }, `${d.environmentNameSnapshot || ''} ${d.version || ''} · ${fmtDateTime(d.deployedAt)}`) : null)) : null,
          issue.close && issue.close.type ? h('div', { style: { gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: '10px' } }, h('div', { class: 'k' }, `Close (${CLOSE_LABEL[issue.close.type] || issue.close.type})`), h('div', { class: 'v pre' }, issue.close.comment || '-'), h('div', { class: 'small muted' }, `최초 ${fmtDateTime(issue.close.firstClosedAt)} · 최근 ${fmtDateTime(issue.close.closedAt)}`)) : null
        )
      : h('div', { class: 'trace-empty' }, '아직 연결된 추적 정보가 없습니다.');

    root.append(
      h('div', { class: 'flex mb-16', style: { justifyContent: 'space-between' } }, h('a', { class: 'btn btn-ghost btn-sm', href: '#/issues/list' }, '← 목록'), h('span', { class: 'small muted' }, `revision ${issue.revision}`)),
      h(
        'div',
        { class: 'detail-grid' },
        h('div', { class: 'detail-main' }, summary, content, activity),
        h('aside', { class: 'detail-side' }, card('다음 작업', nextActionBody), card('조치 / 배정', sideKv), card('조치 결과 · Traceability', traceBody))
      )
    );

    /* ================= Actions ================= */
    async function doClaim() {
      const ok = await confirmModal({ title: '내게 배정', message: '이 이슈의 조치자를 나로 지정합니다. 실제 조치는 상세 화면에서 시작하세요.', confirmLabel: '내게 배정' });
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
        await run((rev) => api.issues.action(issue.id, 'start', { expectedRevision: rev }), '조치를 시작했습니다. (접수 → 조치중)');
      } catch (err) {
        if (!err.isConflict) toast(errorMessage(err), 'error');
      }
    }
    function openResolve() {
      const pendingImages = new Map(); // pendingId -> { file }. issue가 이미 있으므로 저장 시 바로 업로드 가능.
      const description = createRichTextEditor({
        placeholder: '예) 로그인 Token 검증 로직 오류를 수정했습니다. 화면 캡처는 Ctrl+V로 바로 붙여넣을 수 있습니다.',
        onImagePending: ({ pendingId, file }) => pendingImages.set(pendingId, { file }),
      });
      const changeReference = op.enableChangeReference ? h('input', { class: 'input', placeholder: 'Commit / Revision / Change ID' }) : null;
      const targetVersion = h('input', { class: 'input', placeholder: '예) Release 1.2.3' });
      const field = (label, input, required, help) => h('div', { class: 'field' }, h('label', {}, label, required ? h('span', { class: 'req' }, '*') : null), input, help ? h('div', { class: 'help' }, help) : null);
      const errBox = h('div', { class: 'form-error hidden' });
      const body = h(
        'div',
        {},
        errBox,
        field('처리 결과', description, true, '화면 캡처를 복사한 뒤 Ctrl+V로 바로 붙여넣을 수 있습니다.'),
        changeReference ? field('Change Reference', changeReference, false, `Commit message 권장: [${issue.id}] 수정 내용`) : null,
        field('반영 예정 버전', targetVersion, false)
      );
      const submit = async (close) => {
        errBox.classList.add('hidden');
        if (description.rte.isEmpty()) {
          errBox.textContent = '처리 결과를 입력해주세요.';
          errBox.classList.remove('hidden');
          return;
        }
        try {
          await run(async (rev) => {
            let curRev = rev;
            if (pendingImages.size) {
              const idToUrl = new Map();
              for (const [pendingId, { file }] of pendingImages) {
                const fd = new FormData();
                fd.append('file', file, file.name || `pasted-${pendingId}.png`);
                const up = await api.issues.upload(issue.id, fd);
                curRev = up.revision;
                const att = up.attachments && up.attachments[0];
                if (att) idToUrl.set(pendingId, `/api/issues/${issue.id}/attachments/${att.attachmentId}`);
              }
              description.rte.resolvePendingImages(idToUrl);
            }
            const resolution = { description: description.rte.getValue(), targetVersion: targetVersion.value.trim() };
            if (changeReference) resolution.changeReference = changeReference.value.trim();
            return api.issues.action(issue.id, 'resolve', { expectedRevision: curRev, resolution });
          }, '조치 완료 처리되었습니다. (조치중 → 확인대기)');
          close();
        } catch (err) {
          if (!err.isConflict) {
            errBox.textContent = errorMessage(err);
            errBox.classList.remove('hidden');
          }
        }
      };
      openModal({ title: '조치 완료', wide: true, body, actions: [{ label: '취소', variant: 'btn-secondary', onClick: (close) => close() }, { label: '조치 완료', variant: 'btn-primary', onClick: submit }] });
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
        description: '사유를 남기면 조치중 상태로 돌아가 조치자가 재조치합니다.',
        fields: [{ name: 'reason', label: '재조치 사유', type: 'textarea', required: true, placeholder: '예) 검증계에서 동일 현상이 계속 발생합니다.' }],
        submitLabel: '재조치 요청',
        submitVariant: 'btn-warning',
        onSubmit: (v) => run((rev) => api.issues.action(issue.id, 'reopen', { expectedRevision: rev, reason: v.reason }), '재조치 요청되었습니다. (→ 조치중)'),
      });
    }
    function openCloseVerified() {
      formModal({
        title: '정상 확인',
        description: '재검증 결과 정상 동작을 확인했습니다.',
        fields: [{ name: 'comment', label: '확인 내용 (선택)', type: 'textarea', placeholder: '예) 검증계에서 정상 동작 확인' }],
        submitLabel: '정상 확인',
        submitVariant: 'btn-success',
        onSubmit: (v) => run((rev) => api.issues.action(issue.id, 'close', { expectedRevision: rev, closeType: 'VERIFIED', comment: v.comment }), 'Close 되었습니다. (정상 확인)'),
      });
    }
    function openCloseAgreed() {
      formModal({
        title: '결함을 종료하시겠습니까?',
        description: '가능하면 고객/등록자가 직접 확인 후 종료하는 것을 권장합니다.\n조치자가 종료하는 경우 확인/합의 내용을 남겨주세요.',
        fields: [{ name: 'comment', label: '확인/합의 내용', type: 'textarea', required: true, placeholder: '예) 김OO 책임과 검증계 정상동작을 확인하였으며 해당 결함을 종료하기로 협의함.', rows: 4 }],
        submitLabel: 'Close',
        submitVariant: 'btn-success',
        onSubmit: (v) => run((rev) => api.issues.action(issue.id, 'close', { expectedRevision: rev, closeType: 'AGREED', comment: v.comment }), 'Close 되었습니다. (합의 종료)'),
      });
    }
    function openCancel() {
      formModal({
        title: 'Issue 취소',
        description: '취소된 Issue는 통계에서 제외되며 Kanban 기본 화면에 표시되지 않습니다. 이력은 보존됩니다.',
        fields: [{ name: 'reason', label: '취소 사유', type: 'textarea', required: true, placeholder: '예) 중복 결함 DEF-0019로 관리' }],
        submitLabel: '취소',
        submitVariant: 'btn-danger',
        onSubmit: (v) => run((rev) => api.issues.action(issue.id, 'cancel', { expectedRevision: rev, reason: v.reason }), '취소 처리되었습니다.'),
      });
    }
    function openAdminOverride() {
      formModal({
        title: '관리자 상태 강제 변경',
        description: 'Quality Admin 전용. 일반 Workflow와 별도로 이력이 남습니다. 사유는 필수입니다.',
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
      if (issue.type === 'DEFECT') return openEditDefect();
      const isImp = issue.type === 'IMPROVEMENT';
      const fields = isImp
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
        description: '변경 전/후 내용은 활동 이력에 기록됩니다.',
        wide: true,
        fields,
        submitLabel: '저장',
        onSubmit: (v) => {
          const changes = {};
          for (const f of fields) {
            const nv = v[f.name];
            const ov = issue[f.name] || '';
            if (nv !== ov) changes[f.name] = nv;
          }
          if (!Object.keys(changes).length) throw new Error('변경된 내용이 없습니다.');
          return run((rev) => api.issues.update(issue.id, rev, changes), '등록내용이 수정되었습니다.');
        },
      });
    }

    /** 결함 수정: 등록 화면과 동일한 라벨/순서, 재현 절차도 등록 화면과 같은 step-input 방식을 재사용한다. */
    function openEditDefect() {
      const pendingImages = new Map(); // pendingId -> { file }. 이 화면은 issue가 이미 있으므로 저장 시 바로 업로드 가능.
      const envs = store.project.environments.filter((e) => e.active || e.id === issue.environment.id);
      const location = h('input', { class: 'input', value: issue.location, maxlength: 200 });
      const env = h('select', { class: 'input' }, ...envs.map((e) => h('option', { value: e.id }, e.displayName)));
      env.value = issue.environment.id;
      const symptom = createRichTextEditor({
        initialHtml: toDisplayHtml(issue.symptom),
        onImagePending: ({ pendingId, file }) => pendingImages.set(pendingId, { file }),
      });
      const expected = createRichTextEditor({
        initialHtml: toDisplayHtml(issue.expectedResult),
        onImagePending: ({ pendingId, file }) => pendingImages.set(pendingId, { file }),
      });

      const stepsEl = h('div', { class: 'steps' });
      const steps = [];
      const renderSteps = () => {
        clear(stepsEl);
        steps.forEach((input, i) => {
          stepsEl.append(h('div', { class: 'step-row' }, h('span', { class: 'num' }, `${i + 1}.`), input, h('button', { type: 'button', class: 'btn btn-ghost btn-xs', 'aria-label': '단계 삭제', disabled: steps.length <= 1, onClick: () => { steps.splice(i, 1); renderSteps(); } }, '✕')));
        });
      };
      const addStep = (value = '') => {
        const input = h('input', { class: 'input', maxlength: 500 });
        input.value = value;
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (steps.indexOf(input) === steps.length - 1) addStep();
            steps[Math.min(steps.indexOf(input) + 1, steps.length - 1)].focus();
          }
        });
        steps.push(input);
        renderSteps();
        return input;
      };
      const existingSteps = (issue.reproductionSteps || []).map((s) => s.text);
      if (existingSteps.length) existingSteps.forEach((t) => addStep(t));
      else addStep();

      const field = (label, input, help) => h('div', { class: 'field' }, h('label', {}, label, h('span', { class: 'req' }, '*')), input, help ? h('div', { class: 'help' }, help) : null);
      const errBox = h('div', { class: 'form-error hidden' });
      const body = h(
        'div',
        {},
        errBox,
        field('발생 현상', symptom, '어떤 문제가 발생했는지 적어주세요.'),
        field('발생 위치', location, '화면/메뉴/기능 위치'),
        field('발생 환경', env),
        h('div', { class: 'field' }, h('label', {}, '재현 절차', h('span', { class: 'req' }, '*')), stepsEl, h('div', {}, h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => addStep().focus() }, '+ 단계 추가')), h('div', { class: 'help' }, '순서대로 한 줄씩 입력. 1단계 이상 필수')),
        field('기대 결과', expected, '정상이라면 어떻게 동작해야 하는지 적어주세요.')
      );

      const submit = async (close) => {
        errBox.classList.add('hidden');
        const changes = {};
        if (location.value.trim() !== issue.location) changes.location = location.value.trim();
        if (env.value !== issue.environment.id) changes.environmentId = env.value;
        const symptomHtml = symptom.rte.getValue();
        if (symptomHtml !== toDisplayHtml(issue.symptom)) changes.symptom = symptomHtml;
        const expectedHtml = expected.rte.getValue();
        if (expectedHtml !== toDisplayHtml(issue.expectedResult)) changes.expectedResult = expectedHtml;
        const nvSteps = steps.map((s) => s.value.trim()).filter(Boolean);
        if (JSON.stringify(nvSteps) !== JSON.stringify(existingSteps)) changes.reproductionSteps = nvSteps;
        if (!Object.keys(changes).length) {
          errBox.textContent = '변경된 내용이 없습니다.';
          errBox.classList.remove('hidden');
          return;
        }
        try {
          await run(async (rev) => {
            let curRev = rev;
            if (pendingImages.size) {
              const idToUrl = new Map();
              for (const [pendingId, { file }] of pendingImages) {
                const fd = new FormData();
                fd.append('file', file, file.name || `pasted-${pendingId}.png`);
                const up = await api.issues.upload(issue.id, fd);
                curRev = up.revision;
                const att = up.attachments && up.attachments[0];
                if (att) idToUrl.set(pendingId, `/api/issues/${issue.id}/attachments/${att.attachmentId}`);
              }
              symptom.rte.resolvePendingImages(idToUrl);
              expected.rte.resolvePendingImages(idToUrl);
              // pending 이미지가 실제 URL로 치환되었으므로, 두 필드 모두 최신 값으로 다시 반영한다.
              changes.symptom = symptom.rte.getValue();
              changes.expectedResult = expected.rte.getValue();
            }
            return api.issues.update(issue.id, curRev, changes);
          }, '등록내용이 수정되었습니다.');
          close();
        } catch (err) {
          if (!err.isConflict) {
            errBox.textContent = errorMessage(err);
            errBox.classList.remove('hidden');
          }
        }
      };
      openModal({ title: '등록내용 수정', wide: true, body, actions: [{ label: '취소', variant: 'btn-secondary', onClick: (close) => close() }, { label: '저장', variant: 'btn-primary', onClick: submit }] });
    }

    function buildMoreMenu(issue, p) {
      if (!p.canAdminOverride) return null;
      const pop = h('div', { class: 'more-pop hidden' }, h('button', { class: 'more-item', onClick: () => { pop.classList.add('hidden'); openAdminOverride(); } }, '관리자: 상태 강제 변경'));
      const btn = h('button', { class: 'btn btn-ghost btn-sm', title: '더보기', 'aria-label': '관리자 기능 더보기', onClick: (e) => { e.stopPropagation(); pop.classList.toggle('hidden'); } }, icon('more', { size: 15 }));
      const wrap = h('div', { class: 'more-menu' }, btn, pop);
      document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) pop.classList.add('hidden'); }, { once: false });
      return wrap;
    }
  }

  /* ================= Sub-builders ================= */
  function attachmentZone(issue, p) {
    const atts = (issue.attachments || []).filter((a) => !a.deleted);
    const wrap = h('div', { class: 'dropzone' });
    const input = h('input', { type: 'file', multiple: true, class: 'hidden' });
    const op = store.operation || {};
    const dzErr = h('div', { class: 'dz-error hidden' });

    async function doUpload(files) {
      if (!files.length) return;
      dzErr.classList.add('hidden');
      const fd = new FormData();
      for (const f of files) fd.append('file', f, f.name);
      fd.append('expectedRevision', String(data.issue.revision));
      try {
        await run(async () => {
          const res = await api.issues.upload(issue.id, fd);
          if (res.rejected && res.rejected.length) {
            const msg = `업로드 실패: ${res.rejected.map((r) => `${r.name} (${r.message})`).join(', ')}`;
            dzErr.textContent = msg;
            dzErr.classList.remove('hidden');
            toast(msg, 'error', { timeout: 8000 });
          }
        }, '첨부가 추가되었습니다.');
      } catch (err) {
        if (!err.isConflict) {
          dzErr.textContent = errorMessage(err);
          dzErr.classList.remove('hidden');
          toast(errorMessage(err), 'error');
        }
      }
    }
    input.addEventListener('change', () => doUpload([...input.files]));

    if (p.canAttach) {
      const drop = h(
        'div',
        { class: 'dropzone-area', onClick: () => input.click(), onDragover: (e) => { e.preventDefault(); drop.classList.add('drag'); }, onDragleave: () => drop.classList.remove('drag'), onDrop: (e) => { e.preventDefault(); drop.classList.remove('drag'); doUpload([...e.dataTransfer.files]); } },
        icon('paperclip', { size: 18, cls: 'dz-ico' }),
        h('div', { class: 'dz-text' }, '파일을 끌어오거나 선택하세요'),
        h('div', { class: 'dz-help' }, `최대 ${op.maxAttachmentMb || 20}MB`, h('button', { type: 'button', class: 'dz-ext-toggle', onClick: (e) => { e.stopPropagation(); e.currentTarget.nextElementSibling.classList.toggle('hidden'); } }, '허용 형식 보기'), h('span', { class: 'dz-ext hidden' }, (op.allowedExtensions || []).join(', ')))
      );
      wrap.append(drop, input, dzErr);
    }

    if (atts.length) {
      const list = h('div', { class: 'att-table' });
      for (const a of atts) {
        const url = `/api/issues/${issue.id}/attachments/${a.attachmentId}`;
        const isImg = /^image\//.test(a.mimeType);
        const row = h(
          'div',
          { class: 'att-row' },
          h('a', { class: 'att-name', href: url, title: a.originalName }, icon('paperclip', { size: 13 }), a.originalName),
          h('span', { class: 'att-meta' }, fmtBytes(a.size)),
          h('span', { class: 'att-meta' }, a.uploadedByName || '-'),
          h('span', { class: 'att-meta nowrap' }, a.uploadedAt ? fmtDateTime(a.uploadedAt) : '-'),
          h(
            'span',
            { class: 'att-actions' },
            isImg ? h('button', { class: 'btn btn-ghost btn-xs', onClick: () => previewImage(url, a.originalName) }, '미리보기') : null,
            h('a', { class: 'btn btn-ghost btn-xs', href: url, target: '_blank', rel: 'noopener' }, '다운로드'),
            p.isAdmin || a.uploadedBy === store.user.userId
              ? h('button', { class: 'btn btn-ghost btn-xs', onClick: async () => {
                  if (!(await confirmModal({ title: '첨부 삭제', message: `${josa(a.originalName, '을/를')} 삭제합니다. (논리 삭제, 이력 보존)`, confirmLabel: '삭제', variant: 'btn-danger' }))) return;
                  try {
                    await run((rev) => api.issues.deleteAttachment(issue.id, a.attachmentId, rev), '첨부가 삭제되었습니다.');
                  } catch (err) {
                    if (!err.isConflict) toast(errorMessage(err), 'error');
                  }
                } }, '삭제')
              : null
          )
        );
        list.append(row);
      }
      wrap.append(list);
    } else if (!p.canAttach) {
      wrap.append(h('div', { class: 'muted small' }, '첨부된 파일 없음'));
    }
    return wrap;
  }

  function previewImage(url, name) {
    openModal({ title: name, wide: true, body: h('img', { src: `${url}?inline=1`, alt: name, class: 'att-preview', style: { maxHeight: '70vh', margin: '0 auto' } }), actions: [{ label: '다운로드', variant: 'btn-secondary', onClick: () => window.open(url, '_blank') }, { label: '닫기', variant: 'btn-primary', onClick: (c) => c() }] });
  }

  /** 발생 현상 등 본문에 붙여넣은 이미지는 작은 썸네일로 표시하고, 클릭하면 첨부 미리보기 모달로 크게 보여준다. */
  function bindBodyImagePreview(container) {
    for (const img of container.querySelectorAll('img')) {
      img.classList.add('body-image-thumb');
      img.addEventListener('click', () => previewImage(img.src, img.alt || '첨부 이미지'));
    }
  }

  /** Timeline(system) + Comment를 하나의 활동 목록으로 병합해 시간순 정렬 */
  function collectActivity(issue) {
    const items = [];
    let seq = 0;
    for (const ev of issue.history || []) {
      if (ev.eventType === 'COMMENTED') {
        const c = (issue.comments || []).find((x) => ev.data && x.commentId === ev.data.commentId);
        if (c) items.push({ kind: 'comment', at: c.createdAt, c, seq: seq++ });
      } else items.push({ kind: 'event', at: ev.timestamp, ev, seq: seq++ });
    }
    for (const c of issue.comments || []) if (!items.some((i) => i.kind === 'comment' && i.c.commentId === c.commentId)) items.push({ kind: 'comment', at: c.createdAt, c, seq: seq++ });
    items.sort((a, b) => a.at.localeCompare(b.at) || a.seq - b.seq);
    return items.reverse(); // 최신순
  }

  function activityItemEl(issue, p, it) {
    const attMap = new Map((issue.attachments || []).map((a) => [a.attachmentId, a]));
    if (it.kind === 'comment') {
      const c = it.c;
      const body = c.hidden ? h('div', { class: 'tl-comment hidden-c' }, p.isAdmin ? `[숨김 처리됨 · ${c.hiddenReason || ''}] ${c.body || ''}` : '관리자에 의해 숨김 처리된 Comment입니다.') : h('div', { class: 'tl-comment' }, c.body);
      const atts = (c.attachments || []).map((id) => attMap.get(id)).filter(Boolean);
      return h(
        'div',
        { class: 'tl-item' },
        h('div', { class: 'tl-dot blue' }, icon('comment', { size: 13 })),
        h(
          'div',
          {},
          h('div', { class: 'tl-head' }, h('span', { class: 'who' }, c.author.nameSnapshot), h('span', { class: 'team' }, c.author.teamSnapshot), h('span', { class: 'time' }, fmtDateTime(c.createdAt))),
          body,
          atts.length ? h('div', { class: 'attachment-list mt-8' }, ...atts.map((a) => h('a', { class: 'att', href: `/api/issues/${issue.id}/attachments/${a.attachmentId}` }, icon('paperclip', { size: 12 }), h('span', { class: 'name' }, a.originalName)))) : null,
          p.canHideComment && !c.hidden ? h('button', { class: 'btn btn-ghost btn-xs mt-8', onClick: () => hideComment(c) }, '숨김') : null
        )
      );
    }
    const ev = it.ev;
    const t = ev.eventType;
    const dot = { CREATED: ['', 'dot'], UPDATED: ['', 'pencil'], ASSIGNED: ['blue', 'user'], PRIORITY_CHANGED: ['blue', 'warn'], STATUS_CHANGED: ['blue', 'chevronRight'], RESOLVED: ['purple', 'check'], DEPLOYED: ['cyan', 'upload'], REOPENED: ['warn', 'undo'], CANCELLED: ['danger', 'x'], CLOSED: ['green', 'check'], ADMIN_STATUS_OVERRIDE: ['admin', 'gear'], COMMENT_HIDDEN: ['admin', 'warn'], ATTACHMENT_ADDED: ['', 'paperclip'], ATTACHMENT_DELETED: ['', 'paperclip'] }[t] || ['', 'dot'];
    const byAdmin = ev.data && ev.data.byAdmin;
    const rows = [];
    let label = EVENT_LABEL[t] || t;
    if (t === 'CLOSED' && ev.data && ev.data.closeType) label = `Close · ${CLOSE_LABEL[ev.data.closeType] || ev.data.closeType}`;
    if (t === 'ASSIGNED' && ev.data && ev.data.mode === 'CLAIM') label = '조치자 지정 (내게 배정)';
    if (t === 'STATUS_CHANGED' && ev.data && ev.data.action === 'START') label = '조치 시작';
    if (ev.before && ev.after) {
      for (const k of Object.keys(ev.after)) {
        if (k === 'deployment') continue;
        if (['status', 'priority', 'assignee'].includes(k)) {
          const beforeText = ev.before[k] !== undefined ? fieldValueText(k, ev.before[k]) : null;
          rows.push(h('div', { class: 'tl-change' }, beforeText ? [beforeText, h('span', { class: 'arrow' }, '→')] : '최초 상태: ', h('strong', {}, fieldValueText(k, ev.after[k]))));
        } else rows.push(h('details', { class: 'tl-diff' }, h('summary', {}, `${FIELD_LABEL[k] || k} 변경 · 변경내용 보기`), h('div', { class: 'pair' }, h('div', {}, h('div', { class: 'h' }, 'BEFORE'), fieldValueText(k, ev.before[k])), h('div', {}, h('div', { class: 'h' }, 'AFTER'), fieldValueText(k, ev.after[k])))));
      }
    }
    if (t === 'DEPLOYED' && ev.data) rows.push(h('div', { class: 'tl-change' }, `${ev.data.environment || ''} 배포 · ${ev.data.version || '버전 미기재'} · ${fmtDateTime(ev.data.deployedAt)}`));
    if (t === 'RESOLVED' && ev.data && (ev.data.changeReference || ev.data.targetVersion)) rows.push(h('div', { class: 'tl-change' }, ev.data.changeReference ? h('span', { class: 'mono' }, `Change ${ev.data.changeReference}`) : null, ev.data.targetVersion ? ` · ${ev.data.targetVersion}` : null));
    if (t === 'ATTACHMENT_ADDED' && ev.data) rows.push(h('div', { class: 'tl-change' }, (ev.data.files || []).map((f) => f.name).join(', ')));
    if (t === 'ATTACHMENT_DELETED' && ev.data) rows.push(h('div', { class: 'tl-change' }, ev.data.name));
    if (ev.comment) rows.push(h('div', { class: ['REOPENED', 'CANCELLED', 'ADMIN_STATUS_OVERRIDE', 'COMMENT_HIDDEN'].includes(t) ? 'tl-reason' : 'tl-comment' }, ev.comment));
    return h(
      'div',
      { class: 'tl-item' },
      h('div', { class: `tl-dot ${dot[0]}` }, dot[1] ? icon(dot[1], { size: 13 }) : null),
      h('div', {}, h('div', { class: 'tl-head' }, h('span', { class: 'who' }, ev.actor.nameSnapshot), h('span', { class: 'team' }, ev.actor.teamSnapshot), byAdmin || t === 'ADMIN_STATUS_OVERRIDE' ? h('span', { class: 'badge admin' }, 'Quality Admin') : null, h('span', { class: 'time' }, fmtDateTime(ev.timestamp))), h('div', { class: 'tl-label' }, label), ...rows)
    );
  }

  function buildActivity(issue, p) {
    const all = collectActivity(issue);
    const commentCount = all.filter((i) => i.kind === 'comment').length;
    const systemCount = all.filter((i) => i.kind === 'event').length;

    const tabsRow = h(
      'div',
      { class: 'activity-tabs' },
      h('button', { class: `chip${activityTab === 'all' ? ' active' : ''}`, onClick: () => { activityTab = 'all'; activityExpanded = false; rerender(); } }, `전체 ${all.length}`),
      h('button', { class: `chip${activityTab === 'comment' ? ' active' : ''}`, onClick: () => { activityTab = 'comment'; activityExpanded = false; rerender(); } }, `댓글 ${commentCount}`),
      h('button', { class: `chip${activityTab === 'system' ? ' active' : ''}`, onClick: () => { activityTab = 'system'; activityExpanded = false; rerender(); } }, `시스템 이력 ${systemCount}`)
    );

    const list = h('div', { class: 'timeline' });
    const composer = buildComposer(issue, p);
    const body = h('div', {}, tabsRow, composer, list);
    const moreWrap = h('div', {});
    const cardEl = card('활동', body);

    function rerender() {
      const filtered = activityTab === 'all' ? all : activityTab === 'comment' ? all.filter((i) => i.kind === 'comment') : all.filter((i) => i.kind === 'event');
      clear(list);
      if (!filtered.length) {
        list.append(h('div', { class: 'muted small' }, '이력이 없습니다.'));
      } else {
        const shown = activityExpanded ? filtered : filtered.slice(0, 3);
        for (const it of shown) list.append(activityItemEl(issue, p, it));
      }
      clear(moreWrap);
      if (!activityExpanded && filtered.length > 3) moreWrap.append(h('button', { class: 'btn btn-ghost btn-sm mt-8', onClick: () => { activityExpanded = true; rerender(); } }, `전체 보기 (${filtered.length})`));
      list.append(moreWrap);
    }
    rerender();
    return cardEl;
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
    if (!p.canComment) return h('div', { class: 'muted small mb-16' }, '등록자, 조치자, Quality Admin만 Comment를 작성할 수 있습니다.');
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
        if (e.isConflict) setTimeout(() => { const t = root.querySelector('.composer textarea'); if (t) t.value = body; }, 0);
      } finally {
        setBusy(btn, false, '등록');
      }
    });
    return h('div', { class: 'composer mb-16' }, ta, err, h('div', { class: 'row' }, h('div', { class: 'flex' }, h('button', { class: 'btn btn-secondary btn-sm', onClick: () => fileInput.click() }, '파일 첨부'), fileInput, fileNames), btn));
  }

  await load();
}

void initials;
