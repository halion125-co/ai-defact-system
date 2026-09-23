'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const P = require('../app/permissions/permissions');
const { TRANSITIONS, STATUS } = require('../app/models/constants');
const { writeJsonAtomic, readJson } = require('../app/utils/fsutil');
const { KeyedMutex } = require('../app/utils/lock');
const { formatIssueId, parseIssueId } = require('../app/utils/id');
const { toIso, dateKey, dayRange } = require('../app/utils/time');
const { parseMultipart } = require('../app/utils/multipart');
const { sanitizeFilename, getExtension, cleanText } = require('../app/utils/text');
const { sniff } = require('../app/services/AttachmentService');
const V = require('../app/validators/validators');
const { makeContainer, makeUsers, DEFECT_BODY } = require('./helpers');

const admin = { userId: 'U-1', isQualityAdmin: true };
const reporter = { userId: 'U-2', isQualityAdmin: false };
const dev = { userId: 'U-3', isQualityAdmin: false };
const other = { userId: 'U-4', isQualityAdmin: false };
const issue = (over = {}) => ({ id: 'DEF-0001', status: 'OPEN', reporter: { userId: 'U-2' }, assignee: null, ...over });

test('permissions: 등록내용 수정은 Reporter 본인/Admin만', () => {
  assert.equal(P.canEditContent(reporter, issue()), true);
  assert.equal(P.canEditContent(admin, issue()), true);
  assert.equal(P.canEditContent(dev, issue()), false);
});

test('permissions: Claim은 미배정 OPEN에서 누구나', () => {
  assert.equal(P.canClaim(other, issue()), true);
  assert.equal(P.canClaim(other, issue({ assignee: { userId: 'U-3' } })), false);
  assert.equal(P.canClaim(other, issue({ status: 'IN_PROGRESS' })), false);
});

test('permissions: Priority/Workflow는 Assignee/Admin만', () => {
  const iss = issue({ assignee: { userId: 'U-3' } });
  assert.equal(P.canChangePriority(dev, iss), true);
  assert.equal(P.canChangePriority(reporter, iss), false);
  assert.equal(P.canChangePriority(admin, iss), true);
  assert.equal(P.canStart(dev, iss), true);
  assert.equal(P.canStart(reporter, iss), false);
});

test('permissions: Close - Verified는 Reporter/Admin, Agreed는 Assignee/Admin (DONE에서만)', () => {
  const done = issue({ status: 'DONE', assignee: { userId: 'U-3' } });
  assert.equal(P.canCloseVerified(reporter, done), true);
  assert.equal(P.canCloseVerified(dev, done), false);
  assert.equal(P.canCloseAgreed(dev, done), true);
  assert.equal(P.canCloseAgreed(reporter, done), false);
  assert.equal(P.canCloseVerified(reporter, issue({ status: 'IN_PROGRESS' })), false);
  assert.equal(P.canReopen(reporter, issue({ status: 'CLOSED' })), true);
  assert.equal(P.canReopen(other, issue({ status: 'CLOSED' })), false);
});

test('state machine: 허용 전이만 정의됨', () => {
  assert.deepEqual(TRANSITIONS.start.from, [STATUS.OPEN]);
  assert.deepEqual(TRANSITIONS.resolve.from, [STATUS.IN_PROGRESS]);
  assert.deepEqual(TRANSITIONS.reopen.from, [STATUS.DONE, STATUS.CLOSED]);
  assert.deepEqual(TRANSITIONS.close.from, [STATUS.DONE]);
  assert.deepEqual(TRANSITIONS.cancel.from, [STATUS.OPEN, STATUS.IN_PROGRESS, STATUS.DONE]);
});

test('id: 4자리 padding, 9999 초과 자연 증가', () => {
  assert.equal(formatIssueId('DEF', 24), 'DEF-0024');
  assert.equal(formatIssueId('INQ', 12345), 'INQ-12345');
  assert.deepEqual(parseIssueId('IMP-0008'), { prefix: 'IMP', number: 8 });
  assert.equal(parseIssueId('../x'), null);
});

test('time: ISO +09:00 형식 / dateKey / dayRange', () => {
  const iso = toIso(new Date('2026-09-24T00:32:11Z'), 'Asia/Seoul');
  assert.equal(iso, '2026-09-24T09:32:11+09:00');
  assert.equal(dateKey('2026-09-23T23:30:00Z', 'Asia/Seoul'), '2026-09-24');
  const r = dayRange('2026-09-24', 'Asia/Seoul');
  assert.equal(new Date(r.start).toISOString(), '2026-09-23T15:00:00.000Z');
});

test('atomic write: temp→rename, .bak 유지, 유효 JSON 보장', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-'));
  const file = path.join(dir, 'a.json');
  writeJsonAtomic(file, { v: 1 });
  writeJsonAtomic(file, { v: 2 });
  assert.deepEqual(readJson(file), { v: 2 });
  assert.deepEqual(readJson(`${file}.bak`), { v: 1 });
  assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')).length, 0);
});

test('atomic write 실패 시 원본 유지', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-'));
  const file = path.join(dir, 'a.json');
  writeJsonAtomic(file, { v: 1 });
  const circular = {};
  circular.self = circular;
  assert.throws(() => writeJsonAtomic(file, circular));
  assert.deepEqual(readJson(file), { v: 1 });
  assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')).length, 0);
});

test('mutex: 동일 key 직렬화, 다른 key 병렬', async () => {
  const m = new KeyedMutex();
  const order = [];
  const task = (key, name, ms) =>
    m.withLock(key, async () => {
      order.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`${name}:end`);
    });
  await Promise.all([task('a', 'A1', 30), task('a', 'A2', 5), task('b', 'B1', 5)]);
  assert.deepEqual(order.slice(0, 2), ['A1:start', 'B1:start']);
  assert.ok(order.indexOf('A1:end') < order.indexOf('A2:start'));
});

test('mutex: timeout 시 LOCK_TIMEOUT', async () => {
  const m = new KeyedMutex({ defaultTimeoutMs: 20 });
  const rel = await m.acquire('x');
  await assert.rejects(m.acquire('x'), (e) => e.code === 'LOCK_TIMEOUT');
  rel();
});

test('multipart: 파일/필드 파싱', () => {
  const b = 'XBOUND';
  const body = Buffer.from([`--${b}`, 'Content-Disposition: form-data; name="expectedRevision"', '', '3', `--${b}`, 'Content-Disposition: form-data; name="file"; filename="a.txt"', 'Content-Type: text/plain', '', 'hello', `--${b}--`, ''].join('\r\n'));
  const { fields, files } = parseMultipart(body, `multipart/form-data; boundary=${b}`);
  assert.equal(fields.expectedRevision, '3');
  assert.equal(files[0].filename, 'a.txt');
  assert.equal(files[0].data.toString(), 'hello');
});

test('file security: path traversal / 확장자 / magic bytes', () => {
  assert.equal(sanitizeFilename('../../server.exe'), 'server.exe');
  assert.equal(sanitizeFilename('..\\..\\x.png'), 'x.png');
  assert.equal(getExtension('a.PNG'), 'png');
  assert.equal(sniff('png', Buffer.from('89504e470d0a1a0a00', 'hex')), true);
  assert.equal(sniff('png', Buffer.from('MZ.....')), false);
  assert.equal(sniff('txt', Buffer.from('<script>alert(1)</script>')), false);
  assert.equal(sniff('txt', Buffer.from('plain text')), true);
});

test('validators: 재현절차 1단계 이상, 길이 제한, allowlist', () => {
  assert.throws(() => V.reproductionSteps([]), /1단계/);
  assert.throws(() => V.reproductionSteps(['', ' ']), /1단계/);
  assert.equal(V.reproductionSteps(['a', 'b'])[1].order, 2);
  assert.throws(() => V.contentChanges('DEFECT', { status: 'DONE' }, []), /수정할 수 없는/);
  assert.throws(() => V.operationUpdate({ allowedExtensions: ['exe', 'html'] }), /1개 이상/);
  assert.equal(cleanText('  a\u0000b  '), 'ab');
});

test('dashboard 계산: daily/burnup/current unresolved/reopen', async () => {
  const c = makeContainer();
  const { admin: a, reporter: r, dev: d } = await makeUsers(c);
  const W = c.workflowService;
  const rev = (id) => c.repos.issueRepo.get(id).revision;
  const i1 = (await c.issueService.createDefect(r, DEFECT_BODY)).id;
  const i2 = (await c.issueService.createDefect(r, DEFECT_BODY)).id;
  const i3 = (await c.issueService.createDefect(r, DEFECT_BODY)).id;
  for (const id of [i1, i2]) {
    await W.claim(d, id, { expectedRevision: rev(id) });
    await W.start(d, id, { expectedRevision: rev(id) });
    await W.resolve(d, id, { expectedRevision: rev(id), resolution: { description: 'fix' } });
  }
  await W.close(r, i1, { expectedRevision: rev(i1), closeType: 'VERIFIED' });
  await W.reopen(r, i2, { expectedRevision: rev(i2), reason: '재발' });
  const s = c.dashboardService.summary({});
  assert.equal(s.total, 3);
  assert.equal(s.status.closed, 1);
  assert.equal(s.status.inProgress, 1);
  assert.equal(s.attention.reopened, 1);
  assert.equal(s.attention.unassigned, 1);
  assert.equal(s.attention.currentlyUnresolved, 2);
  const b = c.dashboardService.burnup({});
  const last = b.items[b.items.length - 1];
  assert.equal(last.createdCumulative, 3);
  assert.equal(last.resolvedCumulative, 2, 'Re-open되어도 누적 조치는 감소하지 않음');
  assert.equal(b.current.currentlyUnresolved, 2);
  assert.equal(b.current.gap, 1);
  const daily = c.dashboardService.daily({});
  const today = daily.items[daily.items.length - 1];
  assert.equal(today.created, 3);
  assert.equal(today.resolved, 2);
  assert.equal(today.closed, 1);
  for (let i = 1; i < b.items.length; i++) assert.ok(b.items[i].createdCumulative >= b.items[i - 1].createdCumulative);
  // drilldown count consistency
  const list = c.issueService.list(a, s.drilldown.reopened);
  assert.equal(list.total, s.attention.reopened);
  const unres = c.issueService.list(a, s.drilldown.currentlyUnresolved);
  assert.equal(unres.total, s.attention.currentlyUnresolved);
  void i3;
});

test('firstResolvedAt/firstClosedAt은 Re-open 후에도 유지, resolvedAt은 갱신', async () => {
  const c = makeContainer();
  const { reporter: r, dev: d } = await makeUsers(c);
  const W = c.workflowService;
  const rev = (id) => c.repos.issueRepo.get(id).revision;
  const id = (await c.issueService.createDefect(r, DEFECT_BODY)).id;
  await W.claim(d, id, { expectedRevision: rev(id) });
  await W.start(d, id, { expectedRevision: rev(id) });
  await W.resolve(d, id, { expectedRevision: rev(id), resolution: { description: 'fix1' } });
  await W.close(r, id, { expectedRevision: rev(id), closeType: 'VERIFIED' });
  const first = c.repos.issueRepo.get(id);
  // 시간 차를 만들기 위해 firstResolvedAt을 과거로 조작
  first.resolution.firstResolvedAt = '2026-01-01T09:00:00+09:00';
  first.resolution.resolvedAt = '2026-01-01T09:00:00+09:00';
  first.close.firstClosedAt = '2026-01-02T09:00:00+09:00';
  c.repos.issueRepo.save(first);
  await W.reopen(r, id, { expectedRevision: rev(id), reason: '재발' });
  await W.resolve(d, id, { expectedRevision: rev(id), resolution: { description: 'fix2' } });
  await W.close(d, id, { expectedRevision: rev(id), closeType: 'AGREED', comment: '합의하였음' });
  const after = c.repos.issueRepo.get(id);
  assert.equal(after.resolution.firstResolvedAt, '2026-01-01T09:00:00+09:00');
  assert.notEqual(after.resolution.resolvedAt, '2026-01-01T09:00:00+09:00');
  assert.equal(after.close.firstClosedAt, '2026-01-02T09:00:00+09:00');
  assert.equal(after.reopenCount, 1);
  assert.ok(after.history.some((h) => h.eventType === 'REOPENED'));
  assert.equal(after.close.type, 'AGREED');
});
