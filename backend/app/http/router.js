'use strict';

/**
 * 경량 Router: 'GET /api/issues/:id/actions/:action' 형태 패턴 지원.
 */
class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler, opts = {}) {
    const keys = [];
    const regex = new RegExp(
      '^' +
        pattern
          .replace(/\//g, '\\/')
          .replace(/:([A-Za-z_]+)/g, (_, k) => {
            keys.push(k);
            return '([^\\/]+)';
          }) +
        '\\/?$'
    );
    this.routes.push({ method, pattern, regex, keys, handler, opts });
    return this;
  }

  get(p, h, o) {
    return this.add('GET', p, h, o);
  }
  post(p, h, o) {
    return this.add('POST', p, h, o);
  }
  put(p, h, o) {
    return this.add('PUT', p, h, o);
  }
  patch(p, h, o) {
    return this.add('PATCH', p, h, o);
  }
  delete(p, h, o) {
    return this.add('DELETE', p, h, o);
  }

  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.regex.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route: r, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}

module.exports = { Router };
