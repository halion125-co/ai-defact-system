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
      // 권한/상태/입력 검증(fn)을 먼저 수행하고 revision을 비교한다.
      // → 권한 없는 사용자는 409가 아닌 403/400을 받는다. fn은 복제본(issue)을 변경하므로 충돌 시 폐기하면 된다.
      //   파일 쓰기 등 부수효과가 있는 fn은 ctx.assertRevision()으로 먼저 검사해야 한다.
      const now = nowIso();
      const actor = this.userService.snapshot(user);
      const events = [];
      const ctx = {
        now,
        actor,
        user,
        events,
        expectedRevision,
        assertRevision() {
          if (expectedRevision !== undefined && issue.revision !== expectedRevision) throw errors.revisionConflict(issue.revision);
        },
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
      ctx.assertRevision();
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

  async _createBase(type, user, fields, title, status = STATUS.OPEN) {
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
      status,
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
    const ev = { eventId: evId, eventType: EVENT.CREATED, actor, timestamp: now, data: { type, status } };
    issue.history.push(ev);
    await this.issueRepo.withLock(id, async () => this.issueRepo.save(issue));
    this.auditRepo.append({ ...ev, issueId: id, actorId: actor.userId });
    if (this.logger) this.logger.info('Issue 생성', { id, type, status, actor: actor.userId });
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

  _draftTitle(type, data) {
    const src = type === 'DEFECT' ? data.symptom : type === 'IMPROVEMENT' ? data.request : data.question;
    return src ? makeTitle(src) : '(제목 없음, 임시저장)';
  }

  /** 임시저장(DRAFT) 생성: 유형만 정해지면 나머지는 비워둔 채 저장 가능 */
  async createDraft(user, type, body) {
    if (!ISSUE_PREFIX[type]) throw errors.validation('유형이 올바르지 않습니다.', 'type');
    const data = V.draftCreate(type, body, this.configService.activeEnvironments());
    return this._createBase(type, user, data, this._draftTitle(type, data), STATUS.DRAFT);
  }

  /** 임시저장 내용 수정(작성 이어하기). Reporter 본인만 가능, DRAFT 상태에서만 허용 */
  async updateDraft(user, issueId, body) {
    V.requireObject(body);
    const expectedRevision = V.expectedRevision(body);
    const current = this.getRaw(issueId);
    if (current.status !== STATUS.DRAFT) throw errors.validation('임시저장 상태의 Issue만 수정할 수 있습니다.');
    if (!P.isReporter(user, current)) throw errors.forbidden('본인이 작성한 임시저장만 수정할 수 있습니다.');
    // changes에 없는 필드는 기존 값을 유지한다(전체 교체가 아닌 부분 갱신).
    const merged = { ...current, ...(body.changes || {}) };
    if (body.changes && body.changes.environmentId !== undefined) merged.environmentId = body.changes.environmentId;
    else if (current.environment) merged.environmentId = current.environment.id;
    const data = V.draftCreate(current.type, merged, this.configService.activeEnvironments());
    const { issue } = await this.mutate(issueId, user, expectedRevision, async (iss, ctx) => {
      const before = {};
      for (const k of Object.keys(data)) before[k] = iss[k];
      Object.assign(iss, data);
      iss.title = this._draftTitle(iss.type, data);
      ctx.event(EVENT.UPDATED, { before, after: data, data: { fields: Object.keys(data), draft: true } });
    });
    return { id: issue.id, revision: issue.revision };
  }

  /** 임시저장을 정식 등록으로 전환: 유형별 필수값을 정식 기준으로 재검증 후 OPEN으로 전이 */
  async submitDraft(user, issueId, body) {
    V.requireObject(body || {});
    const expectedRevision = V.expectedRevision(body);
    const current = this.getRaw(issueId);
    if (current.status !== STATUS.DRAFT) throw errors.validation('임시저장 상태의 Issue만 등록할 수 있습니다.');
    if (!P.isReporter(user, current)) throw errors.forbidden('본인이 작성한 임시저장만 등록할 수 있습니다.');
    const merged = { ...current, ...(body.changes || {}) };
    const data =
      current.type === 'DEFECT'
        ? V.defectCreate({ ...merged, environmentId: (body.changes && body.changes.environmentId) || (current.environment && current.environment.id) }, this.configService.activeEnvironments())
        : current.type === 'IMPROVEMENT'
          ? V.improvementCreate(merged)
          : V.inquiryCreate(merged);
    const title = this._draftTitle(current.type, data) === '(제목 없음, 임시저장)' ? current.title : this._draftTitle(current.type, data);
    const { issue } = await this.mutate(issueId, user, expectedRevision, async (iss, ctx) => {
      Object.assign(iss, data);
      iss.title = title;
      iss.status = STATUS.OPEN;
      ctx.event(EVENT.STATUS_CHANGED, { before: { status: STATUS.DRAFT }, after: { status: STATUS.OPEN }, data: { mode: 'DRAFT_SUBMIT' } });
    });
    return { id: issue.id, revision: issue.revision, status: issue.status };
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
    // 임시저장은 작성자 본인 또는 Quality Admin만 조회 가능(URL 직접 접근으로도 타인에게 노출되지 않음)
    if (issue.status === STATUS.DRAFT && !P.isAdmin(user) && !P.isReporter(user, issue)) throw errors.notFound(`Issue를 찾을 수 없습니다: ${issueId}`);
    const operation = this.configService.getOperation();
    const permissions = P.permissionHints(user, issue, operation);
    // 숨김 Comment는 Admin 외에는 본문 미노출(원본은 파일/Audit 보존). history의 COMMENTED/COMMENT_HIDDEN 이벤트도 함께 마스킹
    if (!permissions.isAdmin) {
      const hiddenIds = new Set(issue.comments.filter((c) => c.hidden).map((c) => c.commentId));
      issue.comments = issue.comments.map((c) => (c.hidden ? { ...c, body: null, attachments: [], hiddenReason: undefined } : c));
      issue.history = (issue.history || []).map((ev) => {
        if (ev.eventType === EVENT.COMMENTED && ev.data && hiddenIds.has(ev.data.commentId)) return { ...ev, comment: undefined, data: { ...ev.data, attachments: [] } };
        if (ev.eventType === EVENT.COMMENT_HIDDEN && ev.data) return { ...ev, comment: undefined, data: { commentId: ev.data.commentId } };
        return ev;
      });
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
    const envNames = new Map(this.configService.getProject().environments.map((e) => [e.id, e.displayName]));
    const items = sorted.slice(start, start + size).map((i) => toSummary(i, envNames));
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
