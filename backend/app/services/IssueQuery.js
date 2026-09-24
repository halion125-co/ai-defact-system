'use strict';

const { STATUS, PRIORITY, EVENT, DEPLOYMENT_STATUS } = require('../models/constants');
const { dateKey, dayRange, daysBetween, nowIso } = require('../utils/time');

/**
 * Issue 목록/Dashboard 공통 필터·정렬·요약 로직.
 * 모든 Drill-down은 이 필터를 공유하므로 KPI 건수와 목록 건수가 항상 일치한다.
 */

const csv = (v) =>
  v === undefined || v === null || v === ''
    ? null
    : String(v)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

function isUnresolved(issue) {
  return issue.status === STATUS.OPEN || issue.status === STATUS.IN_PROGRESS;
}

function isStale(issue, operation, nowMs = Date.now()) {
  if (!isUnresolved(issue)) return false;
  const days = (operation && operation.staleIssueDays) || 3;
  const lastActivity = new Date(issue.updatedAt || issue.createdAt).getTime();
  return nowMs - lastActivity >= days * 86400000;
}

function isReopened(issue) {
  return (issue.reopenCount || 0) > 0 || (issue.history || []).some((h) => h.eventType === EVENT.REOPENED);
}

/** 현재 Re-open 상태로 관리 중(재조치 이력이 있고 아직 종료되지 않음) */
function isReopenedCurrent(issue) {
  return isReopened(issue) && issue.status !== STATUS.CLOSED && issue.status !== STATUS.CANCEL;
}

function deploymentStatus(issue) {
  return (issue.deployment && issue.deployment.status) || DEPLOYMENT_STATUS.NOT_DEPLOYED;
}

function isWaitingDeploy(issue, operation) {
  if (!operation || !operation.enableDeployment) return false;
  return issue.status === STATUS.DONE && deploymentStatus(issue) === DEPLOYMENT_STATUS.NOT_DEPLOYED;
}

function isWaitingVerification(issue, operation) {
  if (issue.status !== STATUS.DONE) return false;
  if (!operation || !operation.enableDeployment) return true;
  return deploymentStatus(issue) === DEPLOYMENT_STATUS.DEPLOYED;
}

function isCriticalUnresolved(issue) {
  return issue.priority === PRIORITY.CRITICAL && isUnresolved(issue);
}

function firstResolvedAt(issue) {
  return issue.resolution && issue.resolution.firstResolvedAt ? issue.resolution.firstResolvedAt : null;
}

function firstClosedAt(issue) {
  return issue.close && issue.close.firstClosedAt ? issue.close.firstClosedAt : null;
}

function inRange(iso, from, to) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (from && t < from) return false;
  if (to && t > to) return false;
  return true;
}

function textMatch(issue, q) {
  const key = q.toLowerCase();
  const fields = [
    issue.id,
    issue.title,
    issue.location,
    issue.symptom,
    issue.expectedResult,
    issue.target,
    issue.request,
    issue.reason,
    issue.question,
    issue.reporter && issue.reporter.nameSnapshot,
    issue.assignee && issue.assignee.nameSnapshot,
    issue.resolution && issue.resolution.description,
    issue.resolution && issue.resolution.changeReference,
    ...(issue.reproductionSteps || []).map((s) => s.text),
    ...(issue.comments || []).filter((c) => !c.hidden).map((c) => c.body),
  ];
  return fields.some((f) => f && String(f).toLowerCase().includes(key));
}

/**
 * @param {object[]} issues
 * @param {object} query - URL query
 * @param {{user?:object, operation?:object, now?:number}} ctx
 */
function applyFilters(issues, query = {}, ctx = {}) {
  const operation = ctx.operation || {};
  const nowMs = ctx.now || Date.now();
  const types = query.type === 'ALL' ? null : csv(query.type);
  const statuses = query.status === 'ALL' ? null : csv(query.status);
  const priorities = csv(query.priority);
  const envs = csv(query.environmentId);
  // 기본 목록/대시보드는 Cancel 제외. status=CANCEL 명시, status=ALL, includeCancel=true 시 포함.
  const includeCancel = query.includeCancel === 'true' || query.status === 'ALL';

  let from = null;
  let to = null;
  if (query.createdFrom) {
    const r = dayRange(query.createdFrom);
    from = r ? r.start : new Date(query.createdFrom).getTime();
  }
  if (query.createdTo) {
    const r = dayRange(query.createdTo);
    to = r ? r.end : new Date(query.createdTo).getTime();
  }

  return issues.filter((issue) => {
    if (types && !types.includes(issue.type)) return false;
    if (statuses) {
      if (!statuses.includes(issue.status)) return false;
    } else if (issue.status === STATUS.CANCEL && !includeCancel) return false;
    if (priorities && !priorities.includes(issue.priority)) return false;
    if (envs && !(issue.environment && envs.includes(issue.environment.id))) return false;
    if ((from || to) && !inRange(issue.createdAt, from, to)) return false;

    if (query.assignee) {
      if (query.assignee === 'UNASSIGNED') {
        if (issue.assignee) return false;
      } else if (!(issue.assignee && issue.assignee.userId === query.assignee)) return false;
    }
    if (query.reporter && !(issue.reporter && issue.reporter.userId === query.reporter)) return false;

    if (query.mine && ctx.user) {
      const uid = ctx.user.userId;
      if (query.mine === 'reported' && !(issue.reporter && issue.reporter.userId === uid)) return false;
      if (query.mine === 'assigned') {
        if (!(issue.assignee && issue.assignee.userId === uid)) return false;
        if (query.status === undefined && (issue.status === STATUS.CLOSED || issue.status === STATUS.CANCEL)) return false;
      }
      if (query.mine === 'waiting' && !(issue.reporter && issue.reporter.userId === uid && issue.status === STATUS.DONE)) return false;
    }

    if (query.unassigned === 'true' && !(issue.assignee == null && issue.status === STATUS.OPEN)) return false;
    if (query.unresolved === 'true' && !isUnresolved(issue)) return false;
    if (query.stale === 'true' && !isStale(issue, operation, nowMs)) return false;
    if (query.reopened === 'true' && !isReopenedCurrent(issue)) return false;
    if (query.criticalUnresolved === 'true' && !isCriticalUnresolved(issue)) return false;
    if (query.waitingDeploy === 'true' && !isWaitingDeploy(issue, operation)) return false;
    if (query.waitingVerification === 'true' && !isWaitingVerification(issue, operation)) return false;
    if (query.deployment && deploymentStatus(issue) !== query.deployment) return false;

    if (query.createdOn && dateKey(issue.createdAt) !== query.createdOn) return false;
    if (query.resolvedOn && dateKey(firstResolvedAt(issue)) !== query.resolvedOn) return false;
    if (query.closedOn && dateKey(firstClosedAt(issue)) !== query.closedOn) return false;
    if (query.resolvedEver === 'true' && !firstResolvedAt(issue)) return false;
    if (query.closedEver === 'true' && !firstClosedAt(issue)) return false;

    if (query.q && !textMatch(issue, String(query.q).trim())) return false;
    return true;
  });
}

const SORT_KEYS = {
  id: (i) => i.id,
  type: (i) => i.type,
  title: (i) => i.title || '',
  status: (i) => i.status,
  priority: (i) => ({ CRITICAL: 0, MAJOR: 1, MINOR: 2, UNASSIGNED: 3 })[i.priority] ?? 9,
  environment: (i) => (i.environment && i.environment.displayNameSnapshot) || '',
  reporter: (i) => (i.reporter && i.reporter.nameSnapshot) || '',
  assignee: (i) => (i.assignee && i.assignee.nameSnapshot) || '',
  createdAt: (i) => i.createdAt,
  updatedAt: (i) => i.updatedAt,
};

function sortIssues(issues, sort = '-updatedAt') {
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  const fn = SORT_KEYS[key] || SORT_KEYS.updatedAt;
  const arr = issues.slice();
  arr.sort((a, b) => {
    const va = fn(a);
    const vb = fn(b);
    let c = 0;
    if (typeof va === 'number' && typeof vb === 'number') c = va - vb;
    else c = String(va).localeCompare(String(vb), 'ko');
    if (c === 0) c = a.id.localeCompare(b.id);
    return desc ? -c : c;
  });
  return arr;
}

/** 환경 표시명: 설정의 현재 이름 우선, 없으면(삭제됨) 등록 당시 스냅샷 */
function envDisplayName(issue, envNames) {
  if (!issue.environment) return null;
  return (envNames && envNames.get(issue.environment.id)) || issue.environment.displayNameSnapshot || issue.environment.id;
}

function toSummary(issue, envNames) {
  return {
    id: issue.id,
    type: issue.type,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    environmentId: issue.environment ? issue.environment.id : null,
    environment: envDisplayName(issue, envNames),
    reporterId: issue.reporter ? issue.reporter.userId : null,
    reporter: issue.reporter ? issue.reporter.nameSnapshot : null,
    reporterTeam: issue.reporter ? issue.reporter.teamSnapshot : null,
    assigneeId: issue.assignee ? issue.assignee.userId : null,
    assignee: issue.assignee ? issue.assignee.nameSnapshot : null,
    assigneeTeam: issue.assignee ? issue.assignee.teamSnapshot : null,
    deploymentStatus: deploymentStatus(issue),
    reopened: isReopened(issue),
    reopenCount: issue.reopenCount || 0,
    commentCount: (issue.comments || []).filter((c) => !c.hidden).length,
    attachmentCount: (issue.attachments || []).filter((a) => !a.deleted).length,
    revision: issue.revision,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
}

module.exports = {
  applyFilters,
  sortIssues,
  toSummary,
  envDisplayName,
  isUnresolved,
  isStale,
  isReopened,
  isReopenedCurrent,
  isWaitingDeploy,
  isWaitingVerification,
  isCriticalUnresolved,
  firstResolvedAt,
  firstClosedAt,
  deploymentStatus,
  nowIso,
  daysBetween,
};
