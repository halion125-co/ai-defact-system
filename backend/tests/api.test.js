'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeContainer, DEFECT_BODY, startServer, client } = require('./helpers');

async function setup() {
  const c = makeContainer();
  const srv = await startServer(c);
  const admin = client(srv.base);
  const rep = client(srv.base);
  const dev = client(srv.base);
  const other = client(srv.base);
  assert.equal((await admin.post('/api/users', { employeeId: 'admin', name: '김성훈', team: '품질팀' })).status, 201);
  assert.equal((await rep.post('/api/users', { employeeId: '10001', name: '이영희', team: '업무팀' })).status, 201);
  assert.equal((await dev.post('/api/users', { employeeId: '20001', name: '홍길동', team: '개발팀' })).status, 201);
  assert.equal((await other.post('/api/users', { employeeId: '30001', name: '박민수', team: '테스트팀' })).status, 201);
  return { c, srv, admin, rep, dev, other };
}

test('E2E Scenario A: Reporter 등록 → Claim → Priority → Start → Comment → Resolve → Deploy → Reporter Verified Close', async (t) => {
  const { c, srv, rep, dev } = await setup();
  t.after(() => srv.close());
  const created = await rep.post('/api/issues/defects', DEFECT_BODY);
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.match(id, /^DEF-\d{4}$/);
  let d = (await rep.get(`/api/issues/${id}`)).body;
  assert.equal(d.issue.status, 'OPEN');
  assert.equal(d.issue.assignee, null);
  assert.equal(d.issue.priority, 'UNASSIGNED');
  assert.equal(d.permissions.canClaim, true);
  assert.equal(d.permissions.canEditContent, true);

  let r = await dev.post(`/api/issues/${id}/actions/claim`, { expectedRevision: 1 });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'OPEN', 'Claim은 상태를 바꾸지 않음');
  r = await dev.post(`/api/issues/${id}/actions/priority`, { expectedRevision: 2, priority: 'MAJOR' });
  assert.equal(r.status, 200);
  r = await dev.post(`/api/issues/${id}/actions/start`, { expectedRevision: 3 });
  assert.equal(r.body.status, 'IN_PROGRESS');
  r = await rep.post(`/api/issues/${id}/comments`, { expectedRevision: 4, body: '추가 확인 내용' });
  assert.equal(r.status, 201);
  r = await dev.post(`/api/issues/${id}/actions/resolve`, { expectedRevision: 5, resolution: { description: '수정', changeReference: 'abc123', targetVersion: 'R1' } });
  assert.equal(r.body.status, 'DONE');
  r = await dev.post(`/api/issues/${id}/deployments`, { expectedRevision: 6, environmentId: 'ENV-VERIFY', version: 'R1' });
  assert.equal(r.status, 201);
  assert.equal(r.body.deployment.status, 'DEPLOYED');
  r = await rep.post(`/api/issues/${id}/actions/close`, { expectedRevision: 7, closeType: 'VERIFIED', comment: '정상' });
  assert.equal(r.body.status, 'CLOSED');
  d = (await rep.get(`/api/issues/${id}`)).body;
  assert.equal(d.issue.close.type, 'VERIFIED');
  const types = d.issue.history.map((h) => h.eventType);
  assert.deepEqual(types, ['CREATED', 'ASSIGNED', 'PRIORITY_CHANGED', 'STATUS_CHANGED', 'COMMENTED', 'RESOLVED', 'DEPLOYED', 'CLOSED']);
  for (const h of d.issue.history) {
    assert.ok(h.actor && h.actor.userId && h.timestamp && h.eventId, 'Actor/시간 기록');
  }
  // Audit JSONL 존재
  const auditDir = path.join(c.cfg.dataDir, 'audit');
  const lines = fs.readdirSync(auditDir).flatMap((f) => fs.readFileSync(path.join(auditDir, f), 'utf8').split('\n').filter(Boolean));
  assert.equal(lines.length, 8, '모든 Mutation에 Audit Event');
});

test('Scenario B: Assignee AGREED Close는 합의내용 없으면 400', async (t) => {
  const { srv, rep, dev } = await setup();
  t.after(() => srv.close());
  const id = (await rep.post('/api/issues/defects', DEFECT_BODY)).body.id;
  await dev.post(`/api/issues/${id}/actions/claim`, { expectedRevision: 1 });
  await dev.post(`/api/issues/${id}/actions/start`, { expectedRevision: 2 });
  await dev.post(`/api/issues/${id}/actions/resolve`, { expectedRevision: 3, resolution: { description: '수정' } });
  let r = await dev.post(`/api/issues/${id}/actions/close`, { expectedRevision: 4, closeType: 'AGREED' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'VALIDATION_ERROR');
  r = await dev.post(`/api/issues/${id}/actions/close`, { expectedRevision: 4, closeType: 'VERIFIED' });
  assert.equal(r.status, 403, 'Assignee는 Verified Close 불가');
  r = await dev.post(`/api/issues/${id}/actions/close`, { expectedRevision: 4, closeType: 'AGREED', comment: '김OO 책임과 확인 후 종료 합의' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'CLOSED');
});

test('Scenario D: Admin Override는 사유 필수 + ADMIN_STATUS_OVERRIDE Event', async (t) => {
  const { srv, rep, admin, dev } = await setup();
  t.after(() => srv.close());
  const id = (await rep.post('/api/issues/defects', DEFECT_BODY)).body.id;
  let r = await admin.post(`/api/issues/${id}/actions/admin-status`, { expectedRevision: 1, status: 'DONE' });
  assert.equal(r.status, 400);
  r = await dev.post(`/api/issues/${id}/actions/admin-status`, { expectedRevision: 1, status: 'DONE', reason: 'x' });
  assert.equal(r.status, 403);
  r = await admin.post(`/api/issues/${id}/actions/admin-status`, { expectedRevision: 1, status: 'DONE', reason: '고객 확인 결과 반영' });
  assert.equal(r.status, 200);
  const d = (await admin.get(`/api/issues/${id}`)).body;
  assert.equal(d.issue.history.at(-1).eventType, 'ADMIN_STATUS_OVERRIDE');
  assert.ok(d.issue.resolution.firstResolvedAt);
});

test('Scenario E: 동시 수정 → 하나는 409, 데이터 유실 없음', async (t) => {
  const { c, srv, rep, dev, admin } = await setup();
  t.after(() => srv.close());
  const id = (await rep.post('/api/issues/defects', DEFECT_BODY)).body.id;
  const [a, b] = await Promise.all([
    rep.post(`/api/issues/${id}/comments`, { expectedRevision: 1, body: 'A의 Comment' }),
    admin.post(`/api/issues/${id}/comments`, { expectedRevision: 1, body: 'B의 Comment' }),
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [201, 409]);
  const conflict = a.status === 409 ? a : b;
  assert.equal(conflict.body.error.code, 'REVISION_CONFLICT');
  assert.equal(conflict.body.error.details.currentRevision, 2);
  const d = (await rep.get(`/api/issues/${id}`)).body;
  assert.equal(d.issue.comments.length, 1);
  assert.equal(d.issue.revision, 2);
  // 20건 동시 생성 → ID 중복 0건
  const results = await Promise.all(Array.from({ length: 20 }, () => dev.post('/api/issues/defects', DEFECT_BODY)));
  const ids = results.map((r) => r.body.id);
  assert.equal(new Set(ids).size, 20);
  assert.equal(c.repos.issueRepo.count(), 21);
});

test('Permission matrix (서버 재검증)', async (t) => {
  const { srv, rep, dev, other, admin } = await setup();
  t.after(() => srv.close());
  const id = (await rep.post('/api/issues/defects', DEFECT_BODY)).body.id;
  // 타인 등록내용 수정 → 403
  assert.equal((await other.patch(`/api/issues/${id}`, { expectedRevision: 1, changes: { symptom: '다른 사람이 수정 시도' } })).status, 403);
  // 일반 사용자 Priority → 403
  assert.equal((await other.post(`/api/issues/${id}/actions/priority`, { expectedRevision: 1, priority: 'MAJOR' })).status, 403);
  // 타인 최초 배정: 일반 사용자 403, Admin 200
  assert.equal((await other.post(`/api/issues/${id}/actions/assign`, { expectedRevision: 1, assigneeUserId: 'U-000003' })).status, 403);
  assert.equal((await admin.post(`/api/issues/${id}/actions/assign`, { expectedRevision: 1, assigneeUserId: 'U-000003' })).status, 200);
  // Assignee Priority → 200
  assert.equal((await dev.post(`/api/issues/${id}/actions/priority`, { expectedRevision: 2, priority: 'CRITICAL' })).status, 200);
  // Reporter가 조치완료 → 403
  assert.equal((await dev.post(`/api/issues/${id}/actions/start`, { expectedRevision: 3 })).status, 200);
  assert.equal((await rep.post(`/api/issues/${id}/actions/resolve`, { expectedRevision: 4, resolution: { description: '수정 완료' } })).status, 403);
  // 잘못된 전이(OPEN→DONE 아님, IN_PROGRESS에서 start) → 409 INVALID_STATE_TRANSITION
  const r = await dev.post(`/api/issues/${id}/actions/start`, { expectedRevision: 4 });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'INVALID_STATE_TRANSITION');
  // 타인(비관계자) Comment → 403
  assert.equal((await other.post(`/api/issues/${id}/comments`, { expectedRevision: 4, body: '비관계자 comment' })).status, 403);
  // Assignee 인계: 현재 Assignee가 타인에게 → 200, 인계받은 사용자는 Comment 가능
  assert.equal((await dev.post(`/api/issues/${id}/actions/assign`, { expectedRevision: 4, assigneeUserId: 'U-000004', reason: '이관' })).status, 200);
  assert.equal((await other.post(`/api/issues/${id}/comments`, { expectedRevision: 5, body: '인계받은 조치자 comment' })).status, 201);
  // Admin 등록내용 수정 → 200 + UPDATED Before/After
  const u = await admin.patch(`/api/issues/${id}`, { expectedRevision: 6, changes: { symptom: '관리자가 수정한 현상 설명' } });
  assert.equal(u.status, 200);
  const d = (await admin.get(`/api/issues/${id}`)).body;
  const ev = d.issue.history.at(-1);
  assert.equal(ev.eventType, 'UPDATED');
  assert.equal(ev.before.symptom, DEFECT_BODY.symptom);
  assert.equal(ev.after.symptom, '관리자가 수정한 현상 설명');
  assert.equal(ev.data.byAdmin, true);
  // Reporter 수정 후 allowlist 밖 필드 → 400
  assert.equal((await rep.patch(`/api/issues/${id}`, { expectedRevision: 7, changes: { status: 'DONE' } })).status, 400);
});

test('세션/CSRF/설정 권한', async (t) => {
  const { srv, rep, admin } = await setup();
  t.after(() => srv.close());
  const anon = client(srv.base);
  assert.equal((await anon.get('/api/issues')).status, 401);
  assert.equal((await rep.req('POST', '/api/issues/defects', DEFECT_BODY, { headers: { 'X-Requested-With': '' } })).status, 403);
  assert.equal((await rep.put('/api/config/project', { customerName: 'X', projectName: 'Y' })).status, 403);
  assert.equal((await admin.put('/api/config/project', { customerName: 'X', projectName: 'Y' })).status, 200);
  assert.equal((await rep.patch('/api/users/U-000001', { isQualityAdmin: false })).status, 403, 'self-elevation/변경 금지');
  assert.equal((await admin.patch('/api/users/U-000001', { isQualityAdmin: false })).status, 400, '본인 Admin 해제 불가');
  const cur = (await rep.get('/api/session/current')).body;
  assert.equal(cur.user.employeeId, '10001');
  assert.equal(cur.user.isQualityAdmin, false);
  // 세션 종료
  await rep.post('/api/session/end', {});
  assert.equal((await rep.get('/api/issues')).status, 401);
  // 등록되지 않은 사번
  assert.equal((await rep.login('99999')).status, 404);
});

test('Attachment: allowlist / MIME / traversal / size', async (t) => {
  const { c, srv, rep } = await setup();
  t.after(() => srv.close());
  const id = (await rep.post('/api/issues/defects', DEFECT_BODY)).body.id;
  const B = 'TESTBOUND';
  const mp = (filename, ctype, data, rev = 1) =>
    Buffer.concat([
      Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="expectedRevision"\r\n\r\n${rev}\r\n--${B}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${ctype}\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${B}--\r\n`),
    ]);
  const hdr = { 'Content-Type': `multipart/form-data; boundary=${B}` };
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(100, 1)]);
  let r = await rep.post(`/api/issues/${id}/attachments`, mp('ok.png', 'image/png', png), { headers: hdr, raw: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  r = await rep.post(`/api/issues/${id}/attachments`, mp('bad.exe', 'application/octet-stream', Buffer.from('MZ')), { headers: hdr, raw: true });
  assert.equal(r.body.error.code, 'FILE_TYPE_NOT_ALLOWED');
  // 혼합 업로드: 유효 파일만 저장 + rejected 반환
  const mixed = Buffer.concat([
    Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="expectedRevision"\r\n\r\n2\r\n--${B}\r\nContent-Disposition: form-data; name="file"; filename="good.png"\r\nContent-Type: image/png\r\n\r\n`),
    png,
    Buffer.from(`\r\n--${B}\r\nContent-Disposition: form-data; name="file"; filename="bad.exe"\r\nContent-Type: application/octet-stream\r\n\r\nMZ\r\n--${B}--\r\n`),
  ]);
  r = await rep.post(`/api/issues/${id}/attachments`, mixed, { headers: hdr, raw: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.attachments.length, 1);
  assert.equal(r.body.rejected[0].name, 'bad.exe');
  r = await rep.post(`/api/issues/${id}/attachments`, mp('fake.png', 'image/png', Buffer.from('not a png at all'), 3), { headers: hdr, raw: true });
  assert.equal(r.status, 400, 'MIME/magic 불일치');
  r = await rep.post(`/api/issues/${id}/attachments`, mp('../../evil.png', 'image/png', png, 3), { headers: hdr, raw: true });
  assert.equal(r.status, 201);
  const d = (await rep.get(`/api/issues/${id}`)).body;
  const atts = d.issue.attachments;
  assert.equal(atts.length, 3);
  assert.equal(atts[2].originalName, 'evil.png');
  for (const a of atts) {
    assert.ok(!a.storedName.includes('..'));
    assert.ok(fs.existsSync(path.join(c.cfg.uploadDir, id, a.storedName)));
  }
  assert.equal(fs.readdirSync(c.cfg.uploadDir).length, 1, 'uploads 루트에 traversal 파일 없음');
  // 다운로드
  r = await rep.get(`/api/issues/${id}/attachments/${atts[0].attachmentId}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.buf.length, png.length);
  // oversize (설정 1MB로 낮춤)
  await c.configService.updateOperation({ isQualityAdmin: true, userId: 'U-000001' }, { maxAttachmentMb: 1 });
  r = await rep.post(`/api/issues/${id}/attachments`, mp('big.png', 'image/png', Buffer.concat([png, Buffer.alloc(1024 * 1024 + 10)]), 4), { headers: hdr, raw: true });
  assert.equal(r.status, 413);
});

test('Search/Filter/Sort/Pagination', async (t) => {
  const { srv, rep, dev, admin } = await setup();
  t.after(() => srv.close());
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push((await rep.post('/api/issues/defects', { ...DEFECT_BODY, symptom: `현상 번호 ${i} 로그인 오류`, environmentId: i % 2 ? 'ENV-DEV' : 'ENV-TEST' })).body.id);
  await rep.post('/api/issues/improvements', { target: '화면', request: '개선 요청 사항입니다' });
  await dev.post(`/api/issues/${ids[0]}/actions/claim`, { expectedRevision: 1 });
  await dev.post(`/api/issues/${ids[0]}/actions/priority`, { expectedRevision: 2, priority: 'CRITICAL' });
  let r = (await admin.get(`/api/issues?q=${encodeURIComponent(ids[1])}`)).body;
  assert.equal(r.total, 1);
  r = (await admin.get('/api/issues?q=' + encodeURIComponent('로그인'))).body;
  assert.equal(r.total, 5);
  r = (await admin.get('/api/issues?type=IMPROVEMENT')).body;
  assert.equal(r.total, 1);
  r = (await admin.get('/api/issues?environmentId=ENV-DEV')).body;
  assert.equal(r.total, 2);
  r = (await admin.get('/api/issues?priority=CRITICAL&assignee=U-000003')).body;
  assert.equal(r.total, 1);
  r = (await admin.get('/api/issues?assignee=UNASSIGNED&type=DEFECT')).body;
  assert.equal(r.total, 4);
  r = (await admin.get('/api/issues?sort=id&size=2&page=2')).body;
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].id, 'DEF-0003');
  r = (await admin.get('/api/issues?createdFrom=2000-01-01&createdTo=2000-01-02')).body;
  assert.equal(r.total, 0);
  r = (await admin.get('/api/search?q=' + encodeURIComponent('개선'))).body;
  assert.equal(r.items[0].type, 'IMPROVEMENT');
  r = (await rep.get('/api/my/counts')).body;
  assert.equal(r.reported, 6);
});

test('Comment hide: Admin only, 원문 보존', async (t) => {
  const { c, srv, rep, admin } = await setup();
  t.after(() => srv.close());
  const id = (await rep.post('/api/issues/defects', DEFECT_BODY)).body.id;
  await rep.post(`/api/issues/${id}/comments`, { expectedRevision: 1, body: '개인정보 포함 comment' });
  assert.equal((await rep.post(`/api/issues/${id}/comments/CMT-0001/hide`, { expectedRevision: 2, reason: 'x' })).status, 403);
  assert.equal((await admin.post(`/api/issues/${id}/comments/CMT-0001/hide`, { expectedRevision: 2, reason: '개인정보' })).status, 200);
  const asRep = (await rep.get(`/api/issues/${id}`)).body.issue.comments[0];
  assert.equal(asRep.hidden, true);
  assert.equal(asRep.body, null);
  const asAdmin = (await admin.get(`/api/issues/${id}`)).body.issue.comments[0];
  assert.equal(asAdmin.body, '개인정보 포함 comment');
  const raw = c.repos.issueRepo.get(id);
  assert.equal(raw.comments[0].body, '개인정보 포함 comment', '파일 원문 보존');
});

test('Config: 환경 참조 시 삭제 대신 inactive, 최소 1개 활성 보장', async (t) => {
  const { srv, rep, admin } = await setup();
  t.after(() => srv.close());
  await rep.post('/api/issues/defects', DEFECT_BODY); // ENV-VERIFY 참조
  let r = await admin.del('/api/config/environments/ENV-VERIFY');
  assert.equal(r.body.mode, 'INACTIVATED');
  r = await admin.del('/api/config/environments/ENV-DEV');
  assert.equal(r.body.mode, 'DELETED');
  r = await admin.del('/api/config/environments/ENV-TEST');
  assert.equal(r.status, 400, '최소 1개 활성 환경');
  r = await admin.post('/api/config/environments', { displayName: '운영계', code: 'PROD' });
  assert.equal(r.status, 201);
  assert.ok(r.body.environments.some((e) => e.id === 'ENV-PROD'));
  // 비활성 환경으로 Defect 등록 → 400
  r = await rep.post('/api/issues/defects', DEFECT_BODY);
  assert.equal(r.status, 400);
});

test('보안 헤더 / 정적 파일 / 외부 리소스 없음', async (t) => {
  const { srv, rep } = await setup();
  t.after(() => srv.close());
  const r = await rep.get('/');
  assert.equal(r.status, 200);
  assert.ok(r.headers['content-security-policy'].includes("default-src 'self'"));
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  const html = r.buf.toString('utf8');
  assert.ok(!/https?:\/\//.test(html.replace(/http:\/\/www\.w3\.org/g, '')), 'index.html 외부 URL 없음');
  const t2 = await rep.get('/../../package.json');
  assert.notEqual(t2.status, 200);
});
