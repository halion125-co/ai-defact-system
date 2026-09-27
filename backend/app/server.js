'use strict';

const http = require('http');
const path = require('path');
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
  const { cfg, logger, sessionService, userService, repos } = container;
  const router = buildRoutes(container);
  const serveStatic = createStaticHandler(cfg.frontendDir);
  const serveDocs = createStaticHandler(path.resolve(cfg.frontendDir, '..', 'docs'));

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
          if (pathname === '/docs' || pathname.startsWith('/docs/')) serveDocs(req, res, pathname.slice('/docs'.length) || '/');
          else serveStatic(req, res, pathname);
        }
        return;
      }

      const matched = router.match(req.method, pathname);
      if (!matched) throw errors.notFound('API를 찾을 수 없습니다.');
      if (matched.methodNotAllowed) throw new AppError('METHOD_NOT_ALLOWED', '허용되지 않는 Method입니다.', 405);
      const { route, params } = matched;

      let user = null;
      let session = null;
      let sid = null;

      if (route.opts.externalApi) {
        // 외부 연동 API: 쿠키 세션이 아니라 고정 API Key(X-Api-Key)로 인증. 브라우저發 요청이 아니므로 CSRF 방어 대상이 아니다.
        const apiKey = req.headers['x-api-key'];
        if (!repos.configRepo.verifyApiKey(apiKey)) throw errors.unauthorized('API Key가 유효하지 않습니다.');
      } else if (MUTATING.has(req.method) && req.headers['x-requested-with'] !== 'XMLHttpRequest') {
        // CSRF 방어: Cookie 세션 + SameSite=Strict + Custom Header 요구
        throw errors.forbidden('잘못된 요청입니다. (CSRF 보호)');
      }

      if (!route.opts.externalApi) {
        // 세션 확인
        const cookies = parseCookies(req.headers.cookie);
        sid = cookies[sessionService.cookieName];
        session = sessionService.get(sid);
        if (session) {
          user = userService.getById(session.userId);
          if (!user || user.active === false) {
            sessionService.destroy(sid);
            user = null;
          }
        }
        if (!user && !route.opts.public) throw errors.unauthorized();
      }

      let body = {};
      if (MUTATING.has(req.method) && !route.opts.rawBody) {
        body = await readJsonBody(req, cfg.maxJsonBodyBytes);
      }

      if (route.opts.externalApi) {
        // employeeId로 Actor를 지정한다. 요청 body와 query 양쪽에서 허용(GET은 query만 가능).
        const employeeId = (body && body.employeeId) || (queryToObject(url.searchParams) || {}).employeeId;
        user = await userService.findForSession(employeeId);
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
        if (!res.headersSent) {
          const extra = err.status === 413 ? { Connection: 'close' } : {};
          if (err.status === 413) res.on('finish', () => req.destroy());
          sendJson(res, err.status, err.toJSON(), extra);
        }
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
