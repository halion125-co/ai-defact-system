'use strict';

const { errors } = require('../utils/errors');
const { nowIso } = require('../utils/time');
const { padNumber, formatIssueId } = require('../utils/id');
const { makeTitle } = require('../utils/text');
const V = require('../validators/validators');
const P = require('../permissions/permissions');
const { ISSUE_PREFIX, STATUS, PRIORITY, EVENT, DEPLOYMENT_STATUS } = require('../models/constants');
const { applyFilters, sortIssues, toSummary } = require('./IssueQuery');

/**
 * Issue 생성/조회/등록내용 수정 + 모든 Mutation의 공통 코어(mutate).
 */
class IssueService {
  constructor({ issueRepo, sequenceRepo, auditRepo, userService, configService, logger }) {
    this.issueRepo = issueRepo;
    this.sequenceRepo = sequenceRepo;
    this.auditRepo = auditRepo;
    this.userService = userService;
    this.configService = configService;
    this.logger = logger;
  }

  /* ---------------- 공통 Mutation 코어 ---------------- */

  /**
   * Issue lock → 최신 revision 확인 → fn(issue, ctx) → revision+1 → atomic save → audit append.
   * fn은 issue를 직접 변경하고 ctx.event()로 History Event를 추가한다.
   */
  async mutate(issueId, user, expectedRevision, fn) {
    if (!this.issueRepo.exists(issueId)) throw errors.notFound(`Issue를 찾을 수 없습니다: ${issueId}`);
    return this.issueRepo.withLock(issueId, async () => {
      const issue = this.issueRepo.get(issueId);
      if (!issue) throw errors.storageWriteFailed(`Issue 파일이 손상되어 처리할 수 없습니다: ${issueId}`);
      if (expectedRevision !== undefined && issue.revision !== expectedRevision) {
        throw errors.revisionConflict(issue.revision);
      }
      const now = nowIso();
      const actor = this.userService.snapshot(user);
      const events = [];
      const ctx = {
        now,
        actor,
        user,
        events,
        event(eventType, { before, after, comment, data } = {}) {
          const ev = { eventId: null, eventType, actor, timestamp: now };
          if (before !== undefined) ev.before = before;
          if (after !== undefined) ev.after = after;
          if (comment !== undefined && comment !== null && comment !== '') ev.comment = comment;
          if (data !== undefined) ev.data = data;
          events.push(ev);
          return ev;
        },
      };
      const result = await fn(issue, ctx);
      for (const ev of events) ev.eventId = `EVT-${padNumber(await this.sequenceRepo.next('EVT'), 6)}`;
      issue.history = issue.history || [];
      issue.history.push(...events);
      issue.revision += 1;
      issue.updatedAt = now;
      this.issueRepo.save(issue);
      for (const ev of events) this.auditRepo.append({ ...ev, issueId: issue.id, actorId: actor.userId });
      return { issue, result };
    });
  }

  /* ---------------- 생성 ---------------- */

  async _createBase(type, user, fields, title) {
    const prefix = ISSUE_PREFIX[type];
    const n = await this.sequenceRepo.next(prefix);
    const id = formatIssueId(prefix, n);
    if (this.issueRepo.exists(id)) throw errors.storageWriteFailed(`Issue ID 충돌: ${id}`);
    const now = nowIso();
    const actor = this.userService.snapshot(user);
    const issue = {
      id,
      type,
      revision: 1,
      title,
      ...fields,
      priority: PRIORITY.UNASSIGNED,
      status: STATUS.OPEN,
      reporter: actor,
      assignee: null,
      attachments: [],
      resolution: null,
      deployment: { status: DEPLOYMENT_STATUS.NOT_DEPLOYED },
      close: { type: null, comment: null, closedBy: null, closedAt: null, firstClosedAt: null },
      reopenCount: 0,
      comments: [],
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    const evId = `EVT-${padNumber(await this.sequenceRepo.next('EVT'), 6)}`;
    const ev = { eventId: evId, eventType: EVENT.CREATED, actor, timestamp: now, data: { type } };
    issue.history.push(ev);
    await this.issueRepo.withLock(id, async () => this.issueRepo.save(issue));
    this.auditRepo.append({ ...ev, issueId: id, actorId: actor.userId });
    if (this.logger) this.logger.info('Issue 생성', { id, type, actor: actor.userId });
    return { id, revision: issue.revision, status: issue.status, title: issue.title };
  }

  async createDefect(user, body) {
    const data = V.defectCreate(body, this.configService.activeEnvironments());
    const title = makeTitle(data.symptom);
    return this._createBase('DEFECT', user, data, title);
  }

  async createImprovement(user, body) {
    const data = V.improvementCreate(body);
    return this._createBase('IMPROVEMENT', user, data, makeTitle(data.request));
  }

  async createInquiry(user, body) {
    const data = V.inquiryCreate(body);
    return this._createBase('INQUIRY', user, data, makeTitle(data.question));
  }

  /* ---------------- 조회 ---------------- */

  getRaw(issueId) {
    const issue = this.issueRepo.get(issueId);
    if (!issue) {
      if (this.issueRepo.corrupted.has(issueId)) throw errors.storageWriteFailed(`Issue 파일이 손상되었습니다: ${issueId}`);
      throw errors.notFound(`Issue를 찾을 수 없습니다: ${issueId}`);
    }
    return issue;
  }

  getDetail(user, issueId) {
    const issue = this.getRaw(issueId);
    const operation = this.configService.getOperation();
    const permissions = P.permissionHints(user, issue, operation);
    // 숨김 Comment는 Admin 외에는 본문 미노출(원본은 파일/Audit 보존)
    if (!permissions.isAdmin) {
      issue.comments = issue.comments.map((c) => (c.hidden ? { ...c, body: null, attachments: [] } : c));
    }
    issue.attachments = (issue.attachments || []).filter((a) => !a.deleted || permissions.isAdmin);
    return { issue, permissions };
  }

  list(user, query) {
    const operation = this.configService.getOperation();
    const all = this.issueRepo.all();
    const filtered = applyFilters(all, query, { user, operation });
    const sorted = sortIssues(filtered, query.sort || '-updatedAt');
    const size = Math.min(Math.max(parseInt(query.size, 10) || 50, 1), 500);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const start = (page - 1) * size;
    const items = sorted.slice(start, start + size).map(toSummary);
    return { items, page, size, total: sorted.length };
  }

  /* ---------------- 등록내용 수정 ---------------- */

  async updateContent(user, issueId, body) {
    V.requireObject(body);
    const expectedRevision = V.expectedRevision(body);
    const current = this.getRaw(issueId);
    if (!P.canEditContent(user, current)) throw errors.forbidden('본인이 등록한 Issue만 수정할 수 있습니다.');
    const changes = V.contentChanges(current.type, body.changes, this.configService.getProject().environments);

    const { issue } = await this.mutate(issueId, user, expectedRevision, async (iss, ctx) => {
      const before = {};
      const after = {};
      for (const [k, v] of Object.entries(changes)) {
        if (JSON.stringify(iss[k]) === JSON.stringify(v)) continue;
        before[k] = iss[k];
        after[k] = v;
        iss[k] = v;
      }
      if (Object.keys(after).length === 0) throw errors.validation('변경된 내용이 없습니다.');
      if (after.symptom) iss.title = makeTitle(after.symptom);
      if (after.request) iss.title = makeTitle(after.request);
      if (after.question) iss.title = makeTitle(after.question);
      ctx.event(EVENT.UPDATED, { before, after, data: { fields: Object.keys(after), byAdmin: !!user.isQualityAdmin && !P.isReporter(user, iss) } });
    });
    return { id: issue.id, revision: issue.revision };
  }
}

module.exports = { IssueService };
