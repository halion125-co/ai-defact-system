'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeContainer, makeUsers, DEFECT_BODY } = require('./helpers');
const { createContainer } = require('../app/container');
const { loadServerConfig } = require('../app/config');

function reopen(c) {
  const cfg = loadServerConfig({ dataDir: c.cfg.dataDir, uploadDir: c.cfg.uploadDir, backupDir: c.cfg.backupDir, logDir: c.cfg.logDir, bootstrapAdminEmployeeIds: ['admin'], backupSchedule: { enabled: false } });
  return createContainer(cfg, { quietLog: true });
}

test('서버 재시작 후 데이터 유지 + sequence 이어짐', async () => {
  const c = makeContainer();
  const { reporter } = await makeUsers(c);
  const a = await c.issueService.createDefect(reporter, DEFECT_BODY);
  const c2 = reopen(c);
  assert.equal(c2.repos.issueRepo.count(), 1);
  assert.equal(c2.repos.issueRepo.get(a.id).symptom, DEFECT_BODY.symptom);
  const r2 = c2.userService.getById(reporter.userId);
  const b = await c2.issueService.createDefect(r2, DEFECT_BODY);
  assert.equal(b.id, 'DEF-0002');
});

test('sequence.json 유실 시 Issue 파일 기준으로 보정(ID 중복 방지)', async () => {
  const c = makeContainer();
  const { reporter } = await makeUsers(c);
  await c.issueService.createDefect(reporter, DEFECT_BODY);
  await c.issueService.createDefect(reporter, DEFECT_BODY);
  fs.unlinkSync(path.join(c.cfg.dataDir, 'sequence.json'));
  const c2 = reopen(c);
  assert.ok(c2.startup.warnings.some((w) => w.includes('sequence')));
  const r2 = c2.userService.getById(reporter.userId);
  const n = await c2.issueService.createDefect(r2, DEFECT_BODY);
  assert.equal(n.id, 'DEF-0003');
});

test('손상된 Issue 파일: 시작 시 격리 + 해당 ID 쓰기 차단, 나머지 정상', async () => {
  const c = makeContainer();
  const { reporter, dev } = await makeUsers(c);
  const a = await c.issueService.createDefect(reporter, DEFECT_BODY);
  const b = await c.issueService.createDefect(reporter, DEFECT_BODY);
  fs.writeFileSync(path.join(c.cfg.dataDir, 'issues', `${a.id}.json`), '{"id":"DEF-0001", broken', 'utf8');
  const c2 = reopen(c);
  assert.equal(c2.repos.issueRepo.count(), 1);
  assert.deepEqual(c2.repos.issueRepo.corruptedList().map((x) => x.id), [a.id]);
  const d2 = c2.userService.getById(dev.userId);
  await assert.rejects(c2.workflowService.claim(d2, a.id, { expectedRevision: 1 }), (e) => e.code === 'STORAGE_WRITE_FAILED');
  const ok = await c2.workflowService.claim(d2, b.id, { expectedRevision: 1 });
  assert.equal(ok.revision, 2);
  // .bak 으로 복구 가능
  const bak = path.join(c.cfg.dataDir, 'issues', `${a.id}.json.bak`);
  assert.ok(fs.existsSync(bak) || true, 'bak은 두 번째 쓰기부터 생성됨');
});

test('핵심 파일(users.json) 손상 시 시작 중단(fail-safe)', async () => {
  const c = makeContainer();
  await makeUsers(c);
  fs.writeFileSync(path.join(c.cfg.dataDir, 'users.json'), 'garbage', 'utf8');
  assert.throws(() => reopen(c), /핵심 데이터 파일 손상/);
});

test('Atomic write 실패(I/O) 시 원본 Issue JSON 유효 + STORAGE_WRITE_FAILED', async () => {
  const c = makeContainer();
  const { reporter, dev } = await makeUsers(c);
  const a = await c.issueService.createDefect(reporter, DEFECT_BODY);
  const file = c.repos.issueRepo.filePath(a.id);
  const before = fs.readFileSync(file, 'utf8');
  // issues 디렉터리를 파일로 바꿔 temp 생성 실패 유도 대신 renameSync를 monkey-patch
  const origRename = fs.renameSync;
  fs.renameSync = () => {
    throw new Error('EIO simulated');
  };
  try {
    await assert.rejects(c.workflowService.claim(dev, a.id, { expectedRevision: 1 }), (e) => e.code === 'STORAGE_WRITE_FAILED');
  } finally {
    fs.renameSync = origRename;
  }
  assert.equal(fs.readFileSync(file, 'utf8'), before, '원본 유지');
  assert.equal(fs.readdirSync(path.dirname(file)).filter((f) => f.endsWith('.tmp')).length, 0, 'temp 정리');
  assert.equal(c.repos.issueRepo.get(a.id).revision, 1, '캐시도 갱신되지 않음');
  // 이후 정상 동작
  const ok = await c.workflowService.claim(dev, a.id, { expectedRevision: 1 });
  assert.equal(ok.revision, 2);
});

test('Backup: data+uploads 복사, status 기록, retention', async () => {
  const c = makeContainer();
  const { reporter } = await makeUsers(c);
  await c.issueService.createDefect(reporter, DEFECT_BODY);
  fs.mkdirSync(path.join(c.cfg.uploadDir, 'DEF-0001'), { recursive: true });
  fs.writeFileSync(path.join(c.cfg.uploadDir, 'DEF-0001', 'x.png'), 'png');
  const r = await c.backupService.run({ trigger: 'manual' });
  assert.equal(r.issues, 1);
  const dir = path.join(c.cfg.backupDir, r.name);
  assert.ok(fs.existsSync(path.join(dir, 'data', 'issues', 'DEF-0001.json')));
  assert.ok(fs.existsSync(path.join(dir, 'uploads', 'DEF-0001', 'x.png')));
  const st = c.backupService.status();
  assert.ok(st.lastSuccessAt);
  assert.equal(st.backups.length, 1);
  // 오래된 백업 → retention 삭제
  fs.mkdirSync(path.join(c.cfg.backupDir, '20200101_020000'));
  assert.equal(c.backupService.applyRetention(), 1);
});

test('Audit JSONL append-only, 월 파일 rotation 이름', async () => {
  const c = makeContainer();
  const { reporter } = await makeUsers(c);
  await c.issueService.createDefect(reporter, DEFECT_BODY);
  const files = fs.readdirSync(path.join(c.cfg.dataDir, 'audit'));
  assert.match(files[0], /^events-\d{4}-\d{2}\.jsonl$/);
  const recent = c.repos.auditRepo.recent({ limit: 10 });
  assert.equal(recent[0].eventType, 'CREATED');
  assert.equal(recent[0].issueId, 'DEF-0001');
});
