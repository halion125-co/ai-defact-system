/**
 * SCR-030 Kanban. 현황 조회용. Drag & Drop 상태변경 없음. [내가 조치] Claim 지원.
 */
import { api } from '../api.js';
import { store } from '../store.js';
import { h, clear, pageHead, priorityBadge, typeBadge, fmtDate, errorBox, loadingState, toast, errorMessage, confirmModal } from '../ui.js';
import { buildFilterBar } from './list.js';

const COLS = [
  { code: 'OPEN', label: 'Open', ko: '접수' },
  { code: 'IN_PROGRESS', label: 'In Progress', ko: '조치중' },
  { code: 'DONE', label: 'Done', ko: '확인대기' },
  { code: 'CLOSED', label: 'Closed', ko: '완료' },
];

const QUICK = [
  { key: 'all', label: '전체', q: {} },
  { key: 'unassigned', label: '신규/미지정', q: { unassigned: 'true' } },
  { key: 'reported', label: '내가 등록', q: { mine: 'reported' } },
  { key: 'assigned', label: '내가 조치', q: { mine: 'assigned', status: 'ALL' } },
  { key: 'waiting', label: '확인대기', q: { status: 'DONE' } },
  { key: 'critical', label: 'Critical', q: { priority: 'CRITICAL' } },
];

export function kanbanCard(it, { onClaim, navigate }) {
  const me = store.user;
  const canClaim = !it.assigneeId && it.status === 'OPEN';
  const card = h(
    'article',
    { class: 'kcard', tabindex: 0, role: 'link', 'aria-label': `${it.id} ${it.title}`, onClick: () => navigate(`/issues/${it.id}`), onKeydown: (e) => e.key === 'Enter' && navigate(`/issues/${it.id}`) },
    h('div', { class: 'top' }, h('span', { class: 'id' }, it.id), priorityBadge(it.priority)),
    h('div', { class: 'title' }, it.title),
    h(
      'div',
      { class: 'meta' },
      h('div', {}, typeBadge(it.type), it.environment ? h('span', { style: { marginLeft: '6px' } }, it.environment) : null),
      h('div', {}, 'Reporter ', h('strong', {}, it.reporter)),
      h('div', {}, 'Assignee ', it.assignee ? h('strong', {}, it.assignee) : h('span', { class: 'warn' }, '미지정 ⚠'))
    ),
    h(
      'div',
      { class: 'foot' },
      h('span', {}, fmtDate(it.createdAt)),
      h('span', {}, it.deploymentStatus === 'DEPLOYED' ? '배포완료' : it.status === 'DONE' && store.operation && store.operation.enableDeployment ? '배포대기' : '', it.reopened ? ' · Re-open' : '', it.commentCount ? ` · 💬${it.commentCount}` : '')
    )
  );
  if (canClaim && me) {
    card.append(
      h('div', { class: 'mt-8' }, h('button', { class: 'btn btn-primary btn-xs', onClick: (e) => { e.stopPropagation(); onClaim(it); } }, '내가 조치'))
    );
  }
  return card;
}

export async function renderKanban(main, { query, navigate }) {
  const quick = query.quick || 'all';
  const filterBar = buildFilterBar(query, (q) => navigate('/issues/kanban', { ...q, quick }), { compact: true, hideStatus: true });
  const chips = h('div', { class: 'chip-group' });
  for (const qf of QUICK) chips.append(h('button', { class: `chip${quick === qf.key ? ' active' : ''}`, onClick: () => navigate('/issues/kanban', { ...query, quick: qf.key }) }, qf.label));
  const board = h('div', { class: 'kanban' });
  const cancelNote = h('div', { class: 'small muted mt-8' });
  main.append(
    pageHead('Issue 관리 · Kanban', '상태별 Issue 현황을 확인합니다. 상태 변경은 Issue 상세의 Action 버튼으로만 수행합니다.', h('a', { class: 'btn btn-primary', href: '#/new' }, '+ Issue 등록')),
    h('div', { class: 'filter-bar' }, chips, h('div', { class: 'grow' }), filterBar),
    board,
    cancelNote
  );

  async function load() {
    clear(board).append(loadingState(6));
    const qf = QUICK.find((x) => x.key === quick) || QUICK[0];
    const params = { ...query, ...qf.q, size: 500, sort: '-updatedAt' };
    delete params.quick;
    if (!params.status) params.status = 'OPEN,IN_PROGRESS,DONE,CLOSED';
    if (params.status === 'ALL') params.status = 'OPEN,IN_PROGRESS,DONE,CLOSED';
    try {
      const res = await api.issues.list(params);
      clear(board);
      for (const col of COLS) {
        const items = res.items.filter((i) => i.status === col.code);
        const cards = h('div', { class: 'kcards' });
        for (const it of items) cards.append(kanbanCard(it, { navigate, onClaim: claim }));
        board.append(h('section', { class: `kcol${items.length ? '' : ' empty-col'}`, 'aria-label': col.label }, h('div', { class: 'kcol-head' }, h('span', { class: 't' }, col.label, h('small', {}, col.ko)), h('span', { class: 'n' }, items.length)), cards));
      }
      cancelNote.replaceChildren(h('a', { href: `#/issues/list?status=CANCEL` }, 'Cancel된 Issue는 목록에서 조회 →'), res.total > 500 ? ` · 표시 한도 500건 (전체 ${res.total}건) — 필터를 좁혀주세요.` : '');
    } catch (err) {
      clear(board).append(errorBox(err, load));
    }
  }

  async function claim(it) {
    const ok = await confirmModal({ title: '내가 조치', message: `${it.id}의 조치자를 나(${store.user.name})로 지정합니다. 조치를 실제로 시작할 때는 상세 화면에서 [조치 시작]을 선택하세요.`, confirmLabel: '내가 조치' });
    if (!ok) return;
    try {
      await api.issues.action(it.id, 'claim', { expectedRevision: it.revision });
      toast(`${it.id} 조치자로 지정되었습니다.`, 'success', { action: { label: '상세 보기', onClick: () => navigate(`/issues/${it.id}`) } });
      load();
    } catch (err) {
      toast(err.isConflict ? '다른 사용자가 먼저 변경했습니다. 목록을 새로고침합니다.' : errorMessage(err), 'error');
      load();
    }
  }
  await load();
}
