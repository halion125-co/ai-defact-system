/**
 * SCR-040 MY. 내가 등록 / 내가 조치 / 확인대기 + Count Badge.
 */
import { api } from '../api.js';
import { h, clear, pageHead, statusBadge, priorityBadge, typeBadge, fmtDate, fmtDateTime, errorBox, loadingState, emptyState, formModal, toast, errorMessage } from '../ui.js';

const TABS = [
  { key: 'reported', label: '내가 등록', desc: '내가 Reporter인 Issue', empty: '등록한 Issue가 없습니다.' },
  { key: 'assigned', label: '내가 조치', desc: '내가 조치자인 진행 중 Issue (Closed/Cancel 제외)', empty: '현재 조치할 Issue가 없습니다.', emptyDesc: '새 Issue가 배정되면 이곳에서 확인할 수 있습니다.' },
  { key: 'waiting', label: '확인대기', desc: '내가 등록했고 조치가 완료되어 재검증이 필요한 Issue', empty: '재검증을 기다리는 Issue가 없습니다.' },
];

/** 목록 행에서 detail.js와 동일한 사유 입력 흐름으로 상태 변경. 성공 시 reload()로 목록만 갱신(전체 페이지 이동 없음). */
async function doStart(it, reload) {
  try {
    await api.issues.action(it.id, 'start', { expectedRevision: it.revision });
    toast(`${it.id} 조치를 시작했습니다. (접수 → 조치중)`, 'success');
    reload();
  } catch (err) {
    toast(err.isConflict ? '다른 사용자가 먼저 변경했습니다. 목록을 새로고침합니다.' : errorMessage(err), 'error');
    reload();
  }
}
function doResolve(it, reload) {
  formModal({
    title: '조치 완료',
    description: `${it.id} · 처리 결과를 남기면 확인대기 상태가 되며 등록자가 재검증합니다.`,
    fields: [{ name: 'description', label: '처리 결과', type: 'textarea', required: true, placeholder: '예) 로그인 Token 검증 로직 오류를 수정했습니다.', rows: 4 }],
    submitLabel: '조치 완료',
    onSubmit: async (v) => {
      await api.issues.action(it.id, 'resolve', { expectedRevision: it.revision, resolution: v });
      toast(`${it.id} 조치 완료 처리되었습니다.`, 'success');
      reload();
    },
  });
}
function doCloseVerified(it, reload) {
  formModal({
    title: '정상 확인',
    description: `${it.id} · 재검증 결과 정상 동작을 확인했습니다.`,
    fields: [{ name: 'comment', label: '확인 내용 (선택)', type: 'textarea', placeholder: '예) 검증계에서 정상 동작 확인' }],
    submitLabel: '정상 확인',
    submitVariant: 'btn-success',
    onSubmit: async (v) => {
      await api.issues.action(it.id, 'close', { expectedRevision: it.revision, closeType: 'VERIFIED', comment: v.comment });
      toast(`${it.id} Close 되었습니다. (정상 확인)`, 'success');
      reload();
    },
  });
}
function doReopen(it, reload) {
  formModal({
    title: '재조치 요청',
    description: `${it.id} · 사유를 남기면 조치중 상태로 돌아가 조치자가 재조치합니다.`,
    fields: [{ name: 'reason', label: '재조치 사유', type: 'textarea', required: true, placeholder: '예) 검증계에서 동일 현상이 계속 발생합니다.' }],
    submitLabel: '재조치 요청',
    submitVariant: 'btn-warning',
    onSubmit: async (v) => {
      await api.issues.action(it.id, 'reopen', { expectedRevision: it.revision, reason: v.reason });
      toast(`${it.id} 재조치 요청되었습니다.`, 'success');
      reload();
    },
  });
}

export async function renderMy(main, { query, navigate }) {
  const tab = TABS.find((t) => t.key === query.tab) || TABS[0];
  const tabsEl = h('div', { class: 'tabs', role: 'tablist' });
  const content = h('div', { class: 'card' });
  main.append(pageHead('MY', tab.desc), tabsEl, content);

  const counts = { reported: null, assigned: null, waiting: null };
  const renderTabs = () => {
    clear(tabsEl);
    for (const t of TABS) tabsEl.append(h('button', { class: `tab${t.key === tab.key ? ' active' : ''}`, role: 'tab', 'aria-selected': t.key === tab.key, onClick: () => navigate('/my', { tab: t.key }) }, t.label, counts[t.key] !== null ? h('span', { class: 'cnt' }, counts[t.key]) : null));
  };
  renderTabs();
  api.my.counts().then((c) => { Object.assign(counts, c); renderTabs(); }).catch(() => {});

  async function load() {
    clear(content).append(h('div', { class: 'card-body' }, loadingState(5)));
    api.my.counts().then((c) => { Object.assign(counts, c); renderTabs(); }).catch(() => {});
    try {
      const res = await api.issues.list({ mine: tab.key, size: 200, sort: '-updatedAt', ...(tab.key === 'reported' ? { includeDraft: 'true' } : {}) });
      clear(content);
      if (!res.items.length) {
        content.append(emptyState(tab.empty, tab.emptyDesc, tab.key === 'reported' ? h('a', { class: 'btn btn-primary', href: '#/new' }, '+ Issue 등록') : h('a', { class: 'btn btn-secondary', href: '#/issues/kanban?quick=unassigned' }, '미배정 Issue 보기')));
        return;
      }
      const tbody = h('tbody', {});
      for (const it of res.items) {
        const isDraft = it.status === 'DRAFT';
        const dest = isDraft ? `/new/${it.type.toLowerCase()}?draftId=${it.id}` : `/issues/${it.id}`;
        const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
        let rowAction = null;
        if (isDraft) rowAction = h('a', { class: 'btn btn-secondary btn-xs', href: `#${dest}` }, '이어 작성');
        else if (tab.key === 'assigned') {
          if (it.status === 'OPEN') rowAction = h('button', { class: 'btn btn-primary btn-xs', onClick: stop(() => doStart(it, load)) }, '조치 시작');
          else if (it.status === 'IN_PROGRESS') rowAction = h('button', { class: 'btn btn-primary btn-xs', onClick: stop(() => doResolve(it, load)) }, '조치 완료');
        } else if (tab.key === 'waiting') {
          rowAction = h('div', { class: 'flex', style: { gap: '4px' } }, h('button', { class: 'btn btn-success btn-xs', onClick: stop(() => doCloseVerified(it, load)) }, '정상 확인'), h('button', { class: 'btn btn-warning btn-xs', onClick: stop(() => doReopen(it, load)) }, '재조치 요청'));
        }
        tbody.append(
          h(
            'tr',
            { class: 'clickable', onClick: () => navigate(dest) },
            h('td', { class: 'id-cell' }, h('a', { href: `#${dest}` }, it.id)),
            h('td', {}, typeBadge(it.type)),
            h('td', { class: 'title-cell', title: it.title }, it.title, it.reopened ? h('span', { class: 'badge warn', style: { marginLeft: '6px' } }, 'Re-open') : null),
            h('td', { class: 'env-cell' }, it.environment || '-'),
            h('td', {}, priorityBadge(it.priority)),
            h('td', {}, statusBadge(it.status)),
            h('td', {}, tab.key === 'reported' ? it.assignee || h('span', { class: 'badge warn' }, '미지정') : it.reporter),
            h('td', { class: 'nowrap' }, fmtDate(it.createdAt)),
            h('td', { class: 'nowrap muted' }, fmtDateTime(it.updatedAt)),
            h('td', {}, rowAction)
          )
        );
      }
      content.append(
        h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, ...['ID', '유형', '제목/현상', '환경', 'Priority', 'Status', tab.key === 'reported' ? 'Assignee' : 'Reporter', '등록일', '업데이트', ''].map((c) => h('th', { scope: 'col' }, c)))), tbody)),
        h('div', { class: 'card-body small muted', style: { paddingTop: '10px' } }, `총 ${res.total}건`)
      );
    } catch (err) {
      clear(content).append(h('div', { class: 'card-body' }, errorBox(err, load)));
    }
  }
  await load();
}
