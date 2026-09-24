'use strict';

/**
 * Dashboard 집계 일관성: 원본 Issue 파일에서 독립 계산한 기대값 vs Dashboard API vs 목록 Drill-down.
 * 유형별(DEFECT/IMPROVEMENT/INQUIRY) 구분, Burn Up 누적, 관리자 설정(Priority/환경/프로젝트명) 반영.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeContainer, makeUsers, DEFECT_BODY } = require('./helpers');
const { writeJsonAtomic } = require('../app/utils/fsutil');
const { toIso, dateKey } = require('../app/utils/time');

const daysAgo = (n, h = 10) => toIso(new Date(Date.now() - n * 86400000 - (24 - h) * 3600000));

/** 시드: 유형/상태/날짜가 섞인 데이터 생성 */
async function seed(c) {
  const { admin, reporter, dev } = await makeUsers(c);
  const W = c.workflowService;
  const rev = (id) => c.repos.issueRepo.get(id).revision;
  const made = [];
  const shift = (id, created, resolved, closed) => {
    const iss = c.repos.issueRepo.get(id);
    iss.createdAt = created;
    iss.updatedAt = created;
    if (resolved && iss.resolution) {
      iss.resolution.firstResolvedAt = resolved;
      iss.resolution.resolvedAt = resolved;
    }
    if (closed && iss.close && iss.close.type) {
      iss.close.firstClosedAt = closed;
      iss.close.closedAt = closed;
    }
    writeJsonAtomic(c.repos.issueRepo.filePath(id), iss);
    c.repos.issueRepo.cache.set(id, iss);
  };
  // DEFECT 6건: OPEN(2), IN_PROGRESS(1, reopen), DONE(1), CLOSED(1), CANCEL(1)
  for (let i = 0; i < 6; i++) made.push((await c.issueService.createDefect(reporter, { ...DEFECT_BODY, environmentId: ['ENV-DEV', 'ENV-TEST', 'ENV-VERIFY'][i % 3], symptom: `결함 ${i} 현상입니다` })).id);
  const [d0, d1, d2, d3, d4, d5] = made;
  await W.claim(dev, d1, { expectedRevision: rev(d1) });
  await W.changePriority(dev, d1, { expectedRevision: rev(d1), priority: 'CRITICAL' });
  // d2: resolve → reopen (누적 조치 1, 현재 미조치)
  await W.claim(dev, d2, { expectedRevision: rev(d2) });
  await W.start(dev, d2, { expectedRevision: rev(d2) });
  await W.resolve(dev, d2, { expectedRevision: rev(d2), resolution: { description: '수정' } });
  await W.reopen(reporter, d2, { expectedRevision: rev(d2), reason: '재발' });
  // d3: DONE + 배포
  await W.claim(dev, d3, { expectedRevision: rev(d3) });
  await W.changePriority(dev, d3, { expectedRevision: rev(d3), priority: 'MINOR' });
  await W.start(dev, d3, { expectedRevision: rev(d3) });
  await W.resolve(dev, d3, { expectedRevision: rev(d3), resolution: { description: '수정' } });
  await W.registerDeployment(dev, d3, { expectedRevision: rev(d3), environmentId: 'ENV-TEST' });
  // d4: CLOSED
  await W.claim(dev, d4, { expectedRevision: rev(d4) });
  await W.changePriority(dev, d4, { expectedRevision: rev(d4), priority: 'MAJOR' });
  await W.start(dev, d4, { expectedRevision: rev(d4) });
  await W.resolve(dev, d4, { expectedRevision: rev(d4), resolution: { description: '수정' } });
  await W.close(reporter, d4, { expectedRevision: rev(d4), closeType: 'VERIFIED' });
  // d5: CANCEL
  await W.claim(dev, d5, { expectedRevision: rev(d5) });
  await W.cancel(dev, d5, { expectedRevision: rev(d5), reason: '중복' });
  // IMPROVEMENT 2건(1 In Progress), INQUIRY 1건
  const i0 = (await c.issueService.createImprovement(reporter, { target: 'A', request: '개선 요청 내용입니다' })).id;
  const i1 = (await c.issueService.createImprovement(reporter, { target: 'B', request: '개선 요청 내용 두 번째' })).id;
  await W.claim(dev, i1, { expectedRevision: rev(i1) });
  await W.start(dev, i1, { expectedRevision: rev(i1) });
  const q0 = (await c.issueService.createInquiry(reporter, { target: 'C', question: '문의 내용입니다' })).id;
  // 날짜 분산
  shift(d0, daysAgo(9));
  shift(d1, daysAgo(8));
  shift(d2, daysAgo(7), daysAgo(5));
  shift(d3, daysAgo(6), daysAgo(3));
  shift(d4, daysAgo(5), daysAgo(2), daysAgo(1));
  shift(d5, daysAgo(4));
  shift(i0, daysAgo(3));
  shift(i1, daysAgo(2));
  shift(q0, daysAgo(1));
  return { admin, reporter, dev, ids: { d0, d1, d2, d3, d4, d5, i0, i1, q0 } };
}

/** 원본 파일에서 독립 계산한 기대값 */
function expectedFor(c, type) {
  const all = c.repos.issueRepo.all().filter((i) => i.type === type);
  const active = all.filter((i) => i.status !== 'CANCEL');
  const cnt = (s) => active.filter((i) => i.status === s).length;
  const resolvedEver = active.filter((i) => i.resolution && i.resolution.firstResolvedAt).length;
  const closedEver = active.filter((i) => i.close && i.close.firstClosedAt).length;
  return {
    total: active.length,
    cancelled: all.length - active.length,
    open: cnt('OPEN'),
    inProgress: cnt('IN_PROGRESS'),
    done: cnt('DONE'),
    closed: cnt('CLOSED'),
    unresolved: cnt('OPEN') + cnt('IN_PROGRESS'),
    resolvedEver,
    closedEver,
    reopened: active.filter((i) => (i.reopenCount || 0) > 0 && i.status !== 'CLOSED').length,
    unassigned: active.filter((i) => !i.assignee && i.status === 'OPEN').length,
    critical: active.filter((i) => i.priority === 'CRITICAL' && ['OPEN', 'IN_PROGRESS'].includes(i.status)).length,
    byDay: active.reduce((m, i) => {
      const k = dateKey(i.createdAt);
      m[k] = (m[k] || 0) + 1;
      return m;
    }, {}),
  };
}

test('유형별(DEFECT/IMPROVEMENT/INQUIRY) Dashboard 집계가 원본과 일치하고 Drill-down 건수와 같다', async () => {
  const c = makeContainer();
  const { admin } = await seed(c);
  for (const type of ['DEFECT', 'IMPROVEMENT', 'INQUIRY']) {
    const exp = expectedFor(c, type);
    const s = c.dashboardService.summary({ type });
    assert.equal(s.total, exp.total, `${type} total`);
    assert.equal(s.cancelled, exp.cancelled, `${type} cancelled`);
    assert.deepEqual(s.status, { open: exp.open, inProgress: exp.inProgress, done: exp.done, closed: exp.closed }, `${type} status`);
    assert.equal(s.attention.currentlyUnresolved, exp.unresolved);
    assert.equal(s.attention.reopened, exp.reopened);
    assert.equal(s.attention.unassigned, exp.unassigned);
    assert.equal(s.attention.criticalUnresolved, exp.critical);
    // Drill-down 건수 = KPI
    for (const [key, val] of Object.entries({ total: exp.total, open: exp.open, inProgress: exp.inProgress, done: exp.done, closed: exp.closed, cancelled: exp.cancelled, reopened: exp.reopened, unassigned: exp.unassigned, currentlyUnresolved: exp.unresolved, criticalUnresolved: exp.critical })) {
      assert.equal(c.issueService.list(admin, s.drilldown[key]).total, val, `${type} drilldown ${key}`);
    }
    // 분포 합계 = total (상태), Priority 합계 = total, 환경 합계 = total(환경 있는 유형만)
    const dist = c.dashboardService.distribution({ type });
    assert.equal(dist.status.reduce((a, b) => a + b.count, 0), exp.total);
    assert.equal(dist.priority.reduce((a, b) => a + b.count, 0), exp.total);
    if (type === 'DEFECT') assert.equal(dist.environment.reduce((a, b) => a + b.count, 0), exp.total);
  }
  // 세 유형 합 = 전체(Cancel 제외)
  const totals = ['DEFECT', 'IMPROVEMENT', 'INQUIRY'].map((t) => c.dashboardService.summary({ type: t }).total);
  assert.equal(totals.reduce((a, b) => a + b, 0), c.repos.issueRepo.all().filter((i) => i.status !== 'CANCEL').length);
  assert.deepEqual(totals, [5, 2, 1]);
});

test('Burn Up: 누적 등록/조치/Closed가 원본 날짜와 일치하고 단조 증가, Re-open 후에도 누적 조치 유지', async () => {
  const c = makeContainer();
  await seed(c);
  const exp = expectedFor(c, 'DEFECT');
  const b = c.dashboardService.burnup({ type: 'DEFECT' });
  const last = b.items.at(-1);
  assert.equal(last.createdCumulative, exp.total);
  assert.equal(last.resolvedCumulative, exp.resolvedEver, 'd2(re-open) + d3 + d4 = 3');
  assert.equal(last.closedCumulative, exp.closedEver);
  assert.equal(b.current.total, exp.total);
  assert.equal(b.current.resolvedEver, 3);
  assert.equal(b.current.currentlyUnresolved, exp.unresolved, 'OPEN 2 + IN_PROGRESS 1(re-open)');
  assert.equal(b.current.gap, exp.total - exp.resolvedEver);
  assert.equal(b.current.reopenedCurrent, 1);
  // 날짜별 누적 = 해당 일자까지 등록 건수 합
  let run = 0;
  const days = Object.keys(exp.byDay).sort();
  for (const it of b.items) {
    run += exp.byDay[it.date] || 0;
    assert.equal(it.createdCumulative, run, `cumulative at ${it.date}`);
  }
  assert.ok(b.items[0].date <= days[0]);
  for (let i = 1; i < b.items.length; i++) {
    assert.ok(b.items[i].createdCumulative >= b.items[i - 1].createdCumulative);
    assert.ok(b.items[i].resolvedCumulative >= b.items[i - 1].resolvedCumulative);
    assert.ok(b.items[i].closedCumulative >= b.items[i - 1].closedCumulative);
  }
  // 일자별 합계 = 누적 마지막 값
  const d = c.dashboardService.daily({ type: 'DEFECT' });
  assert.equal(d.items.reduce((a, x) => a + x.created, 0), exp.total);
  assert.equal(d.items.reduce((a, x) => a + x.resolved, 0), exp.resolvedEver);
  assert.equal(d.items.reduce((a, x) => a + x.closed, 0), exp.closedEver);
  // resolvedOn drill-down: 해당 일자 최초 조치 건수와 일치
  const admin = c.userService.list({}).find((u) => u.isQualityAdmin);
  for (const it of d.items) {
    if (it.resolved) assert.equal(c.issueService.list(admin, { ...d.drilldownBase, resolvedOn: it.date }).total, it.resolved);
    if (it.created) assert.equal(c.issueService.list(admin, { ...d.drilldownBase, createdOn: it.date }).total, it.created);
  }
  // 개선/문의 Burn Up: 조치 없음 → resolved 0, 등록 누적만
  const bi = c.dashboardService.burnup({ type: 'IMPROVEMENT' });
  assert.equal(bi.items.at(-1).createdCumulative, 2);
  assert.equal(bi.items.at(-1).resolvedCumulative, 0);
  assert.equal(c.dashboardService.burnup({ type: 'INQUIRY' }).current.total, 1);
  // 기간 필터: 최근 5일 → createdAt 기준 집합만
  const from = dateKey(daysAgo(5));
  const bf = c.dashboardService.burnup({ type: 'DEFECT', dateFrom: from });
  assert.equal(bf.current.total, c.repos.issueRepo.all().filter((i) => i.type === 'DEFECT' && i.status !== 'CANCEL' && dateKey(i.createdAt) >= from).length);
});

test('관리자 설정(Priority 단계명·환경명·프로젝트명)이 목록/상세/Dashboard에 구분되어 반영된다', async () => {
  const c = makeContainer();
  const { admin, ids } = await seed(c);
  // Priority 단계명 변경 + Minor 비활성
  await c.configService.updatePriorities(admin, { priorities: [
    { code: 'CRITICAL', displayName: '긴급(P1)', description: '즉시 조치', active: true, order: 1 },
    { code: 'MAJOR', displayName: '중요(P2)', description: '', active: true, order: 2 },
    { code: 'MINOR', displayName: '경미(P3)', description: '', active: false, order: 3 },
  ] });
  const dist = c.dashboardService.distribution({ type: 'DEFECT' });
  assert.deepEqual(dist.priority.map((p) => [p.code, p.label, p.count]), [['CRITICAL', '긴급(P1)', 1], ['MAJOR', '중요(P2)', 1], ['MINOR', '경미(P3)', 1], ['UNASSIGNED', '미지정', 2]], '코드 유지 + 표시명 변경, 비활성(Minor) 기존 건 유지');
  // 비활성 Priority 신규 지정 불가, 기존 Issue 값 유지
  const dev = c.userService.list({}).find((u) => u.employeeId === '20001');
  await assert.rejects(c.workflowService.changePriority(dev, ids.d1, { expectedRevision: c.repos.issueRepo.get(ids.d1).revision, priority: 'MINOR' }), /사용할 수 없는 Priority/);
  assert.equal(c.repos.issueRepo.get(ids.d3).priority, 'MINOR');
  assert.equal(c.issueService.list(admin, { priority: 'MINOR' }).total, 1);
  // 환경명 변경 → 목록/상세/Dashboard 모두 새 이름, 이력 스냅샷은 유지
  await c.configService.updateEnvironment(admin, 'ENV-TEST', { displayName: '테스트계(TB)' });
  const listed = c.issueService.list(admin, { type: 'DEFECT', environmentId: 'ENV-TEST' });
  assert.ok(listed.total >= 1);
  assert.ok(listed.items.every((i) => i.environment === '테스트계(TB)'), '목록 환경명 갱신');
  const detail = c.issueService.getDetail(admin, ids.d1).issue;
  assert.equal(detail.environment.displayNameSnapshot, '테스트계', '스냅샷은 등록 당시 이름 유지(이력용)');
  const env = c.dashboardService.distribution({ type: 'DEFECT' }).environment.find((e) => e.code === 'ENV-TEST');
  assert.equal(env.label, '테스트계(TB)');
  assert.equal(env.count, 2);
  // 환경 추가 → 분포에 0건으로 표시(활성), 비활성+0건은 숨김
  await c.configService.addEnvironment(admin, { displayName: '운영계', code: 'PROD' });
  let envs = c.dashboardService.distribution({ type: 'DEFECT' }).environment;
  assert.ok(envs.some((e) => e.code === 'ENV-PROD' && e.count === 0));
  await c.configService.updateEnvironment(admin, 'ENV-PROD', { active: false });
  envs = c.dashboardService.distribution({ type: 'DEFECT' }).environment;
  assert.ok(!envs.some((e) => e.code === 'ENV-PROD'), '비활성 + 0건 환경은 분포에서 제외');
  // 참조 중 환경 비활성화 → 분포에는 남고(건수 있음) 신규 등록 불가
  await c.configService.updateEnvironment(admin, 'ENV-VERIFY', { active: false });
  envs = c.dashboardService.distribution({ type: 'DEFECT' }).environment;
  assert.ok(envs.some((e) => e.code === 'ENV-VERIFY' && e.count === 1), 'd2(활성) 1건, d5는 Cancel');
  const rep = c.userService.list({}).find((u) => u.employeeId === '10001');
  await assert.rejects(c.issueService.createDefect(rep, { ...DEFECT_BODY, environmentId: 'ENV-VERIFY' }), /발생 환경/);
  // 프로젝트명
  const p = await c.configService.updateProject(admin, { customerName: 'B은행', projectName: '차세대 AI' });
  assert.equal(p.customerName, 'B은행');
  assert.equal(c.configService.getProject().projectName, '차세대 AI');
  // 사용자 이름/소속 변경 → 기존 Issue 스냅샷 유지(이력 의미), 사용자 목록은 새 이름
  const updated = await c.userService.update(admin, dev.userId, { name: '홍길동(개발)', team: '플랫폼개발팀' });
  assert.equal(updated.name, '홍길동(개발)');
  assert.equal(c.repos.issueRepo.get(ids.d1).assignee.nameSnapshot, '홍길동');
  // 이후 새 Action의 actor는 새 이름으로 기록
  const dev2 = c.userService.getById(dev.userId);
  await c.workflowService.start(dev2, ids.d1, { expectedRevision: c.repos.issueRepo.get(ids.d1).revision });
  assert.equal(c.repos.issueRepo.get(ids.d1).history.at(-1).actor.nameSnapshot, '홍길동(개발)');
});
