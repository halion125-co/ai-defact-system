/**
 * SCR-030 Kanban. [내가 조치] Claim 지원. 드래그 핸들(⋮⋮)로 카드를 다음 컬럼에 놓으면
 * 상세 화면과 동일한 Primary Action(issueActions.js)이 실행된다 — 카드 본문 클릭은 여전히 상세 이동.
 */
import { api } from '../api.js';
import { store } from '../store.js';
import { h, clear, pageHead, priorityBadge, typeBadge, fmtDate, errorBox, loadingState, toast, errorMessage, confirmModal, icon, josa } from '../ui.js';
import { buildFilterBar } from './list.js';
import { getPrimaryAction, runPrimaryAction } from '../issueActions.js';
import { openIssuePreview } from '../issuePreview.js';

const COLS = [
  { code: 'OPEN', label: 'Open', ko: '접수' },
  { code: 'IN_PROGRESS', label: 'In Progress', ko: '조치중' },
  { code: 'DONE', label: 'Done', ko: '확인대기' },
  { code: 'CLOSED', label: 'Closed', ko: '완료' },
];

/** primary action의 key → 카드가 옮겨갈 목적지 컬럼 코드 */
const TARGET_COL = { START: 'IN_PROGRESS', RESOLVE: 'DONE', CLOSE_VERIFIED: 'CLOSED', CLOSE_AGREED: 'CLOSED' };

const QUICK = [
  { key: 'all', label: '전체', q: {} },
  { key: 'unassigned', label: '신규/미지정', q: { unassigned: 'true' } },
  { key: 'reported', label: '내가 등록', q: { mine: 'reported' } },
  { key: 'assigned', label: '내가 조치', q: { mine: 'assigned', status: 'ALL' } },
  { key: 'waiting', label: '확인대기', q: { status: 'DONE' } },
  { key: 'critical', label: 'Critical', q: { priority: 'CRITICAL' } },
];

const PAGE_SIZE = 5; // 컬럼당 기본 표시 건수. "+더보기" 클릭마다 이만큼씩 확장한다.

export function kanbanCard(it, { onClaim, onOpenPreview, navigate, onDragStart, onDragEnd }) {
  const me = store.user;
  const canClaim = !it.assigneeId && it.status === 'OPEN';
  // 드래그 가능 여부 = primary action 존재 여부. 미배정 카드는 상세 화면과 동일하게 "내게 배정"이 우선이므로 드래그 대상에서 제외한다
  // (Admin은 미배정 카드에서도 서버상 canStart=true이지만, 배정 없이 워크플로부터 진행하면 조치자가 비어있는 채로 남는다).
  const pa = me && !canClaim ? getPrimaryAction(it, me) : null;
  const openPreview = () => onOpenPreview(it);
  const card = h(
    'article',
    { class: 'kcard', tabindex: 0, role: 'link', 'aria-label': `${it.id} ${it.title}`, onClick: openPreview, onKeydown: (e) => e.key === 'Enter' && openPreview() },
    h(
      'div',
      { class: 'top' },
      h('span', { class: 'id' }, it.id),
      h('div', { class: 'flex', style: { gap: '6px', alignItems: 'center' } }, priorityBadge(it.priority), pa ? h('span', { class: 'kcard-handle', title: `드래그해서 ${pa.label}`, 'aria-label': `드래그해서 ${pa.label}`, draggable: 'true', onClick: (e) => e.stopPropagation(), onDragstart: (e) => onDragStart(e, it, pa), onDragend: onDragEnd }, icon('grip', { size: 13 })) : null)
    ),
    h('div', { class: 'title' }, it.title),
    h(
      'div',
      { class: 'meta' },
      h('div', {}, typeBadge(it.type), it.environment ? h('span', { class: 'env' }, it.environment) : null),
      h('div', {}, '담당자 ', it.assignee ? h('strong', {}, it.assignee) : h('span', { class: 'warn' }, icon('warn', { size: 11 }), ' 미지정'))
    ),
    h(
      'div',
      { class: 'foot' },
      h('span', {}, fmtDate(it.updatedAt || it.createdAt)),
      h('span', {}, it.deploymentStatus === 'DEPLOYED' ? '배포완료' : it.status === 'DONE' && store.operation && store.operation.enableDeployment ? '배포대기' : '', it.reopened ? ' · Re-open' : '', it.commentCount ? ` · ${it.commentCount}` : '')
    )
  );
  if (canClaim && me) {
    card.append(
      h('div', { class: 'mt-8' }, h('button', { class: 'btn btn-primary btn-xs', onClick: (e) => { e.stopPropagation(); onClaim(it); } }, '내게 배정'))
    );
  }
  return card;
}

export async function renderKanban(main, { query, navigate }) {
  // 쿼리 없이 진입(사이드바 메뉴 등)하면 이 화면에서 마지막으로 쓰던 필터를 복원한다.
  if (Object.keys(query).length === 0) {
    const saved = store.loadFilter('kanban');
    if (saved && Object.keys(saved).length) return navigate('/issues/kanban', saved, { replace: true });
  }
  store.saveFilter('kanban', query);

  const quick = query.quick || 'all';
  const filterBar = buildFilterBar(query, (q) => navigate('/issues/kanban', { ...q, quick }), { compact: true, hideStatus: true });
  const chips = h('div', { class: 'chip-group' });
  for (const qf of QUICK) {
    if (qf.key === 'assigned' && !store.isResponder) continue; // 조치자가 아니면 "내가 조치" 퀵필터 숨김
    chips.append(h('button', { class: `chip${quick === qf.key ? ' active' : ''}`, onClick: () => navigate('/issues/kanban', { ...query, quick: qf.key }) }, qf.label));
  }
  const board = h('div', { class: 'kanban' });
  const cancelNote = h('div', { class: 'small muted mt-8' });
  main.append(
    pageHead('Issue 관리 · Kanban', '카드의 ⋮⋮ 손잡이를 다음 컬럼으로 끌어 상태를 변경할 수 있습니다.', h('a', { class: 'btn btn-secondary', href: '#/new' }, '+ Issue 등록')),
    h('div', { class: 'filter-bar' }, chips, h('div', { class: 'grow' }), filterBar),
    board,
    cancelNote
  );

  let dragging = null; // { it, pa } — 드래그 중인 카드와 그 primary action
  const colEls = new Map(); // code -> kcol DOM(드래그 중 허용/불허 표시용)
  const visibleCount = new Map(COLS.map((c) => [c.code, PAGE_SIZE])); // code -> 현재 표시 건수("+더보기"마다 PAGE_SIZE씩 증가)
  let lastResult = null; // 최근 조회 결과(더보기 클릭 시 재조회 없이 다시 그리기 위해 보관)

  async function load() {
    clear(board).append(loadingState(6));
    const qf = QUICK.find((x) => x.key === quick) || QUICK[0];
    const params = { ...query, ...qf.q, size: 500, sort: '-updatedAt' };
    delete params.quick;
    if (!params.status) params.status = 'OPEN,IN_PROGRESS,DONE,CLOSED';
    if (params.status === 'ALL') params.status = 'OPEN,IN_PROGRESS,DONE,CLOSED';
    try {
      const res = await api.issues.list(params);
      lastResult = res;
      for (const code of visibleCount.keys()) visibleCount.set(code, PAGE_SIZE); // 필터/재조회 시 각 컬럼 표시 개수를 초기값으로 리셋
      renderBoard(res);
    } catch (err) {
      clear(board).append(errorBox(err, load));
    }
  }

  function renderBoard(res) {
    clear(board);
    colEls.clear();
    for (const col of COLS) {
      const items = res.items.filter((i) => i.status === col.code);
      const shown = items.slice(0, visibleCount.get(col.code));
      const cards = h('div', { class: 'kcards' });
      for (const it of shown) cards.append(kanbanCard(it, { navigate, onClaim: claim, onOpenPreview: openPreview, onDragStart: startDrag, onDragEnd: endDrag }));
      const remaining = items.length - shown.length;
      if (remaining > 0) {
        cards.append(h('button', { type: 'button', class: 'kcol-more', onClick: () => { visibleCount.set(col.code, visibleCount.get(col.code) + PAGE_SIZE); renderBoard(lastResult); } }, `+ 더보기 (${remaining})`));
      }
      const section = h(
        'section',
        {
          class: `kcol${items.length ? '' : ' empty-col'}`,
          'aria-label': col.label,
          onDragover: (e) => onColDragOver(e, col),
          onDrop: (e) => onColDrop(e, col),
        },
        h('div', { class: 'kcol-head' }, h('span', { class: 't' }, col.ko, h('small', {}, col.label)), h('span', { class: 'n' }, items.length)),
        cards
      );
      colEls.set(col.code, section);
      board.append(section);
    }
    cancelNote.replaceChildren(h('a', { href: `#/issues/list?status=CANCEL` }, '취소된 Issue는 목록에서 조회 →'), res.total > 500 ? ` · 표시 한도 500건 (전체 ${res.total}건) — 필터를 좁혀주세요.` : '');
  }

  async function claim(it) {
    const ok = await confirmModal({ title: '내게 배정', message: '이 이슈의 조치자를 나로 지정합니다. 실제 조치는 상세 화면에서 시작하세요.', confirmLabel: '내게 배정' });
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

  /** 카드 클릭 시 우측 미리보기 패널(공용 모듈). 상세 화면과 달리 목록 컨텍스트를 유지한다. "상세 보기"에서만 전체 화면으로 이동. */
  function openPreview(summaryIt) {
    openIssuePreview(summaryIt, { onReload: load });
  }

  /* ---------- 드래그앤드롭: 카드는 primary action의 목적지 컬럼 1개로만 이동 가능 ---------- */
  function startDrag(e, it, pa) {
    dragging = { it, pa };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', it.id); // Firefox 등에서 dragstart 필수 요구사항
    const target = TARGET_COL[pa.key];
    board.classList.add('dragging-active');
    for (const [code, el] of colEls) el.classList.toggle('kcol-drop-target', code === target);
  }
  function endDrag() {
    dragging = null;
    board.classList.remove('dragging-active');
    for (const el of colEls.values()) el.classList.remove('kcol-drop-target');
  }
  function onColDragOver(e, col) {
    if (!dragging || TARGET_COL[dragging.pa.key] !== col.code) return; // 허용 컬럼이 아니면 드롭 자체를 막는다
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
  function onColDrop(e, col) {
    if (!dragging || TARGET_COL[dragging.pa.key] !== col.code) return;
    e.preventDefault();
    const { it, pa } = dragging;
    endDrag();
    handleDrop(it, pa);
  }

  /**
   * 드롭 즉시 카드를 옮기지 않는다. 필요 시 배정 확인 → primary action 모달까지 성공해야 화면이 바뀐다(load 재조회).
   *
   * 참고: pa.needsAssignee(START/RESOLVE)는 getPrimaryAction()이 이미 canWorkflow(=내가 조치자이거나 Admin)를
   * 조건으로 걸고 있어서, 지금 서버 정책(assign 액션은 현재 조치자/Admin만 인계 가능 — 일반 사용자가 남의 배정을
   * 강제로 가져올 수 없음)에서는 "남의 카드 + needsAssignee"인 조합의 드래그 핸들 자체가 생기지 않는다.
   * 즉 아래 재배정 확인 분기는 현재는 도달하지 않는 방어 코드다. 이후 "일반 사용자도 남의 배정을 가져올 수 있게"
   * 정책이 바뀌면(assign 권한 완화) 이 분기가 그대로 활성화되도록 남겨둔다.
   */
  async function handleDrop(it, pa) {
    const me = store.user;
    const isMine = !!(me && it.assigneeId === me.userId);
    let reassigned = false;
    if (pa.needsAssignee && !isMine && !me.isQualityAdmin) {
      const ok = await confirmModal({
        title: '조치자 변경',
        message: `${it.id}은(는) 현재 ${it.assignee ? `${it.assignee}님이` : '담당자가'} 조치 중입니다. 조치자를 나로 변경하고 ${josa(pa.label, '을/를')} 진행할까요?`,
        confirmLabel: '변경하고 진행',
      });
      if (!ok) return;
      try {
        it.revision = (await api.issues.action(it.id, 'assign', { expectedRevision: it.revision, assigneeUserId: me.userId })).revision;
        reassigned = true;
      } catch (err) {
        toast(err.isConflict ? '다른 사용자가 먼저 변경했습니다. 목록을 새로고침합니다.' : errorMessage(err), 'error');
        return load();
      }
    }
    const mutate = async (fn, msg) => {
      try {
        const res = await fn(it.revision);
        if (msg) toast(msg, 'success');
        return res;
      } catch (err) {
        if (err.isConflict) toast('다른 사용자가 먼저 변경했습니다. 목록을 새로고침합니다.', 'error');
        else toast(errorMessage(err), 'error');
        throw err;
      }
    };
    if (reassigned) load(); // 배정 변경은 이미 서버에 반영됐으므로 담당자 표시부터 갱신(다음 모달을 취소해도 배정은 유지됨)
    runPrimaryAction(pa.key, it, { mutate, onSuccess: load });
  }

  await load();
}
