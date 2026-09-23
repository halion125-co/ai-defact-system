/**
 * Hash Router. '#/issues/:id?x=1' 형태. 필터 상태는 URL Query와 동기화.
 */
const routes = [];
let current = null;
let notFoundHandler = null;
let beforeEach = null;

export function route(pattern, handler) {
  const keys = [];
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/\//g, '\\/')
        .replace(/:([A-Za-z_]+)/g, (_, k) => {
          keys.push(k);
          return '([^\\/?]+)';
        }) +
      '\\/?$'
  );
  routes.push({ pattern, regex, keys, handler });
}

export function setNotFound(fn) {
  notFoundHandler = fn;
}
export function setBeforeEach(fn) {
  beforeEach = fn;
}

export function parseHash(hash = location.hash) {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  const [path, qs = ''] = h.split('?');
  const query = {};
  for (const [k, v] of new URLSearchParams(qs)) query[k] = v;
  return { path: path || '/', query };
}

export function buildHash(path, query = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, v);
  }
  const s = sp.toString();
  return `#${path}${s ? `?${s}` : ''}`;
}

export function navigate(path, query = {}, { replace = false } = {}) {
  const target = buildHash(path, query);
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
  if (replace) dispatch();
}

export function currentRoute() {
  return current;
}

export async function dispatch() {
  const { path, query } = parseHash();
  if (beforeEach) {
    const redirect = await beforeEach({ path, query });
    if (redirect) {
      navigate(redirect.path, redirect.query || {}, { replace: true });
      return;
    }
  }
  for (const r of routes) {
    const m = r.regex.exec(path);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    current = { path, query, params, pattern: r.pattern };
    await r.handler({ path, query, params });
    return;
  }
  current = { path, query, params: {}, pattern: null };
  if (notFoundHandler) notFoundHandler({ path, query });
}

export function startRouter() {
  window.addEventListener('hashchange', () => dispatch());
  return dispatch();
}
