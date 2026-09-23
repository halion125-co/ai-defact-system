/**
 * SCR-031 Issue List. 검색/필터/정렬/Pagination. 필터 상태는 URL Query와 동기화. Dashboard Drill-down 재사용.
 */
import { api } from '../api.js';
import { store } from '../store.js';
import { h, clear, pageHead, statusBadge, priorityBadge, typeBadge, fmtDate, fmtDateTime, errorBox, loadingState, emptyState, TYPE_LABEL, STATUS_LABEL } from '../ui.js';

const DRILL_KEYS = {
  unassigned: '담당자 미지정',
  stale: '장기 미조치',
  reopened: 'Re-open',
  criticalUnresolved: 'Critical 미조치',
  waitingDeploy: '배포대기',
  waitingVerification: '재검증대기',
  unresolved: '현재 미조치',
  resolvedEver: '누적 조치',
  closedEver: '누적 Closed',
};

export function buildFilterBar(query, onChange, { compact = false, hideStatus = false } = {}) {
  const bar = h('div', { class: 'filter-bar', style: { marginBottom: 0 } });
  const sel = (name, label, options) => {
    const s = h('select', { class: `input${compact ? ' input-sm' : ''}`, 'aria-label': label }, h('option', { value: '' }, label), ...options.map((o) => h('option', { value: o.value }, o.label)));
    s.value = query[name] || '';
    if (s.value !== (query[name] || '')) s.value = '';
    s.addEventListener('change', () => onChange({ ...query, [name]: s.value, page: undefined }));
    return s;
  };
  bar.append(sel('type', '유형 전체', Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))));
  if (!hideStatus) bar.append(sel('status', '상태 전체', [...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })), { value: 'ALL', label: 'Cancel 포함 전체' }]));
  bar.append(sel('environmentId', '환경 전체', (store.project ? store.project.environments : []).map((e) => ({ value: e.id, label: e.displayName }))));
  bar.append(sel('priority', 'Priority 전체', [...store.activePriorities().map((p) => ({ value: p.code, label: p.displayName })), { value: 'UNASSIGNED', label: '미지정' }]));
  const assignee = h('select', { class: `input${compact ? ' input-sm' : ''}`, 'aria-label': '담당자' }, h('option', { value: '' }, '담당자 전체'), h('option', { value: 'UNASSIGNED' }, '미지정'), h('option', { value: store.user.userId }, '내가 조치'));
  assignee.value = query.assignee || '';
  api.users.list({ active: 'true' }).then(({ users }) => {
    for (const u of users) if (u.userId !== store.user.userId) assignee.append(h('option', { value: u.userId }, `${u.name} (${u.team})`));
    assignee.value = query.assignee || '';
  }).catch(() => {});
  assignee.addEventListener('change', () => onChange({ ...query, assignee: assignee.value, page: undefined }));
  bar.append(assignee);
  if (!compact) {
    const from = h('input', { type: 'date', class: 'input', 'aria-label': '등록일 시작' });
    const to = h('input', { type: 'date', class: 'input', 'aria-label': '등록일 종료' });
    from.value = query.createdFrom || '';
    to.value = query.createdTo || '';
    from.addEventListener('change', () => onChange({ ...query, createdFrom: from.value, page: undefined }));
    to.addEventListener('change', () => onChange({ ...query, createdTo: to.value, page: undefined }));
    bar.append(h('span', { class: 'muted small' }, '등록일'), from, h('span', { class: 'muted' }, '~'), to);
  }
  return bar;
}

export async function renderList(main, { query, navigate }) {
  const go = (q) => navigate('/issues/list', q);
  const search = h('input', { class: 'input', type: 'search', placeholder: '검색: ID, 제목, 현상, 등록자, Comment', style: { minWidth: '260px' } });
  search.value = query.q || '';
  search.addEventListener('keydown', (e) => e.key === 'Enter' && go({ ...query, q: search.value.trim(), page: undefined }));

  // Drill-down 조건 표시
  const drills = Object.keys(DRILL_KEYS).filter((k) => query[k] === 'true');
  const special = [];
  if (query.createdOn) special.push(`등록일 ${query.createdOn}`);
  if (query.resolvedOn) special.push(`최초 조치완료일 ${query.resolvedOn}`);
  if (query.closedOn) special.push(`최초 Close일 ${query.closedOn}`);
  if (query.reporter === store.user.userId) special.push('내가 등록');
  if (query.mine) special.push({ reported: '내가 등록', assigned: '내가 조치', waiting: '확인대기' }[query.mine]);
  const chipsRow = h('div', { class: 'chip-group', style: { marginBottom: '12px' } });
  for (const k of drills) chipsRow.append(h('button', { class: 'chip active', title: '조건 제거', onClick: () => go({ ...query, [k]: undefined, page: undefined }) }, `${DRILL_KEYS[k]} ✕`));
  for (const s of special) chipsRow.append(h('span', { class: 'chip active' }, s));
  const hasAny = Object.keys(query).some((k) => !['page', 'sort', 'size'].includes(k) && query[k]);
  if (hasAny) chipsRow.append(h('button', { class: 'chip', onClick: () => go({}) }, '필터 초기화'));

  const table = h('div', { class: 'card' });
  main.append(
    pageHead('Issue 목록', '등록된 결함, 개선요청, 문의사항의 처리 상태를 확인합니다.', h('a', { class: 'btn btn-primary', href: '#/new' }, '+ Issue 등록')),
    h('div', { class: 'filter-bar' }, search, buildFilterBar(query, go)),
    chipsRow,
    table
  );

  const sort = query.sort || '-updatedAt';
  const COLS = [
    ['id', 'ID'],
    ['type', '유형'],
    ['title', '제목/현상'],
    ['environment', '환경'],
    ['priority', 'Priority'],
    ['status', 'Status'],
    ['reporter', 'Reporter'],
    ['assignee', 'Assignee'],
    ['createdAt', '등록일'],
    ['updatedAt', '업데이트'],
  ];

  async function load() {
    clear(table).append(h('div', { class: 'card-body' }, loadingState(6)));
    const size = parseInt(query.size, 10) || 50;
    const page = parseInt(query.page, 10) || 1;
    try {
      const res = await api.issues.list({ ...query, size, page, sort });
      clear(table);
      if (!res.items.length) {
        table.append(emptyState(query.q ? `"${query.q}"에 대한 결과가 없습니다.` : '조건에 맞는 Issue가 없습니다.', hasAny ? '필터를 변경하거나 초기화해보세요.' : null, hasAny ? h('button', { class: 'btn btn-secondary', onClick: () => go({}) }, '필터 초기화') : h('a', { class: 'btn btn-primary', href: '#/new' }, '+ Issue 등록')));
        return;
      }
      const thead = h('tr', {});
      for (const [key, label] of COLS) {
        const active = sort.replace('-', '') === key;
        const desc = sort.startsWith('-');
        thead.append(h('th', { class: 'sortable', scope: 'col', onClick: () => go({ ...query, sort: active && !desc ? `-${key}` : key }) }, label, active ? h('span', { class: 'arrow' }, desc ? '▼' : '▲') : null));
      }
      const tbody = h('tbody', {});
      for (const it of res.items) {
        tbody.append(
          h(
            'tr',
            { class: 'clickable', onClick: () => navigate(`/issues/${it.id}`) },
            h('td', { class: 'id-cell' }, h('a', { href: `#/issues/${it.id}`, onClick: (e) => e.stopPropagation() }, it.id)),
            h('td', {}, typeBadge(it.type)),
            h('td', { class: 'title-cell', title: it.title }, it.title, it.reopened ? h('span', { class: 'badge warn', style: { marginLeft: '6px' } }, 'Re-open') : null, it.commentCount ? h('span', { class: 'muted small', style: { marginLeft: '6px' } }, `💬${it.commentCount}`) : null),
            h('td', { class: 'env-cell' }, it.environment || '-'),
            h('td', {}, priorityBadge(it.priority)),
            h('td', {}, statusBadge(it.status)),
            h('td', {}, it.reporter),
            h('td', {}, it.assignee || h('span', { class: 'badge warn' }, '미지정')),
            h('td', { class: 'nowrap' }, fmtDate(it.createdAt)),
            h('td', { class: 'nowrap muted' }, fmtDateTime(it.updatedAt))
          )
        );
      }
      const pages = Math.max(1, Math.ceil(res.total / size));
      const pager = h('div', { class: 'pagination' }, h('span', {}, `총 ${res.total}건 · ${page}/${pages} 페이지`));
      const pg = h('div', { class: 'pages' });
      const btn = (label, p, disabled) => h('button', { class: 'btn btn-secondary btn-xs', disabled, onClick: () => go({ ...query, page: p }) }, label);
      pg.append(btn('‹ 이전', page - 1, page <= 1));
      const start = Math.max(1, page - 3);
      for (let p = start; p <= Math.min(pages, start + 6); p++) pg.append(h('button', { class: `btn btn-xs ${p === page ? 'btn-primary' : 'btn-secondary'}`, onClick: () => go({ ...query, page: p }) }, p));
      pg.append(btn('다음 ›', page + 1, page >= pages));
      const sizeSel = h('select', { class: 'input input-sm', style: { width: 'auto' } }, ...[20, 50, 100, 200].map((n) => h('option', { value: n }, `${n}건`)));
      sizeSel.value = size;
      sizeSel.addEventListener('change', () => go({ ...query, size: sizeSel.value, page: undefined }));
      pager.append(h('div', { class: 'flex' }, sizeSel, pg));
      table.append(h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', {}, thead), tbody)), h('div', { class: 'card-body', style: { paddingTop: 0 } }, pager));
    } catch (err) {
      clear(table).append(h('div', { class: 'card-body' }, errorBox(err, load)));
    }
  }
  await load();
}
