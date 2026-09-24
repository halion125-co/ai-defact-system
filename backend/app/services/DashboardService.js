'use strict';

const { STATUS, PRIORITY } = require('../models/constants');
const { dateKey, addDays } = require('../utils/time');
const Q = require('./IssueQuery');
const { toSummary } = require('./IssueQuery');

/**
 * Dashboard 계산 (02_API_JSON_SPEC §26~27, 04_BACKEND §10).
 * - 기간 Filter는 createdAt 기준 Issue 집합을 정의하고, 그 집합의 "현재 상태"를 집계한다.
 * - daily.created = createdAt / daily.resolved = firstResolvedAt / daily.closed = firstClosedAt
 * - burnup 누적 = Unique Issue 기준 단조 증가
 * - currentlyUnresolved = 현재 status OPEN/IN_PROGRESS (Burn Up 선 간 차이와 다를 수 있음)
 * - Re-open은 별도 KPI
 */
class DashboardService {
  constructor({ issueRepo, configService }) {
    this.issueRepo = issueRepo;
    this.configService = configService;
  }

  _base(query) {
    const q = { ...query };
    if (!q.type) q.type = 'DEFECT'; // 기본 결함. 'ALL'이면 결함+개선요청+문의 통합
    if (q.dateFrom) q.createdFrom = q.dateFrom;
    if (q.dateTo) q.createdTo = q.dateTo;
    const operation = this.configService.getOperation();
    const issues = Q.applyFilters(this.issueRepo.all(), q, { operation });
    return { issues, operation, filter: q };
  }

  /** Drill-down용 List Query 파라미터(동일 Filter 전달) */
  _drill(filter, extra) {
    const out = { type: filter.type };
    if (filter.createdFrom) out.createdFrom = filter.createdFrom;
    if (filter.createdTo) out.createdTo = filter.createdTo;
    if (filter.environmentId) out.environmentId = filter.environmentId;
    if (filter.priority) out.priority = filter.priority;
    return { ...out, ...extra };
  }

  summary(query) {
    const { issues, operation, filter } = this._base(query);
    const count = (fn) => issues.filter(fn).length;
    const status = {
      open: count((i) => i.status === STATUS.OPEN),
      inProgress: count((i) => i.status === STATUS.IN_PROGRESS),
      done: count((i) => i.status === STATUS.DONE),
      closed: count((i) => i.status === STATUS.CLOSED),
    };
    const cancelled = Q.applyFilters(this.issueRepo.all(), { ...filter, status: STATUS.CANCEL }, { operation }).length;
    const totalWithCancelled = issues.length + cancelled;
    const attention = {
      criticalUnresolved: count(Q.isCriticalUnresolved),
      unassigned: count((i) => i.assignee == null && i.status === STATUS.OPEN),
      stale: count((i) => Q.isStale(i, operation)),
      reopened: count(Q.isReopenedCurrent),
      waitingDeploy: count((i) => Q.isWaitingDeploy(i, operation)),
      waitingVerification: count((i) => Q.isWaitingVerification(i, operation)),
      currentlyUnresolved: count(Q.isUnresolved),
    };
    return {
      total: totalWithCancelled,
      cancelled,
      status,
      attention,
      staleIssueDays: operation.staleIssueDays,
      enableDeployment: !!operation.enableDeployment,
      drilldown: {
        total: this._drill(filter, { includeCancel: 'true' }),
        open: this._drill(filter, { status: STATUS.OPEN }),
        inProgress: this._drill(filter, { status: STATUS.IN_PROGRESS }),
        done: this._drill(filter, { status: STATUS.DONE }),
        closed: this._drill(filter, { status: STATUS.CLOSED }),
        cancelled: this._drill(filter, { status: STATUS.CANCEL }),
        criticalUnresolved: this._drill(filter, { criticalUnresolved: 'true' }),
        unassigned: this._drill(filter, { unassigned: 'true' }),
        stale: this._drill(filter, { stale: 'true' }),
        reopened: this._drill(filter, { reopened: 'true' }),
        waitingDeploy: this._drill(filter, { waitingDeploy: 'true' }),
        waitingVerification: this._drill(filter, { waitingVerification: 'true' }),
        currentlyUnresolved: this._drill(filter, { unresolved: 'true' }),
      },
    };
  }

  _dateSpan(issues, filter) {
    const keys = [];
    for (const i of issues) {
      keys.push(dateKey(i.createdAt));
      const r = Q.firstResolvedAt(i);
      if (r) keys.push(dateKey(r));
      const c = Q.firstClosedAt(i);
      if (c) keys.push(dateKey(c));
    }
    const valid = keys.filter(Boolean).sort();
    let from = filter.createdFrom || valid[0];
    let to = valid[valid.length - 1];
    const today = dateKey(new Date().toISOString());
    if (!to || to < today) to = today;
    if (filter.createdTo && filter.createdTo < to) to = filter.createdTo;
    if (!from) from = to;
    // 최대 400일 범위로 제한(성능)
    let days = [];
    let d = from;
    let guard = 0;
    while (d <= to && guard++ < 400) {
      days.push(d);
      d = addDays(d, 1);
    }
    return days;
  }

  daily(query) {
    const { issues, filter } = this._base(query);
    const days = this._dateSpan(issues, filter);
    const map = new Map(days.map((d) => [d, { date: d, created: 0, resolved: 0, closed: 0 }]));
    for (const i of issues) {
      const c = map.get(dateKey(i.createdAt));
      if (c) c.created++;
      const r = Q.firstResolvedAt(i);
      if (r && map.get(dateKey(r))) map.get(dateKey(r)).resolved++;
      const cl = Q.firstClosedAt(i);
      if (cl && map.get(dateKey(cl))) map.get(dateKey(cl)).closed++;
    }
    let items = [...map.values()];
    const limit = parseInt(query.days, 10);
    if (limit && items.length > limit) items = items.slice(-limit);
    return { items, drilldownBase: this._drill(filter, {}) };
  }

  burnup(query) {
    const { issues, filter } = this._base(query);
    const days = this._dateSpan(issues, filter);
    const createdBy = new Map();
    const resolvedBy = new Map();
    const closedBy = new Map();
    const inc = (m, k) => k && m.set(k, (m.get(k) || 0) + 1);
    for (const i of issues) {
      inc(createdBy, dateKey(i.createdAt));
      inc(resolvedBy, dateKey(Q.firstResolvedAt(i)));
      inc(closedBy, dateKey(Q.firstClosedAt(i)));
    }
    // 기간 시작 이전 값(기간 필터로 집합이 잘려도 누적은 집합 기준이므로 0에서 시작)
    let c = 0;
    let r = 0;
    let cl = 0;
    // 첫 날짜 이전에 발생한 resolved/closed(이론상 없음)도 포함
    for (const [k, v] of resolvedBy) if (k < days[0]) r += v;
    for (const [k, v] of closedBy) if (k < days[0]) cl += v;
    const items = days.map((d) => {
      c += createdBy.get(d) || 0;
      r += resolvedBy.get(d) || 0;
      cl += closedBy.get(d) || 0;
      return { date: d, createdCumulative: c, resolvedCumulative: r, closedCumulative: cl };
    });
    const current = {
      total: issues.length,
      resolvedEver: issues.filter((i) => !!Q.firstResolvedAt(i)).length,
      closedEver: issues.filter((i) => !!Q.firstClosedAt(i)).length,
      currentlyUnresolved: issues.filter(Q.isUnresolved).length,
      reopenedCurrent: issues.filter(Q.isReopenedCurrent).length,
      gap: issues.length - issues.filter((i) => !!Q.firstResolvedAt(i)).length,
    };
    let limited = items;
    const limit = parseInt(query.days, 10);
    if (limit && items.length > limit) limited = items.slice(-limit);
    return { items: limited, current };
  }

  distribution(query) {
    const { issues, filter } = this._base(query);
    const project = this.configService.getProject();
    const status = [
      { code: STATUS.OPEN, label: 'Open', count: 0 },
      { code: STATUS.IN_PROGRESS, label: 'In Progress', count: 0 },
      { code: STATUS.DONE, label: 'Done', count: 0 },
      { code: STATUS.CLOSED, label: 'Closed', count: 0 },
    ];
    for (const i of issues) {
      const s = status.find((x) => x.code === i.status);
      if (s) s.count++;
    }
    const priority = project.priorities
      .map((p) => ({ code: p.code, label: p.displayName, count: issues.filter((i) => i.priority === p.code).length }))
      .concat([{ code: PRIORITY.UNASSIGNED, label: '미지정', count: issues.filter((i) => i.priority === PRIORITY.UNASSIGNED).length }]);
    const envMap = new Map(project.environments.map((e) => [e.id, { code: e.id, label: e.displayName, count: 0, active: e.active }]));
    for (const i of issues) {
      if (!i.environment) continue;
      if (!envMap.has(i.environment.id)) envMap.set(i.environment.id, { code: i.environment.id, label: i.environment.displayNameSnapshot, count: 0, active: false });
      envMap.get(i.environment.id).count++;
    }
    const environment = [...envMap.values()].filter((e) => e.active || e.count > 0);
    return {
      status: status.map((s) => ({ ...s, drilldown: this._drill(filter, { status: s.code }) })),
      priority: priority.map((p) => ({ ...p, drilldown: this._drill(filter, { priority: p.code }) })),
      environment: environment.map((e) => ({ ...e, drilldown: this._drill(filter, { environmentId: e.code }) })),
    };
  }

  attention(query) {
    const { issues, operation, filter } = this._base(query);
    const limit = Math.min(parseInt(query.limit, 10) || 5, 50);
    const envNames = new Map(this.configService.getProject().environments.map((e) => [e.id, e.displayName]));
    const pick = (fn, sortKey = 'updatedAt') => {
      const list = issues.filter(fn);
      list.sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])));
      return { count: list.length, sample: list.slice(0, limit).map((i) => toSummary(i, envNames)) };
    };
    return {
      staleIssueDays: operation.staleIssueDays,
      items: [
        { key: 'criticalUnresolved', label: 'Critical 미조치', ...pick(Q.isCriticalUnresolved), drilldown: this._drill(filter, { criticalUnresolved: 'true' }) },
        { key: 'unassigned', label: '담당자 미지정', ...pick((i) => i.assignee == null && i.status === STATUS.OPEN, 'createdAt'), drilldown: this._drill(filter, { unassigned: 'true' }) },
        { key: 'stale', label: `${operation.staleIssueDays}일 이상 장기 미조치`, ...pick((i) => Q.isStale(i, operation)), drilldown: this._drill(filter, { stale: 'true' }) },
        ...(operation.enableDeployment
          ? [{ key: 'waitingDeploy', label: '조치완료 후 배포대기', ...pick((i) => Q.isWaitingDeploy(i, operation)), drilldown: this._drill(filter, { waitingDeploy: 'true' }) }]
          : []),
        { key: 'waitingVerification', label: operation.enableDeployment ? '배포완료 후 재검증대기' : '조치완료 후 재검증대기', ...pick((i) => Q.isWaitingVerification(i, operation)), drilldown: this._drill(filter, { waitingVerification: 'true' }) },
        { key: 'reopened', label: 'Re-open', ...pick(Q.isReopenedCurrent), drilldown: this._drill(filter, { reopened: 'true' }) },
      ],
    };
  }
}

module.exports = { DashboardService };
