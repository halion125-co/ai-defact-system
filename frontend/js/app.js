/**
 * Application Shell + Routing. Dark Navy Sidebar + Dark Header + White Workspace.
 */
import { api, onUnauthorized } from './api.js';
import { store } from './store.js';
import { route, setNotFound, setBeforeEach, startRouter, navigate, parseHash, buildHash } from './router.js';
import { h, clear, toast, typeBadge, statusBadge, initials, debounce, emptyState } from './ui.js';
import { renderLogin } from './pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderKanban } from './pages/kanban.js';
import { renderList } from './pages/list.js';
import { renderDetail } from './pages/detail.js';
import { renderMy } from './pages/my.js';
import { renderCreate } from './pages/create.js';
import { renderSettings } from './pages/settings.js';

const app = document.getElementById('app');
let shellEl = null;
let mainEl = null;
let currentPage = null;

const NAV = [
  { path: '/dashboard', label: 'Dashboard', ico: '◫' },
  { path: '/issues/kanban', label: 'Issue 관리', ico: '☰', children: [{ path: '/issues/kanban', label: 'Kanban' }, { path: '/issues/list', label: '목록' }] },
  { path: '/my', label: 'MY', ico: '◎', children: [{ path: '/my', query: { tab: 'reported' }, label: '내가 등록' }, { path: '/my', query: { tab: 'assigned' }, label: '내가 조치' }, { path: '/my', query: { tab: 'waiting' }, label: '확인대기' }] },
];

function isActive(path, query, cur) {
  if (path === '/issues/kanban' && cur.path.startsWith('/issues')) return true;
  if (path === '/my' && cur.path === '/my') return !query || (cur.query.tab || 'reported') === query.tab;
  return cur.path === path;
}

function renderShell() {
  const user = store.user;
  const p = store.project || {};
  const sidebar = h('aside', { class: 'sidebar', 'aria-label': '주 메뉴' });
  const brand = h('a', { class: 'brand', href: '#/dashboard' }, h('span', { class: 'dot' }), h('span', {}, 'KT AI Agent', h('small', {}, '프로젝트 품질 · 결함관리')));
  const nav = h('nav', { class: 'nav' });
  const cur = parseHash();
  for (const item of NAV) {
    const active = isActive(item.path, null, cur) && !(item.children && item.children.some((c) => isActive(c.path, c.query, cur) && c.path !== item.path));
    nav.append(h('a', { class: `nav-item${item.path !== '/my' && item.path !== '/issues/kanban' && cur.path === item.path ? ' active' : ''}`, href: `#${item.path}` }, h('span', { class: 'ico' }, item.ico), item.label));
    void active;
    if (item.children) {
      const sub = h('div', { class: 'nav-sub' });
      for (const c of item.children) {
        const q = c.query ? `?${new URLSearchParams(c.query)}` : '';
        sub.append(h('a', { class: `nav-item${isActive(c.path, c.query, cur) && cur.path === c.path ? ' active' : ''}`, href: `#${c.path}${q}` }, c.label));
      }
      nav.append(sub);
    }
  }
  nav.append(h('a', { class: 'nav-item nav-primary', href: '#/new' }, '+ Issue 등록'));
  if (store.isAdmin) {
    nav.append(h('div', { class: 'nav-section' }, 'Quality Admin'));
    nav.append(h('a', { class: `nav-item${cur.path === '/settings' ? ' active' : ''}`, href: '#/settings' }, h('span', { class: 'ico' }, '⚙'), '설정'));
  }
  const foot = h('div', { class: 'sidebar-foot' }, h('img', { src: '/assets/kt-logo.svg', alt: 'KT', width: 36 }), h('span', {}, 'v1.0'));
  sidebar.append(brand, nav, foot);

  // Header
  const searchInput = h('input', { type: 'search', placeholder: 'Issue 검색 (ID, 제목, 등록자, Comment)', 'aria-label': 'Issue 검색' });
  const pop = h('div', { class: 'search-pop hidden' });
  const closePop = () => pop.classList.add('hidden');
  const doSearch = debounce(async () => {
    const q = searchInput.value.trim();
    if (!q) return closePop();
    try {
      const { items } = await api.search(q, 8);
      clear(pop);
      if (!items.length) pop.append(h('div', { class: 'empty' }, '검색 결과가 없습니다.'));
      for (const it of items) {
        pop.append(
          h(
            'div',
            { class: 'row', onClick: () => { closePop(); searchInput.value = ''; navigate(`/issues/${it.id}`); } },
            h('span', { class: 'mono', style: { fontWeight: 600, minWidth: '80px' } }, it.id),
            typeBadge(it.type),
            h('span', { class: 'grow nowrap', style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, it.title),
            statusBadge(it.status)
          )
        );
      }
      pop.append(h('div', { class: 'row', onClick: () => { closePop(); navigate('/issues/list', { q }); searchInput.value = ''; } }, h('span', { class: 'muted' }, `"${q}" 전체 검색 결과 보기 →`)));
      pop.classList.remove('hidden');
    } catch {
      closePop();
    }
  }, 220);
  searchInput.addEventListener('input', doSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      closePop();
      navigate('/issues/list', { q: searchInput.value.trim() });
      searchInput.value = '';
    }
    if (e.key === 'Escape') closePop();
  });
  document.addEventListener('click', (e) => {
    if (!pop.contains(e.target) && e.target !== searchInput) closePop();
  });
  const header = h(
    'header',
    { class: 'header' },
    h('div', { class: 'proj' }, p.customerName || '고객사', h('span', {}, '|'), p.projectName || '프로젝트'),
    h('div', { class: 'search' }, h('span', { class: 'ico' }, '⌕'), searchInput, pop),
    h('div', { class: 'spacer' }),
    h(
      'div',
      { class: 'user' },
      h('div', { class: 'avatar' }, initials(user.name)),
      h('div', {}, h('div', { class: 'name' }, user.name), h('div', { class: 'role' }, user.isQualityAdmin ? 'Quality Admin' : user.team)),
      h('button', { class: 'btn btn-ghost btn-sm', onClick: switchUser }, '사용자 변경')
    )
  );
  mainEl = h('main', { class: 'main', id: 'main' });
  shellEl = h('div', { class: 'shell' }, sidebar, header, mainEl);
  clear(app).append(shellEl);
}

async function switchUser() {
  try {
    await api.session.end();
  } catch {
    /* ignore */
  }
  store.setUser(null);
  shellEl = null;
  navigate('/start');
}

function ensureShell() {
  if (!shellEl || !app.contains(shellEl)) renderShell();
  else {
    // active 메뉴 갱신
    const cur = parseHash();
    shellEl.querySelectorAll('.nav a.nav-item').forEach((a) => {
      const href = a.getAttribute('href').slice(1);
      const [path, qs = ''] = href.split('?');
      const tab = new URLSearchParams(qs).get('tab');
      let active = false;
      if (path === '/my') active = cur.path === '/my' && (tab ? (cur.query.tab || 'reported') === tab : false);
      else if (path === '/issues/kanban' && a.parentElement.classList.contains('nav')) active = false;
      else active = cur.path === path;
      a.classList.toggle('active', active);
    });
  }
  return mainEl;
}

function mount(renderFn) {
  return async (ctx) => {
    const main = ensureShell();
    clear(main);
    main.scrollTop = 0;
    window.scrollTo(0, 0);
    if (currentPage && currentPage.destroy) currentPage.destroy();
    currentPage = (await renderFn(main, { ...ctx, navigate })) || null;
  };
}

/* ---------- Routes ---------- */
route('/start', async (ctx) => {
  shellEl = null;
  clear(app);
  await renderLogin(app, { ...ctx, navigate, onLogin: afterLogin });
});
route('/', async () => navigate('/dashboard', {}, { replace: true }));
route('/dashboard', mount(renderDashboard));
route('/issues', async () => navigate('/issues/kanban', {}, { replace: true }));
route('/issues/kanban', mount(renderKanban));
route('/issues/list', mount(renderList));
route('/issues/:id', mount(renderDetail));
route('/my', mount(renderMy));
route('/new', mount(renderCreate));
route('/new/:type', mount(renderCreate));
route('/settings', mount(renderSettings));
setNotFound(mount(async (main) => main.append(emptyState('페이지를 찾을 수 없습니다.', null, h('a', { class: 'btn btn-primary', href: '#/dashboard' }, 'Dashboard로 이동')))));

const PENDING_KEY = 'dms.pendingRoute';
setBeforeEach(async ({ path, query }) => {
  if (path === '/start') return null;
  // 화면 이동 시 세션 사용자 재확인: 비활성화/권한 변경이 재로그인 없이 즉시 반영된다.
  if (store.user) {
    try {
      const { user } = await api.session.current();
      if (!user) store.user = null;
      else if (JSON.stringify(user) !== JSON.stringify(store.user)) {
        store.user = user;
        shellEl = null; // 권한 변경 시 Shell(설정 메뉴 등) 재구성
      }
    } catch {
      /* 네트워크 오류 시 캐시 유지 */
    }
  }
  if (!store.user) {
    try {
      sessionStorage.setItem(PENDING_KEY, buildHash(path, query));
    } catch {
      /* ignore */
    }
    return { path: '/start' };
  }
  return null;
});
function afterLogin() {
  let pending = null;
  try {
    pending = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
  if (pending && pending.startsWith('#/') && !pending.startsWith('#/start')) location.hash = pending;
  else navigate('/dashboard', {}, { replace: true });
}

onUnauthorized(() => {
  if (store.user) {
    store.setUser(null);
    toast('세션이 만료되었습니다. 다시 사용자를 선택해주세요.', 'error');
    navigate('/start');
  }
});

store.subscribe(() => {
  if (store.user && shellEl && app.contains(shellEl)) {
    // 프로젝트명/사용자 변경 시 헤더 갱신
    renderShell();
    const { path } = parseHash();
    if (path !== '/start') {
      const ev = new Event('hashchange');
      window.dispatchEvent(ev);
    }
  }
});

(async function boot() {
  try {
    await store.loadSession();
  } catch (err) {
    clear(app).append(h('div', { class: 'boot' }, '서버에 연결할 수 없습니다. 서비스 상태를 확인해주세요.'));
    return;
  }
  document.title = `${(store.project && store.project.projectName) || '결함관리'} · KT AI Agent`;
  if (!location.hash || location.hash === '#' || location.hash === '#/') location.hash = store.user ? '#/dashboard' : '#/start';
  await startRouter();
})();
