'use strict';

const fs = require('fs');
const { Router } = require('../http/router');
const { errors } = require('../utils/errors');
const { parseMultipart } = require('../utils/multipart');
const { readBody } = require('../http/helpers');
const V = require('../validators/validators');
const { applyFilters, sortIssues, toSummary } = require('../services/IssueQuery');

/**
 * API Route 정의. Controller 책임: 파싱 → 세션 → Service 호출 → 응답 변환.
 * 파일/저장소 직접 접근 금지(Service → Repository 계층 사용).
 *
 * handler(ctx) → { status?, body?, headers?, raw?: fn(res) }
 * ctx = { req, res, params, query, body(json), user, session, sid, cfg }
 */
function buildRoutes(c) {
  const r = new Router();
  const PUBLIC = { public: true };
  const adminOnly = (ctx) => {
    if (!ctx.user.isQualityAdmin) throw errors.forbidden('Quality Admin만 사용할 수 있습니다.');
  };

  /* ---------- Session ---------- */
  r.post(
    '/api/session/start',
    async (ctx) => {
      V.requireObject(ctx.body);
      const user = await c.userService.findForSession(ctx.body.employeeId);
      if (ctx.sid) c.sessionService.destroy(ctx.sid);
      const sid = c.sessionService.create(user.userId);
      return { status: 200, body: { user }, headers: { 'Set-Cookie': c.sessionService.cookieHeader(sid, { secure: ctx.req.socket.encrypted }) } };
    },
    PUBLIC
  );
  r.get(
    '/api/session/current',
    async (ctx) => {
      if (!ctx.user) return { status: 200, body: { user: null } };
      return { body: { user: ctx.user } };
    },
    PUBLIC
  );
  r.post(
    '/api/session/end',
    async (ctx) => {
      c.sessionService.destroy(ctx.sid);
      return { body: { ok: true }, headers: { 'Set-Cookie': c.sessionService.clearCookieHeader() } };
    },
    PUBLIC
  );

  /* ---------- Users ---------- */
  r.post(
    '/api/users',
    async (ctx) => {
      const user = await c.userService.register(ctx.body);
      if (ctx.sid) c.sessionService.destroy(ctx.sid);
      const sid = c.sessionService.create(user.userId);
      return { status: 201, body: { user }, headers: { 'Set-Cookie': c.sessionService.cookieHeader(sid, { secure: ctx.req.socket.encrypted }) } };
    },
    PUBLIC
  );
  r.get(
    '/api/users/recent',
    async (ctx) => {
      // 사용자 시작 화면: 브라우저가 기억한 "직전 사용자 1명"의 표시용 정보만 반환한다.
      // 인증 전 화면에서 다른 사용자 이름/사번 목록 전체를 노출하지 않는다(사번 없이 타인 계정 진입 방지).
      const employeeId = String(ctx.query.employeeId || '').trim();
      if (!employeeId) return { body: { users: [] } };
      const user = c.repos.userRepo.findByEmployeeId(employeeId);
      if (!user || user.active === false) return { body: { users: [] } };
      return { body: { users: [{ employeeId: user.employeeId, name: user.name, team: user.team, isQualityAdmin: user.isQualityAdmin }] } };
    },
    PUBLIC
  );
  r.get('/api/users', async (ctx) => ({ body: { users: c.userService.list(ctx.query) } }));
  r.patch('/api/users/:userId', async (ctx) => ({ body: { user: await c.userService.update(ctx.user, ctx.params.userId, ctx.body) } }));

  /* ---------- Config ---------- */
  r.get('/api/config/project', async () => ({ body: c.configService.getProject() }), PUBLIC);
  r.get('/api/config/operation', async () => ({ body: c.configService.getOperation() }));
  r.put('/api/config/project', async (ctx) => ({ body: await c.configService.updateProject(ctx.user, ctx.body) }));
  r.post('/api/config/environments', async (ctx) => ({ status: 201, body: await c.configService.addEnvironment(ctx.user, ctx.body) }));
  r.patch('/api/config/environments/:id', async (ctx) => ({ body: await c.configService.updateEnvironment(ctx.user, ctx.params.id, ctx.body) }));
  r.delete('/api/config/environments/:id', async (ctx) => ({ body: await c.configService.removeEnvironment(ctx.user, ctx.params.id) }));
  r.put('/api/config/environments/order', async (ctx) => ({ body: await c.configService.reorderEnvironments(ctx.user, ctx.body && ctx.body.ids) }));
  r.put('/api/config/priorities', async (ctx) => ({ body: await c.configService.updatePriorities(ctx.user, ctx.body) }));
  r.put('/api/config/operation', async (ctx) => ({ body: await c.configService.updateOperation(ctx.user, ctx.body) }));

  /* ---------- Issues ---------- */
  r.get('/api/issues', async (ctx) => ({ body: c.issueService.list(ctx.user, ctx.query) }));
  r.post('/api/issues/defects', async (ctx) => ({ status: 201, body: await c.issueService.createDefect(ctx.user, ctx.body) }));
  r.post('/api/issues/improvements', async (ctx) => ({ status: 201, body: await c.issueService.createImprovement(ctx.user, ctx.body) }));
  r.post('/api/issues/inquiries', async (ctx) => ({ status: 201, body: await c.issueService.createInquiry(ctx.user, ctx.body) }));
  r.get('/api/issues/:id', async (ctx) => ({ body: c.issueService.getDetail(ctx.user, ctx.params.id) }));
  r.patch('/api/issues/:id', async (ctx) => ({ body: await c.issueService.updateContent(ctx.user, ctx.params.id, ctx.body) }));

  /* ---------- Actions ---------- */
  const actions = {
    claim: (ctx) => c.workflowService.claim(ctx.user, ctx.params.id, ctx.body),
    assign: (ctx) => c.workflowService.assign(ctx.user, ctx.params.id, ctx.body),
    priority: (ctx) => c.workflowService.changePriority(ctx.user, ctx.params.id, ctx.body),
    start: (ctx) => c.workflowService.start(ctx.user, ctx.params.id, ctx.body),
    resolve: (ctx) => c.workflowService.resolve(ctx.user, ctx.params.id, ctx.body),
    reopen: (ctx) => c.workflowService.reopen(ctx.user, ctx.params.id, ctx.body),
    close: (ctx) => c.workflowService.close(ctx.user, ctx.params.id, ctx.body),
    cancel: (ctx) => c.workflowService.cancel(ctx.user, ctx.params.id, ctx.body),
    'admin-status': (ctx) => c.workflowService.adminOverride(ctx.user, ctx.params.id, ctx.body),
  };
  r.post('/api/issues/:id/actions/:action', async (ctx) => {
    const fn = actions[ctx.params.action];
    if (!fn) throw errors.notFound(`알 수 없는 Action: ${ctx.params.action}`);
    return { body: await fn(ctx) };
  });

  /* ---------- Comments ---------- */
  r.post('/api/issues/:id/comments', async (ctx) => ({ status: 201, body: await c.commentService.add(ctx.user, ctx.params.id, ctx.body) }));
  r.post('/api/issues/:id/comments/:commentId/hide', async (ctx) => ({ body: await c.commentService.hide(ctx.user, ctx.params.id, ctx.params.commentId, ctx.body) }));

  /* ---------- Attachments ---------- */
  r.post(
    '/api/issues/:id/attachments',
    async (ctx) => {
      const ct = ctx.req.headers['content-type'] || '';
      if (!ct.toLowerCase().startsWith('multipart/form-data')) throw errors.validation('multipart/form-data 요청이 필요합니다.');
      const limit = c.attachmentService.maxBytes() * 10 + 1024 * 1024;
      const buf = await readBody(ctx.req, { limit });
      const { fields, files } = parseMultipart(buf, ct);
      const expectedRevision = fields.expectedRevision !== undefined ? parseInt(fields.expectedRevision, 10) : undefined;
      if (expectedRevision !== undefined && Number.isNaN(expectedRevision)) throw errors.validation('expectedRevision이 올바르지 않습니다.');
      return { status: 201, body: await c.attachmentService.upload(ctx.user, ctx.params.id, files, expectedRevision) };
    },
    { rawBody: true }
  );
  r.get('/api/issues/:id/attachments/:attachmentId', async (ctx) => {
    const { file, attachment, contentType, inlineAllowed } = c.attachmentService.resolveForDownload(ctx.user, ctx.params.id, ctx.params.attachmentId);
    const inline = ctx.query.inline === '1' && inlineAllowed;
    const encoded = encodeURIComponent(attachment.originalName);
    return {
      raw: (res) => {
        const stat = fs.statSync(file);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stat.size,
          'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encoded}`,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-store',
        });
        fs.createReadStream(file).pipe(res);
      },
    };
  });
  r.delete('/api/issues/:id/attachments/:attachmentId', async (ctx) => {
    const rev = ctx.query.expectedRevision !== undefined ? parseInt(ctx.query.expectedRevision, 10) : ctx.body && ctx.body.expectedRevision;
    return { body: await c.attachmentService.remove(ctx.user, ctx.params.id, ctx.params.attachmentId, Number.isInteger(rev) ? rev : undefined) };
  });

  /* ---------- Deployment ---------- */
  r.post('/api/issues/:id/deployments', async (ctx) => ({ status: 201, body: await c.workflowService.registerDeployment(ctx.user, ctx.params.id, ctx.body) }));

  /* ---------- Dashboard ---------- */
  r.get('/api/dashboard/summary', async (ctx) => ({ body: c.dashboardService.summary(ctx.query) }));
  r.get('/api/dashboard/daily', async (ctx) => ({ body: c.dashboardService.daily(ctx.query) }));
  r.get('/api/dashboard/burnup', async (ctx) => ({ body: c.dashboardService.burnup(ctx.query) }));
  r.get('/api/dashboard/distribution', async (ctx) => ({ body: c.dashboardService.distribution(ctx.query) }));
  r.get('/api/dashboard/attention', async (ctx) => ({ body: c.dashboardService.attention(ctx.query) }));

  /* ---------- Search ---------- */
  r.get('/api/search', async (ctx) => {
    const q = String(ctx.query.q || '').trim();
    if (!q) return { body: { items: [] } };
    const operation = c.configService.getOperation();
    const found = applyFilters(c.repos.issueRepo.all(), { q, status: 'ALL' }, { operation, user: ctx.user });
    const exact = found.filter((i) => i.id.toLowerCase() === q.toLowerCase());
    const rest = sortIssues(
      found.filter((i) => i.id.toLowerCase() !== q.toLowerCase()),
      '-updatedAt'
    );
    const envNames = new Map(c.configService.getProject().environments.map((e) => [e.id, e.displayName]));
    return { body: { items: [...exact, ...rest].slice(0, Math.min(parseInt(ctx.query.limit, 10) || 10, 50)).map((i) => toSummary(i, envNames)), total: found.length } };
  });

  /* ---------- MY 카운트 ---------- */
  r.get('/api/my/counts', async (ctx) => {
    const operation = c.configService.getOperation();
    const all = c.repos.issueRepo.all();
    const cnt = (mine) => applyFilters(all, { mine }, { operation, user: ctx.user }).length;
    return { body: { reported: cnt('reported'), assigned: cnt('assigned'), waiting: cnt('waiting') } };
  });

  /* ---------- Admin: Backup / Audit / Health ---------- */
  r.get('/api/admin/backup/status', async (ctx) => {
    adminOnly(ctx);
    return { body: c.backupService.status() };
  });
  r.post('/api/admin/backup/run', async (ctx) => {
    adminOnly(ctx);
    return { body: await c.backupService.run({ trigger: 'manual', actor: ctx.user.userId }) };
  });
  r.get('/api/admin/audit', async (ctx) => {
    adminOnly(ctx);
    return { body: { items: c.repos.auditRepo.recent({ limit: Math.min(parseInt(ctx.query.limit, 10) || 100, 1000), issueId: ctx.query.issueId }) } };
  });
  r.get('/api/admin/health', async (ctx) => {
    adminOnly(ctx);
    return {
      body: {
        issues: c.repos.issueRepo.count(),
        corrupted: c.repos.issueRepo.corruptedList(),
        sequence: c.repos.sequenceRepo.current(),
        startupWarnings: c.startup.warnings,
        uptimeSec: Math.round(process.uptime()),
        dataDir: c.cfg.dataDir,
        uploadDir: c.cfg.uploadDir,
        backupDir: c.cfg.backupDir,
      },
    };
  });
  r.get('/api/health', async () => ({ body: { ok: true, ts: new Date().toISOString() } }), PUBLIC);

  return r;
}

module.exports = { buildRoutes };
