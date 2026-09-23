'use strict';

const http = require('http');
const { URL } = require('url');
const { AppError, errors } = require('./utils/errors');
const { parseCookies, readJsonBody, sendJson, queryToObject } = require('./http/helpers');
const { createStaticHandler } = require('./http/static');
const { buildRoutes } = require('./controllers/routes');
const { randomToken } = require('./utils/id');

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * HTTP 서버 생성. container(services)와 라우트를 연결한다.
 */
function createServer(container) {
  const { cfg, logger, sessionService, userService } = container;
  const router = buildRoutes(container);
  const serveStatic = createStaticHandler(cfg.frontendDir);

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    const requestId = randomToken(6);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    res.setHeader('X-Request-Id', requestId);

    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    let status = 200;
    let errorCode = null;

    try {
      if (!pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405);
          res.end();
          status = 405;
        } else {
          serveStatic(req, res, pathname);
        }
        return;
      }

      const matched = router.match(req.method, pathname);
      if (!matched) throw errors.notFound('API를 찾을 수 없습니다.');
      if (matched.methodNotAllowed) throw new AppError('METHOD_NOT_ALLOWED', '허용되지 않는 Method입니다.', 405);
      const { route, params } = matched;

      // CSRF 방어: Cookie 세션 + SameSite=Strict + Custom Header 요구
      if (MUTATING.has(req.method) && req.headers['x-requested-with'] !== 'XMLHttpRequest') {
        throw errors.forbidden('잘못된 요청입니다. (CSRF 보호)');
      }

      // 세션 확인
      const cookies = parseCookies(req.headers.cookie);
      const sid = cookies[sessionService.cookieName];
      const session = sessionService.get(sid);
      let user = null;
      if (session) {
        user = userService.getById(session.userId);
        if (!user || user.active === false) {
          sessionService.destroy(sid);
          user = null;
        }
      }
      if (!user && !route.opts.public) throw errors.unauthorized();

      let body = {};
      if (MUTATING.has(req.method) && !route.opts.rawBody) {
        body = await readJsonBody(req, cfg.maxJsonBodyBytes);
      }

      const ctx = { req, res, params, query: queryToObject(url.searchParams), body, user, session, sid, cfg, requestId };
      const result = (await route.handler(ctx)) || {};
      if (result.raw) {
        result.raw(res);
        return;
      }
      status = result.status || 200;
      sendJson(res, status, result.body === undefined ? {} : result.body, result.headers || {});
    } catch (err) {
      const fsCodes = ['EIO', 'EACCES', 'ENOSPC', 'EPERM', 'EROFS', 'EBUSY', 'EMFILE', 'ENOENT'];
      if (!(err instanceof AppError) && err && fsCodes.includes(err.code)) {
        logger.error('파일 시스템 오류', { requestId, path: pathname, reason: err.message });
        err = errors.storageWriteFailed();
      }
      if (err instanceof AppError) {
        status = err.status;
        errorCode = err.code;
        if (!res.headersSent) sendJson(res, err.status, err.toJSON());
      } else {
        status = 500;
        errorCode = 'INTERNAL_ERROR';
        logger.error('Unhandled error', { requestId, path: pathname, method: req.method, reason: err && err.message, stack: err && err.stack });
        if (!res.headersSent) sendJson(res, 500, { error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' } });
        else res.end();
      }
    } finally {
      if (pathname.startsWith('/api/')) {
        logger.access({ requestId, method: req.method, path: pathname, status, elapsedMs: Date.now() - started, errorCode });
      }
    }
  });

  server.keepAliveTimeout = 65000;
  return server;
}

module.exports = { createServer, SECURITY_HEADERS };
