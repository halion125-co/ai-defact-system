/**
 * SCR-040 MY. 내가 등록 / 내가 조치 / 확인대기 + Count Badge.
 */
import { api } from '../api.js';
import { h, clear, pageHead, statusBadge, priorityBadge, typeBadge, fmtDate, fmtDateTime, errorBox, loadingState, emptyState } from '../ui.js';

const TABS = [
  { key: 'reported', label: '내가 등록', desc: '내가 Reporter인 Issue', empty: '등록한 Issue가 없습니다.' },
  { key: 'assigned', label: '내가 조치', desc: '내가 조치자인 진행 중 Issue (Closed/Cancel 제외)', empty: '현재 조치할 Issue가 없습니다.', emptyDesc: '새 Issue가 배정되면 이곳에서 확인할 수 있습니다.' },
  { key: 'waiting', label: '확인대기', desc: '내가 등록했고 조치가 완료되어 재검증이 필요한 Issue', empty: '재검증을 기다리는 Issue가 없습니다.' },
];

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
    try {
      const res = await api.issues.list({ mine: tab.key, size: 200, sort: tab.key === 'waiting' ? '-updatedAt' : '-updatedAt' });
      clear(content);
      if (!res.items.length) {
        content.append(emptyState(tab.empty, tab.emptyDesc, tab.key === 'reported' ? h('a', { class: 'btn btn-primary', href: '#/new' }, '+ Issue 등록') : h('a', { class: 'btn btn-secondary', href: '#/issues/kanban?quick=unassigned' }, '미배정 Issue 보기')));
        return;
      }
      const tbody = h('tbody', {});
      for (const it of res.items) {
        tbody.append(
          h(
            'tr',
            { class: 'clickable', onClick: () => navigate(`/issues/${it.id}`) },
            h('td', { class: 'id-cell' }, h('a', { href: `#/issues/${it.id}` }, it.id)),
            h('td', {}, typeBadge(it.type)),
            h('td', { class: 'title-cell', title: it.title }, it.title, it.reopened ? h('span', { class: 'badge warn', style: { marginLeft: '6px' } }, 'Re-open') : null),
            h('td', { class: 'env-cell' }, it.environment || '-'),
            h('td', {}, priorityBadge(it.priority)),
            h('td', {}, statusBadge(it.status)),
            h('td', {}, tab.key === 'reported' ? it.assignee || h('span', { class: 'badge warn' }, '미지정') : it.reporter),
            h('td', { class: 'nowrap' }, fmtDate(it.createdAt)),
            h('td', { class: 'nowrap muted' }, fmtDateTime(it.updatedAt)),
            h('td', {}, tab.key === 'waiting' ? h('a', { class: 'btn btn-primary btn-xs', href: `#/issues/${it.id}` }, '재검증하기') : null)
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
