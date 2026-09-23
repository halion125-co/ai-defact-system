'use strict';

const { STATUS } = require('../models/constants');

/**
 * 06_WORKFLOW_PERMISSION_MATRIX / 02_API_JSON_SPEC §34 기준 권한 판단 함수.
 * UI 힌트와 별개로 모든 Mutation은 서버에서 이 함수들로 재검증한다.
 */
const isAdmin = (user) => !!(user && user.isQualityAdmin);
const isReporter = (user, issue) => !!(user && issue && issue.reporter && issue.reporter.userId === user.userId);
const isAssignee = (user, issue) => !!(user && issue && issue.assignee && issue.assignee.userId === user.userId);
const isActive = (issue) => issue.status !== STATUS.CLOSED && issue.status !== STATUS.CANCEL;

const canEditContent = (user, issue) => isAdmin(user) || isReporter(user, issue);

const canClaim = (user, issue) => !!user && issue.assignee == null && issue.status === STATUS.OPEN;

/** 타인에게 최초 배정은 Admin만, 현재 Assignee는 인계 가능 */
const canAssign = (user, issue) => isAdmin(user) || (isAssignee(user, issue) && isActive(issue));

const canChangePriority = (user, issue) => isAdmin(user) || (isAssignee(user, issue) && isActive(issue));

const canWorkflow = (user, issue) => isAdmin(user) || isAssignee(user, issue);

const canStart = (user, issue) => canWorkflow(user, issue) && issue.status === STATUS.OPEN;
const canResolve = (user, issue) => canWorkflow(user, issue) && issue.status === STATUS.IN_PROGRESS;

const canReopen = (user, issue) =>
  (isAdmin(user) || isReporter(user, issue) || isAssignee(user, issue)) &&
  (issue.status === STATUS.DONE || issue.status === STATUS.CLOSED);

const canCloseVerified = (user, issue) => (isAdmin(user) || isReporter(user, issue)) && issue.status === STATUS.DONE;
const canCloseAgreed = (user, issue) => (isAdmin(user) || isAssignee(user, issue)) && issue.status === STATUS.DONE;

const canCancel = (user, issue) =>
  canWorkflow(user, issue) && [STATUS.OPEN, STATUS.IN_PROGRESS, STATUS.DONE].includes(issue.status);

const canAdminOverride = (user) => isAdmin(user);

/** Comment: Reporter/Assignee/Admin. (Blueprint: 프로젝트 사용자 누구나 조회 가능하나 작성은 관계자) */
const canComment = (user, issue) => isAdmin(user) || isReporter(user, issue) || isAssignee(user, issue);

const canHideComment = (user) => isAdmin(user);

/** 첨부 추가: Reporter/Assignee/Admin */
const canAttach = (user, issue) => (isAdmin(user) || isReporter(user, issue) || isAssignee(user, issue)) && isActive(issue);

const canDeleteAttachment = (user, attachment) => isAdmin(user) || (attachment && attachment.uploadedBy === user.userId);

const canDeploy = (user, issue, operation) =>
  !!(operation && operation.enableDeployment) &&
  canWorkflow(user, issue) &&
  (issue.status === STATUS.DONE || issue.status === STATUS.CLOSED);

const canManageConfig = (user) => isAdmin(user);

function permissionHints(user, issue, operation) {
  return {
    isAdmin: isAdmin(user),
    isReporter: isReporter(user, issue),
    isAssignee: isAssignee(user, issue),
    canEditContent: canEditContent(user, issue),
    canClaim: canClaim(user, issue),
    canAssign: canAssign(user, issue),
    canChangePriority: canChangePriority(user, issue),
    canStart: canStart(user, issue),
    canResolve: canResolve(user, issue),
    canReopen: canReopen(user, issue),
    canCloseVerified: canCloseVerified(user, issue),
    canCloseAgreed: canCloseAgreed(user, issue),
    canCancel: canCancel(user, issue),
    canAdminOverride: canAdminOverride(user),
    canComment: canComment(user, issue),
    canHideComment: canHideComment(user),
    canAttach: canAttach(user, issue),
    canDeploy: canDeploy(user, issue, operation),
  };
}

module.exports = {
  isAdmin,
  isReporter,
  isAssignee,
  canEditContent,
  canClaim,
  canAssign,
  canChangePriority,
  canWorkflow,
  canStart,
  canResolve,
  canReopen,
  canCloseVerified,
  canCloseAgreed,
  canCancel,
  canAdminOverride,
  canComment,
  canHideComment,
  canAttach,
  canDeleteAttachment,
  canDeploy,
  canManageConfig,
  permissionHints,
};
