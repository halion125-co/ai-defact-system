'use strict';

const { errors } = require('../utils/errors');
const V = require('../validators/validators');
const P = require('../permissions/permissions');
const { STATUS, EVENT, TRANSITIONS, DEPLOYMENT_STATUS, PRIORITY } = require('../models/constants');

/**
 * 상태전이/배정/Priority/배포 Action Service.
 * Raw status update는 제공하지 않는다(adminOverride만 예외, 사유 필수).
 */
class WorkflowService {
  constructor({ issueService, userService, configService, logger }) {
    this.issueService = issueService;
    this.userService = userService;
    this.configService = configService;
    this.logger = logger;
  }

  _assertTransition(action, issue) {
    const t = TRANSITIONS[action];
    if (!t.from.includes(issue.status)) throw errors.invalidTransition(issue.status, t.to);
    return t.to;
  }

  _result(issue) {
    return { id: issue.id, revision: issue.revision, status: issue.status, priority: issue.priority, assignee: issue.assignee };
  }

  /* ---------- 배정 ---------- */

  async claim(user, issueId, body) {
    V.requireObject(body);
    const rev = V.expectedRevision(body);
    const { issue } = await this.issueService.mutate(issueId, user, rev, async (iss, ctx) => {
      if (!P.canClaim(user, iss)) {
        if (iss.assignee) throw errors.invalidTransition(iss.status, iss.status, '이미 조치자가 지정된 Issue입니다.');
        throw errors.invalidTransition(iss.status, iss.status, '미배정 Open 상태의 Issue만 [내가 조치]할 수 있습니다.');
      }
      const after = this.userService.snapshot(user);
      iss.assignee = after;
      ctx.event(EVENT.ASSIGNED, { before: { assignee: null }, after: { assignee: after }, data: { mode: 'CLAIM' } });
    });
    return this._result(issue);
  }

  async assign(user, issueId, body) {
    V.requireObject(body);
    const rev = V.expectedRevision(body);
    const targetId = V.text(body.assigneeUserId, { field: 'assigneeUserId', label: '조치자', max: 50 });
    const reason = V.reason(body, '사유', false);
    const target = this.userService.userRepo.findById(targetId);
    if (!target) throw errors.validation('조치자를 찾을 수 없습니다.', { field: 'assigneeUserId' });
    if (target.active === false) throw errors.validation('비활성 사용자에게는 배정할 수 없습니다.', { field: 'assigneeUserId' });

    const { issue } = await this.issueService.mutate(issueId, user, rev, async (iss, ctx) => {
      if (!P.canAssign(user, iss)) {
        if (iss.assignee == null) throw errors.forbidden('미배정 Issue를 타인에게 최초 배정하는 것은 Quality Admin만 가능합니다. [내가 조치]를 이용해주세요.');
        throw errors.forbidden('현재 조치자 또는 Quality Admin만 조치자를 변경할 수 있습니다.');
      }
      if (iss.status === STATUS.CLOSED || iss.status === STATUS.CANCEL) {
        if (!user.isQualityAdmin) throw errors.invalidTransition(iss.status, iss.status, '종료된 Issue는 조치자를 변경할 수 없습니다.');
      }
      if (iss.assignee && iss.assignee.userId === target.userId) throw errors.validation('이미 해당 사용자가 조치자입니다.');
      const before = iss.assignee;
      const after = this.userService.snapshot(target);
      iss.assignee = after;
      ctx.event(EVENT.ASSIGNED, {
        before: { assignee: before },
        after: { assignee: after },
        comment: reason,
        data: { mode: before ? 'HANDOVER' : 'ADMIN_ASSIGN', byAdmin: !!user.isQualityAdmin && !P.isAssignee(user, { assignee: before }) },
      });
    });
    return this._result(issue);
  }

  /* ---------- Priority ---------- */

  async changePriority(user, issueId, body) {
    V.requireObject(body);
    const rev = V.expectedRevision(body);
    const priority = V.priority(body.priority);
    const reason = V.reason(body, '사유', false);
    const project = this.configService.getProject();
    if (priority !== PRIORITY.UNASSIGNED) {
      const def = project.priorities.find((p) => p.code === priority);
      if (!def || def.active === false) throw errors.validation('사용할 수 없는 Priority입니다.', { field: 'priority' });
    }
    const { issue } = await this.issueService.mutate(issueId, user, rev, async (iss, ctx) => {
      if (!P.canChangePriority(user, iss)) throw errors.forbidden('조치자 또는 Quality Admin만 Priority를 변경할 수 있습니다.');
      if (iss.priority === priority) throw errors.validation('이미 동일한 Priority입니다.');
      const before = iss.priority;
      iss.priority = priority;
      ctx.event(EVENT.PRIORITY_CHANGED, { before: { priority: before }, after: { priority }, comment: reason, data: { byAdmin: !!user.isQualityAdmin && !P.isAssignee(user, iss) } });
    });
    return this._result(issue);
  }

  /* ---------- Workflow ---------- */

  async start(user, issueId, body) {
    V.requireObject(body);
    const rev = V.expectedRevision(body);
    const { issue } = await this.issueService.mutate(issueId, user, rev, async (iss, ctx) => {
      if (!P.canWorkflow(user, iss)) throw errors.forbidden('조치자 또는 Quality Admin만 조치를 시작할 수 있습니다.');
      const to = this._assertTransition('start', iss);
      const from = iss.status;
      iss.status = to;
      iss.startedAt = iss.startedAt || ctx.now;
      ctx.event(EVENT.STATUS_CHANGED, { before: { status: from }, after: { status: to }, data: { action: 'START' } });
    });
    return this._result(issue);
  }

  async resolve(user, issueId, body) {
    V.requireObject(body);
    const rev = V.expectedRevision(body);
    const operation = this.configService.getOperation();
    const resolution = V.resolution(body, operation);
    const { issue } = await this.issueService.mutate(issueId, user, rev, async (iss, ctx) => {
      if (!P.canWorkflow(user, iss)) throw errors.forbidden('조치자 또는 Quality Admin만 조치 완료할 수 있습니다.');
      const to = this._assertTransition('resolve', iss);
      const from = iss.status;
      const prev = iss.resolution || {};
      iss.resolution = {
        description: resolution.description,
        changeReference: resolution.changeReference || null,
        targetVersion: resolution.targetVersion || null,
        resolvedBy: user.userId,
        resolvedAt: ctx.now,
        firstResolvedAt: prev.firstResolvedAt || ctx.now,
      };
      iss.status = to;
      ctx.event(EVENT.RESOLVED, {
        before: { status: from },
        after: { status: to },
        comment: resolution.description,
        data: { changeReference: iss.resolution.changeReference, targetVersion: iss.resolution.targetVersion },
      });
    });
    return this._result(issue);
  }

  async reopen(user, issueId, body) {
    V.requireObject(body);
    const rev = V.expectedRevision(body);
    const reason = V.reason(body, '재조치 사유', true);
    const { issue } = await this.issueService.mutate(issueId, user, rev, async (iss, ctx) => {
      if (!(P.isAdmin(user) || P.isReporter(user, iss) || P.isAssignee(user, iss))) {
        throw errors.forbidden('등록자, 조치자 또는 Quality Admin만 재조치 요청할 수 있습니다.');
      }
      const to = this._assertTransition('reopen', iss);
      const from = iss.status;
      iss.status = to;
      iss.reopenCount = (iss.reopenCount || 0) + 1;
      // 재조치 후에는 새 배포가 필요하므로 배포 상태를 미배포로 되돌린다(이전 배포 정보는 History에 보존).
      if (iss.deployment && iss.deployment.status === DEPLOYMENT_STATUS.DEPLOYED) {
        iss.deployment = { status: DEPLOYMENT_STATUS.NOT_DEPLOYED, previous: iss.deployment };
      }
      ctx.event(EVENT.REOPENED, { before: { status: from }, after: { status: to }, comment: reason, data: { reopenCount: iss.reopenCount } });
    });
    return this._result(issue);
  }

  async close(user, issueId, body) {
    V.requireObject(body);
    const rev = V.expectedRevision(body);
    const closeType = V.closeType(body.closeType);
    const comment = V.text(body.comment, { field: 'comment', label: closeType === 'AGREED' ? '확인/합의 내용' : 'Comment', required: closeType === 'AGREED', min: closeType === 'AGREED' ? 5 : 0, max: 2000, multiline: true });
    const { issue } = await this.issueService.mutate(issueId, user, rev, async (iss, ctx) => {
      if (closeType === 'VERIFIED' && !P.canCloseVerified(user, iss)) {
        if (iss.status !== STATUS.DONE) throw errors.invalidTransition(iss.status, STATUS.CLOSED);
        throw errors.forbidden('정상 확인 Close는 등록자 또는 Quality Admin만 가능합니다.');
      }
      if (closeType === 'AGREED' && !P.canCloseAgreed(user, iss)) {
        if (iss.status !== STATUS.DONE) throw errors.invalidTransition(iss.status, STATUS.CLOSED);
        throw errors.forbidden('합의 Close는 조치자 또는 Quality Admin만 가능합니다.');
      }
      const to = this._assertTransition('close', iss);
      const from = iss.status;
      iss.status = to;
      iss.close = {
        type: closeType,
        comment: comment || null,
        closedBy: user.userId,
        closedAt: ctx.now,
        firstClosedAt: (iss.close && iss.close.firstClosedAt) || ctx.now,
      };
      ctx.event(EVENT.CLOSED, { before: { status: from }, after: { status: to }, comment, data: { closeType } });
    });
    return this._result(issue);
  }

  async cancel(user, issueId, body) {
    V.requireObject(body);
    const rev = V.expectedRevision(body);
    const reason = V.reason(body, 'Cancel 사유', true);
    const { issue } = await this.issueService.mutate(issueId, user, rev, async (iss, ctx) => {
      if (!P.canWorkflow(user, iss)) throw errors.forbidden('조치자 또는 Quality Admin만 Cancel할 수 있습니다.');
      const to = this._assertTransition('cancel', iss);
      const from = iss.status;
      iss.status = to;
      iss.cancelledAt = ctx.now;
      iss.cancelledBy = user.userId;
      iss.cancelReason = reason;
      ctx.event(EVENT.CANCELLED, { before: { status: from }, after: { status: to }, comment: reason });
    });
    return this._result(issue);
  }

  async adminOverride(user, issueId, body) {
    V.requireObject(body);
    if (!P.canAdminOverride(user)) throw errors.forbidden('Quality Admin만 상태를 강제 변경할 수 있습니다.');
    const rev = V.expectedRevision(body);
    const status = V.status(body.status);
    const reason = V.reason(body, '변경 사유', true);
    const { issue } = await this.issueService.mutate(issueId, user, rev, async (iss, ctx) => {
      if (iss.status === status) throw errors.validation('현재 상태와 동일합니다.');
      const from = iss.status;
      iss.status = status;
      if (status === STATUS.DONE) {
        iss.resolution = iss.resolution || { description: null, changeReference: null, targetVersion: null };
        iss.resolution.resolvedAt = ctx.now;
        iss.resolution.resolvedBy = user.userId;
        iss.resolution.firstResolvedAt = iss.resolution.firstResolvedAt || ctx.now;
      }
      if (status === STATUS.CLOSED) {
        iss.close = iss.close || {};
        iss.close.closedAt = ctx.now;
        iss.close.closedBy = user.userId;
        iss.close.firstClosedAt = iss.close.firstClosedAt || ctx.now;
        iss.close.type = iss.close.type || 'AGREED';
        iss.close.comment = iss.close.comment || `[관리자 강제 변경] ${reason}`;
      }
      if (status === STATUS.CANCEL) {
        iss.cancelledAt = ctx.now;
        iss.cancelledBy = user.userId;
        iss.cancelReason = reason;
      }
      if (status === STATUS.IN_PROGRESS && (from === STATUS.DONE || from === STATUS.CLOSED)) {
        iss.reopenCount = (iss.reopenCount || 0) + 1;
      }
      ctx.event(EVENT.ADMIN_STATUS_OVERRIDE, { before: { status: from }, after: { status }, comment: reason });
    });
    if (this.logger) this.logger.warn('관리자 상태 강제 변경', { actor: user.userId, issueId, status });
    return this._result(issue);
  }

  /* ---------- 배포 ---------- */

  async registerDeployment(user, issueId, body) {
    const operation = this.configService.getOperation();
    if (!operation.enableDeployment) throw errors.forbidden('배포 정보 기능이 비활성화되어 있습니다.');
    V.requireObject(body);
    const rev = V.expectedRevision(body);
    const { env, version, deployedAt } = V.deployment(body, this.configService.getProject().environments);
    const { issue } = await this.issueService.mutate(issueId, user, rev, async (iss, ctx) => {
      if (!P.canWorkflow(user, iss)) throw errors.forbidden('조치자 또는 Quality Admin만 배포 정보를 등록할 수 있습니다.');
      if (!(iss.status === STATUS.DONE || iss.status === STATUS.CLOSED)) {
        throw errors.invalidTransition(iss.status, iss.status, '배포 완료는 조치 완료(Done) 이후에 등록할 수 있습니다.');
      }
      const before = iss.deployment;
      iss.deployment = {
        status: DEPLOYMENT_STATUS.DEPLOYED,
        environmentId: env.id,
        environmentNameSnapshot: env.displayName,
        version: version || null,
        deployedAt: deployedAt || ctx.now,
        deployedBy: user.userId,
        registeredAt: ctx.now,
      };
      ctx.event(EVENT.DEPLOYED, {
        before: { deployment: before },
        after: { deployment: iss.deployment },
        data: { environment: env.displayName, version: iss.deployment.version, deployedAt: iss.deployment.deployedAt },
      });
    });
    return { id: issue.id, revision: issue.revision, deployment: issue.deployment };
  }
}

module.exports = { WorkflowService };
