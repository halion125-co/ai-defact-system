'use strict';

/**
 * 입력 검증 / 경계값 / 악성 입력 테스트 (API 레벨)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeContainer, DEFECT_BODY, startServer, client, promoteToAdmin } = require('./helpers');

async function setup() {
  const c = makeContainer();
  const srv = await startServer(c);
  const admin = client(srv.base);
  const rep = client(srv.base);
  const dev = client(srv.base);
  await admin.post('/api/users', { employeeId: 'admin', name: '김성훈', team: '품질팀' });
  await promoteToAdmin(c, 'admin');
  await rep.post('/api/users', { employeeId: '10001', name: '이영희', team: '업무팀' });
  await dev.post('/api/users', { employeeId: '20001', name: '홍길동', team: '개발팀' });
  return { c, srv, admin, rep, dev };
}

const expectValidation = (r, field) => {
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.equal(r.body.error.code, 'VALIDATION_ERROR');
  if (field) assert.equal(r.body.error.details && r.body.error.details.field, field);
};

test('사용자 등록 검증: 필수/길이/중복/공백', async (t) => {
  const { srv } = await setup();
  t.after(() => srv.close());
  const c = client(srv.base);
  expectValidation(await c.post('/api/users', {}), 'employeeId');
  expectValidation(await c.post('/api/users', { employeeId: '  ', name: '김', team: 'x' }), 'employeeId');
  expectValidation(await c.post('/api/users', { employeeId: '1', name: '김', team: 'x' }), 'name');
  expectValidation(await c.post('/api/users', { employeeId: '1', name: '김'.repeat(51), team: 'x' }), 'name');
  expectValidation(await c.post('/api/users', { employeeId: '1', name: '김철수', team: '' }), 'team');
  expectValidation(await c.post('/api/users', { employeeId: 'ADMIN', name: '김철수', team: '팀' }), 'employeeId'); // 대소문자 무시 중복
  expectValidation(await c.post('/api/users', { employeeId: ' 10001 ', name: '김철수', team: '팀' }), 'employeeId');
  assert.equal((await c.post('/api/users', { employeeId: '\t 40001 ', name: '  김철수  ', team: '  팀 ' })).status, 201);
  const cur = (await c.get('/api/session/current')).body.user;
  assert.equal(cur.employeeId, '40001');
  assert.equal(cur.name, '김철수');
  assert.equal((await c.post('/api/session/start', { employeeId: '' })).status, 400);
  assert.equal((await c.post('/api/session/start', {})).status, 400);
  assert.equal((await c.post('/api/session/start', { employeeId: { $ne: 1 } })).status, 404);
});

test('Defect 등록 검증: 필수/길이/환경/재현절차/타입', async (t) => {
  const { srv, rep } = await setup();
  t.after(() => srv.close());
  const p = (b) => rep.post('/api/issues/defects', b);
  expectValidation(await p({}), 'environmentId');
  expectValidation(await p({ ...DEFECT_BODY, environmentId: 'ENV-NOPE' }), 'environmentId');
  expectValidation(await p({ ...DEFECT_BODY, location: '' }), 'location');
  expectValidation(await p({ ...DEFECT_BODY, location: 'a'.repeat(201) }), 'location');
  expectValidation(await p({ ...DEFECT_BODY, symptom: '짧다' }), 'symptom');
  expectValidation(await p({ ...DEFECT_BODY, symptom: 'a'.repeat(2001) }), 'symptom');
  expectValidation(await p({ ...DEFECT_BODY, reproductionSteps: [] }), 'reproductionSteps');
  expectValidation(await p({ ...DEFECT_BODY, reproductionSteps: 'not array' }), 'reproductionSteps');
  expectValidation(await p({ ...DEFECT_BODY, reproductionSteps: ['', '   '] }), 'reproductionSteps');
  expectValidation(await p({ ...DEFECT_BODY, reproductionSteps: Array(51).fill('x') }), 'reproductionSteps');
  expectValidation(await p({ ...DEFECT_BODY, reproductionSteps: ['a'.repeat(501)] }), 'reproductionSteps');
  expectValidation(await p({ ...DEFECT_BODY, expectedResult: '짧' }), 'expectedResult');
  // 타입 오류(숫자/객체)도 문자열로 정규화되어 검증
  expectValidation(await p({ ...DEFECT_BODY, symptom: 12345 }), 'symptom');
  // 빈 단계 제거 + 객체 형태 단계 허용 + 순서 재부여
  const ok = await p({ ...DEFECT_BODY, reproductionSteps: ['', { text: ' 1단계 ' }, 'x', '2단계', null] });
  assert.equal(ok.status, 201);
  const d = (await rep.get(`/api/issues/${ok.body.id}`)).body.issue;
  assert.deepEqual(d.reproductionSteps.map((s) => [s.order, s.text]), [[1, '1단계'], [2, 'x'], [3, '2단계']]);
  // 배열/문자열 본문
  assert.equal((await p([1, 2])).status, 400);
  assert.equal((await rep.req('POST', '/api/issues/defects', '{bad json', { headers: { 'Content-Type': 'application/json' }, raw: true })).status, 400);
  // 개선/문의
  expectValidation(await rep.post('/api/issues/improvements', { target: 'x' }), 'request');
  expectValidation(await rep.post('/api/issues/inquiries', { question: '질문입니다' }), 'target');
  assert.equal((await rep.post('/api/issues/improvements', { target: 'x', request: '개선 요청 내용', reason: '' })).status, 201);
});

test('XSS/제어문자/공백 정규화: 저장 시 원문 유지, 제어문자 제거, title 80자', async (t) => {
  const { srv, rep } = await setup();
  t.after(() => srv.close());
  const xss = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const r = await rep.post('/api/issues/defects', { ...DEFECT_BODY, location: `  ${xss}  `, symptom: `${'가'.repeat(100)}\n둘째줄\u0000\u0007`, reproductionSteps: ['a\u0000b'] });
  assert.equal(r.status, 201);
  const d = (await rep.get(`/api/issues/${r.body.id}`)).body.issue;
  assert.equal(d.location, xss, '서버는 escape하지 않고 원문 보존(렌더링 시 textContent)');
  assert.equal(d.title.length, 80);
  assert.ok(d.title.endsWith('…'));
  assert.ok(!d.symptom.includes('\u0000'));
  assert.ok(d.symptom.includes('\n둘째줄'));
  assert.equal(d.reproductionSteps[0].text, 'ab');
  // 단일행 필드의 개행은 공백으로
  const r2 = await rep.post('/api/issues/defects', { ...DEFECT_BODY, location: '줄1\n줄2' });
  assert.equal((await rep.get(`/api/issues/${r2.body.id}`)).body.issue.location, '줄1 줄2');
  // JSON 응답이 HTML로 해석되지 않음
  const raw = await rep.get(`/api/issues/${r.body.id}`);
  assert.match(raw.headers['content-type'], /application\/json/);
  assert.equal(raw.headers['x-content-type-options'], 'nosniff');
});

test('expectedRevision 검증: 누락/문자열/음수/소수/미래값', async (t) => {
  const { srv, rep, dev } = await setup();
  t.after(() => srv.close());
  const id = (await rep.post('/api/issues/defects', DEFECT_BODY)).body.id;
  const claim = (b) => dev.post(`/api/issues/${id}/actions/claim`, b);
  expectValidation(await claim({}), 'expectedRevision');
  expectValidation(await claim({ expectedRevision: '1' }), 'expectedRevision');
  expectValidation(await claim({ expectedRevision: -1 }), 'expectedRevision');
  expectValidation(await claim({ expectedRevision: 1.5 }), 'expectedRevision');
  const future = await claim({ expectedRevision: 99 });
  assert.equal(future.status, 409);
  assert.equal(future.body.error.details.currentRevision, 1);
  assert.equal((await claim({ expectedRevision: 1 })).status, 200);
  // 등록내용 수정: changes 누락/빈/동일값
  expectValidation(await rep.patch(`/api/issues/${id}`, { expectedRevision: 2 }), 'changes');
  expectValidation(await rep.patch(`/api/issues/${id}`, { expectedRevision: 2, changes: {} }), 'changes');
  const same = await rep.patch(`/api/issues/${id}`, { expectedRevision: 2, changes: { symptom: DEFECT_BODY.symptom } });
  assert.equal(same.status, 400, '변경 없음');
  assert.equal((await rep.get(`/api/issues/${id}`)).body.issue.revision, 2, '실패한 수정은 revision을 올리지 않음');
});

test('Action 검증: enum/사유/합의내용/알 수 없는 action', async (t) => {
  const { srv, rep, dev, admin } = await setup();
  t.after(() => srv.close());
  const id = (await rep.post('/api/issues/defects', DEFECT_BODY)).body.id;
  await dev.post(`/api/issues/${id}/actions/claim`, { expectedRevision: 1 });
  expectValidation(await dev.post(`/api/issues/${id}/actions/priority`, { expectedRevision: 2, priority: 'HIGH' }), 'priority');
  expectValidation(await dev.post(`/api/issues/${id}/actions/priority`, { expectedRevision: 2, priority: 'critical' }), 'priority');
  assert.equal((await dev.post(`/api/issues/${id}/actions/priority`, { expectedRevision: 2, priority: 'UNASSIGNED' })).status, 400, '동일값');
  assert.equal((await dev.post(`/api/issues/${id}/actions/unknown`, { expectedRevision: 2 })).status, 404);
  await dev.post(`/api/issues/${id}/actions/start`, { expectedRevision: 2 });
  expectValidation(await dev.post(`/api/issues/${id}/actions/resolve`, { expectedRevision: 3, resolution: {} }), 'description');
  expectValidation(await dev.post(`/api/issues/${id}/actions/resolve`, { expectedRevision: 3, resolution: { description: '수정', changeReference: 'x'.repeat(201) } }), 'changeReference');
  assert.equal((await dev.post(`/api/issues/${id}/actions/resolve`, { expectedRevision: 3, resolution: { description: '수정 완료' } })).status, 200);
  expectValidation(await rep.post(`/api/issues/${id}/actions/reopen`, { expectedRevision: 4 }), 'reason');
  expectValidation(await rep.post(`/api/issues/${id}/actions/reopen`, { expectedRevision: 4, reason: 'x' }), 'reason');
  expectValidation(await rep.post(`/api/issues/${id}/actions/close`, { expectedRevision: 4, closeType: 'verified' }), 'closeType');
  expectValidation(await dev.post(`/api/issues/${id}/actions/close`, { expectedRevision: 4, closeType: 'AGREED', comment: '짧음' }), 'comment');
  expectValidation(await admin.post(`/api/issues/${id}/actions/admin-status`, { expectedRevision: 4, status: 'FOO', reason: '사유입니다' }), 'status');
  assert.equal((await admin.post(`/api/issues/${id}/actions/admin-status`, { expectedRevision: 4, status: 'DONE', reason: '사유입니다' })).status, 400, '동일 상태');
  expectValidation(await dev.post(`/api/issues/${id}/actions/cancel`, { expectedRevision: 4 }), 'reason');
  // Cancel 후 모든 workflow action 차단
  assert.equal((await dev.post(`/api/issues/${id}/actions/cancel`, { expectedRevision: 4, reason: '중복' })).status, 200);
  for (const a of ['start', 'resolve', 'reopen', 'close', 'cancel', 'claim']) {
    const r = await dev.post(`/api/issues/${id}/actions/${a}`, { expectedRevision: 5, reason: '사유입니다', closeType: 'AGREED', comment: '합의 내용입니다', resolution: { description: '수정 완료' } });
    assert.equal(r.status, 409, `${a} after cancel`);
    assert.equal(r.body.error.code, 'INVALID_STATE_TRANSITION');
  }
  // Cancel 상태에서 첨부/조치자 변경(비관리자) 차단
  assert.equal((await dev.post(`/api/issues/${id}/actions/assign`, { expectedRevision: 5, assigneeUserId: 'U-000001' })).status, 403);
});

test('Comment/Deployment 검증', async (t) => {
  const { srv, rep, dev } = await setup();
  t.after(() => srv.close());
  const id = (await rep.post('/api/issues/defects', DEFECT_BODY)).body.id;
  expectValidation(await rep.post(`/api/issues/${id}/comments`, { expectedRevision: 1, body: '   ' }), 'body');
  expectValidation(await rep.post(`/api/issues/${id}/comments`, { expectedRevision: 1, body: 'a'.repeat(5001) }), 'body');
  const c = await rep.post(`/api/issues/${id}/comments`, { expectedRevision: 1, body: 'ok', attachmentIds: ['ATT-999', 5, null] });
  assert.equal(c.status, 201);
  assert.deepEqual(c.body.comment.attachments, [], '존재하지 않는 첨부 ID는 무시');
  await dev.post(`/api/issues/${id}/actions/claim`, { expectedRevision: 2 });
  // Done 이전 배포 → 409
  const early = await dev.post(`/api/issues/${id}/deployments`, { expectedRevision: 3, environmentId: 'ENV-DEV' });
  assert.equal(early.status, 409);
  await dev.post(`/api/issues/${id}/actions/start`, { expectedRevision: 3 });
  await dev.post(`/api/issues/${id}/actions/resolve`, { expectedRevision: 4, resolution: { description: '수정 완료' } });
  expectValidation(await dev.post(`/api/issues/${id}/deployments`, { expectedRevision: 5 }), 'environmentId');
  expectValidation(await dev.post(`/api/issues/${id}/deployments`, { expectedRevision: 5, environmentId: 'ENV-DEV', deployedAt: 'not-a-date' }), 'deployedAt');
  const ok = await dev.post(`/api/issues/${id}/deployments`, { expectedRevision: 5, environmentId: 'ENV-DEV', deployedAt: '2026-09-24T10:00:00+09:00', version: '  R1  ' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.deployment.version, 'R1');
  // Reporter 배포 → 403
  assert.equal((await rep.post(`/api/issues/${id}/deployments`, { expectedRevision: 6, environmentId: 'ENV-DEV' })).status, 403);
});

test('설정 검증: 범위/차단 확장자/boolean/revision', async (t) => {
  const { srv, admin } = await setup();
  t.after(() => srv.close());
  expectValidation(await admin.put('/api/config/operation', { staleIssueDays: 0 }), 'staleIssueDays');
  expectValidation(await admin.put('/api/config/operation', { staleIssueDays: '3' }), 'staleIssueDays');
  expectValidation(await admin.put('/api/config/operation', { maxAttachmentMb: 501 }), 'maxAttachmentMb');
  expectValidation(await admin.put('/api/config/operation', { enableDeployment: 'yes' }), 'enableDeployment');
  const ext = await admin.put('/api/config/operation', { allowedExtensions: 'PNG, .jpg, exe, html, js, txt, png' });
  assert.equal(ext.status, 200);
  assert.deepEqual(ext.body.allowedExtensions, ['png', 'jpg', 'txt'], '위험 확장자 제거/중복 제거/소문자');
  assert.equal((await admin.put('/api/config/operation', { expectedRevision: 1, staleIssueDays: 5 })).status, 409, '이전 revision');
  expectValidation(await admin.put('/api/config/project', { customerName: '', projectName: 'x' }), 'customerName');
  expectValidation(await admin.post('/api/config/environments', { displayName: '' }), 'displayName');
  assert.equal((await admin.post('/api/config/environments', { displayName: '개발계' })).status, 400, '중복 이름');
  const env = await admin.post('/api/config/environments', { displayName: '운영계', code: 'pr od!' });
  assert.equal(env.status, 201);
  assert.ok(env.body.environments.some((e) => e.id === 'ENV-PROD'), '코드 정규화');
  expectValidation(await admin.patch('/api/config/environments/ENV-PROD', { order: 0 }), 'order');
  assert.equal((await admin.patch('/api/config/environments/ENV-NOPE', { displayName: 'x' })).status, 404);
  expectValidation(await admin.put('/api/config/priorities', { priorities: [{ code: 'HIGH', displayName: 'x' }] }), 'priority');
  expectValidation(await admin.patch('/api/users/U-000002', { active: 'false' }), 'active');
  assert.equal((await admin.patch('/api/users/U-999', { active: false })).status, 404);
});

test('요청 크기/경로/메서드 방어', async (t) => {
  const { srv, rep } = await setup();
  t.after(() => srv.close());
  const big = await rep.req('POST', '/api/issues/defects', Buffer.alloc(1024 * 1024 + 100, 'a'), { headers: { 'Content-Type': 'application/json' }, raw: true });
  assert.equal(big.status, 413);
  assert.equal((await rep.get('/api/issues/../../users.json')).status, 404);
  assert.equal((await rep.get('/api/issues/DEF-9999')).status, 404);
  assert.equal((await rep.get('/api/issues/%2e%2e%2f%2e%2e%2fsequence')).status, 404);
  assert.equal((await rep.req('DELETE', '/api/issues/DEF-0001')).status, 405);
  assert.equal((await rep.req('PUT', '/api/issues')).status, 405);
  assert.equal((await rep.get('/api/issues/DEF-0001/attachments/ATT-001')).status, 404);
  // 목록 쿼리 이상값은 무시/기본값
  const r = (await rep.get('/api/issues?page=-5&size=99999&sort=;drop&status=NOPE&type=FOO')).body;
  assert.equal(r.page, 1);
  assert.equal(r.size, 500);
  assert.equal(r.total, 0);
  // 대시보드 이상 날짜
  assert.equal((await rep.get('/api/dashboard/summary?dateFrom=abc&dateTo=xyz')).status, 200);
  assert.equal((await rep.get('/api/dashboard/daily?days=abc')).status, 200);
});
