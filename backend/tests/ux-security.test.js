'use strict';

/**
 * UX(여러 줄/붙여넣기 텍스트 왕복) + 보안(권한 없는 직접 접근/변조) 테스트
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeContainer, DEFECT_BODY, startServer, client } = require('./helpers');

async function setup() {
  const c = makeContainer();
  const srv = await startServer(c);
  const admin = client(srv.base);
  const rep = client(srv.base);
  const dev = client(srv.base);
  const other = client(srv.base);
  await admin.post('/api/users', { employeeId: 'admin', name: '김성훈', team: '품질팀' });
  await rep.post('/api/users', { employeeId: '10001', name: '이영희', team: '업무팀' });
  await dev.post('/api/users', { employeeId: '20001', name: '홍길동', team: '개발팀' });
  await other.post('/api/users', { employeeId: '30001', name: '박민수', team: '테스트팀' });
  return { c, srv, admin, rep, dev, other };
}

/* ===================== UX: 텍스트 왕복 ===================== */

test('여러 줄/빈 줄/탭/CRLF 입력이 저장·조회·수정에서 그대로 유지된다', async (t) => {
  const { srv, rep } = await setup();
  t.after(() => srv.close());
  const symptom = '첫 줄 현상 설명입니다.\r\n\r\n두 번째 문단.\r\n\t들여쓴 줄\r\n\r\n\r\n\r\n세 번째 문단 (빈 줄 3개 이상 → 2개로 축약)   \r\n마지막 줄';
  const expected = '결과는\n정상이어야 합니다.\n\n- 항목 1\n- 항목 2';
  const r = await rep.post('/api/issues/defects', { ...DEFECT_BODY, symptom, expectedResult: expected });
  assert.equal(r.status, 201);
  const d = (await rep.get(`/api/issues/${r.body.id}`)).body.issue;
  assert.equal(d.symptom, '첫 줄 현상 설명입니다.\n\n두 번째 문단.\n\t들여쓴 줄\n\n세 번째 문단 (빈 줄 3개 이상 → 2개로 축약)\n마지막 줄');
  assert.equal(d.expectedResult, expected);
  assert.equal(d.title, '첫 줄 현상 설명입니다.', '제목은 첫 줄');
  // 수정 왕복: 동일 내용 재전송 → 변경 없음(400), 한 줄 추가 → UPDATED + before/after 보존
  const same = await rep.patch(`/api/issues/${r.body.id}`, { expectedRevision: 1, changes: { symptom: d.symptom } });
  assert.equal(same.status, 400);
  const upd = await rep.patch(`/api/issues/${r.body.id}`, { expectedRevision: 1, changes: { symptom: d.symptom + '\n\n추가된 문단' } });
  assert.equal(upd.status, 200);
  const d2 = (await rep.get(`/api/issues/${r.body.id}`)).body.issue;
  assert.equal(d2.symptom, d.symptom + '\n\n추가된 문단');
  const ev = d2.history.at(-1);
  assert.equal(ev.eventType, 'UPDATED');
  assert.equal(ev.before.symptom, d.symptom);
  assert.equal(ev.after.symptom, d2.symptom);
});

test('단독 CR(구형 편집기)·유니코드·이모지·긴 URL 붙여넣기', async (t) => {
  const { srv, rep } = await setup();
  t.after(() => srv.close());
  const url = 'https://internal.example.bank/very/long/path/' + 'a'.repeat(300);
  const r = await rep.post('/api/issues/defects', { ...DEFECT_BODY, symptom: `줄1\r줄2\r줄3 🐞🔥 ${url}`, location: '고객관리\r> 조회' });
  assert.equal(r.status, 201);
  const d = (await rep.get(`/api/issues/${r.body.id}`)).body.issue;
  assert.equal(d.symptom, `줄1\n줄2\n줄3 🐞🔥 ${url}`);
  assert.equal(d.location, '고객관리 > 조회', '단일행 필드의 개행은 공백');
  assert.equal(d.title, '줄1');
  // 이모지 경계 제목 자르기
  const emoji = '🐞'.repeat(100);
  const r2 = await rep.post('/api/issues/defects', { ...DEFECT_BODY, symptom: emoji });
  const t2 = (await rep.get(`/api/issues/${r2.body.id}`)).body.issue.title;
  assert.equal(Array.from(t2).length, 80);
  assert.ok(t2.endsWith('…'));
  assert.ok(Array.from(t2.slice(0, -1)).every((ch) => ch === '🐞'), '깨진 서로게이트 없음');
});

test('로그/스택트레이스 붙여넣기(2000자 초과)는 필드 단위 오류로 안내, 한도 내는 저장', async (t) => {
  const { srv, rep } = await setup();
  t.after(() => srv.close());
  const stack = Array.from({ length: 80 }, (_, i) => `\tat com.bank.service.CustomerService.find(CustomerService.java:${100 + i})`).join('\n');
  const big = `java.lang.NullPointerException: token\n${stack}`;
  assert.ok(big.length > 2000);
  const r = await rep.post('/api/issues/defects', { ...DEFECT_BODY, symptom: big });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.details.field, 'symptom');
  assert.match(r.body.error.message, /2000자/);
  const ok = await rep.post('/api/issues/defects', { ...DEFECT_BODY, symptom: big.slice(0, 1990) });
  assert.equal(ok.status, 201);
  const d = (await rep.get(`/api/issues/${ok.body.id}`)).body.issue;
  assert.ok(d.symptom.includes('\tat com.bank'), '탭 보존');
  // Comment에 스택트레이스(5000자 이내)
  const tooLong = await rep.post(`/api/issues/${ok.body.id}/comments`, { expectedRevision: 1, body: big.repeat(2) });
  assert.equal(tooLong.status, 400);
  assert.equal(tooLong.body.error.details.field, 'body');
  const c = await rep.post(`/api/issues/${ok.body.id}/comments`, { expectedRevision: 1, body: big.slice(0, 4900) });
  assert.equal(c.status, 201);
  assert.ok(c.body.comment.body.split('\n').length > 60);
});

test('재현절차: 번호 붙은 여러 줄을 배열로 보냈을 때 순서/내용 보존, 각 단계 개행은 공백', async (t) => {
  const { srv, rep } = await setup();
  t.after(() => srv.close());
  const r = await rep.post('/api/issues/defects', { ...DEFECT_BODY, reproductionSteps: ['1. 로그인', '2. 메뉴\r\n진입', '  ', '1.5초 대기', '조회'] });
  const d = (await rep.get(`/api/issues/${r.body.id}`)).body.issue;
  assert.deepEqual(d.reproductionSteps.map((s) => s.text), ['1. 로그인', '2. 메뉴 진입', '1.5초 대기', '조회']);
  assert.deepEqual(d.reproductionSteps.map((s) => s.order), [1, 2, 3, 4]);
});

test('검색은 여러 줄 본문/Comment 내부 단어도 찾고, 숨김 Comment는 노출하지 않는다', async (t) => {
  const { srv, rep, admin, other } = await setup();
  t.after(() => srv.close());
  const r = await rep.post('/api/issues/defects', { ...DEFECT_BODY, symptom: '첫 줄\n\n둘째 줄에 고유단어ALPHA 포함' });
  await rep.post(`/api/issues/${r.body.id}/comments`, { expectedRevision: 1, body: '비밀단어BRAVO 포함 comment' });
  assert.equal((await other.get('/api/search?q=' + encodeURIComponent('고유단어ALPHA'))).body.items.length, 1);
  assert.equal((await other.get('/api/search?q=' + encodeURIComponent('비밀단어BRAVO'))).body.items.length, 1);
  await admin.post(`/api/issues/${r.body.id}/comments/CMT-0001/hide`, { expectedRevision: 2, reason: '개인정보' });
  assert.equal((await other.get('/api/search?q=' + encodeURIComponent('비밀단어BRAVO'))).body.items.length, 0, '숨김 후 검색 불가');
  assert.equal((await other.get('/api/issues?q=' + encodeURIComponent('비밀단어BRAVO'))).body.total, 0);
  const list = (await other.get(`/api/issues?q=${r.body.id}`)).body.items[0];
  assert.equal(list.commentCount, 0, '숨김 Comment는 카운트 제외');
});

/* ===================== 보안: 권한 없는 직접 접근 ===================== */

test('세션 없는 직접 접근: API 401, 데이터/업로드 경로 404, 정적 traversal 차단', async (t) => {
  const { srv, rep } = await setup();
  t.after(() => srv.close());
  const anon = client(srv.base);
  const id = (await rep.post('/api/issues/defects', DEFECT_BODY)).body.id;
  for (const p of [`/api/issues/${id}`, '/api/issues', '/api/dashboard/summary', '/api/users', '/api/config/operation', `/api/issues/${id}/attachments/ATT-001`, '/api/my/counts', '/api/admin/health']) {
    assert.equal((await anon.get(p)).status, 401, p);
  }
  for (const p of [`/data/issues/${id}.json`, '/data/users.json', '/uploads/', '/uploads', `/uploads/${id}/x.png`, '/backend/server.js', '/backend', '/config/server.config.json', '/config', '/package.json', '/.git/config', '/logs', '/backup']) {
    const r = await anon.get(p);
    assert.ok(r.status === 404 || r.status === 403, `${p} → ${r.status}`);
  }
  for (const p of ['/..%2f..%2fdata/users.json', '/%2e%2e/%2e%2e/package.json', '/js/../../data/users.json']) {
    const r = await anon.get(p);
    assert.notEqual(r.status, 200, p);
    assert.ok(!(r.buf && r.buf.toString().includes('"users"')), `${p} 내용 노출`);
  }
  // 프론트 SPA fallback은 index.html만
  const html = await anon.get('/issues/DEF-0001');
  assert.equal(html.status, 200);
  assert.ok(html.buf.toString().includes('<title>'));
});

test('세션 쿠키 속성 / 세션 고정 방지 / 세션 종료 후 재사용 불가', async (t) => {
  const { srv } = await setup();
  t.after(() => srv.close());
  const c = client(srv.base);
  const r = await c.login('10001');
  const cookie = r.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  const sid1 = cookie.split(';')[0];
  // 동일 클라이언트가 다른 사번으로 재로그인 → 새 sid 발급, 이전 sid 무효
  const r2 = await c.login('20001');
  const sid2 = r2.headers['set-cookie'][0].split(';')[0];
  assert.notEqual(sid1, sid2);
  const stale = client(srv.base);
  const res = await stale.req('GET', '/api/session/current', undefined, { headers: { Cookie: sid1 } });
  assert.equal(res.body.user, null, '이전 세션 무효');
  // 종료 후 재사용
  await c.post('/api/session/end', {});
  assert.equal((await c.get('/api/issues')).status, 401);
  const reuse = await stale.req('GET', '/api/issues', undefined, { headers: { Cookie: sid2 } });
  assert.equal(reuse.status, 401);
  // 위조 sid
  const forged = await stale.req('GET', '/api/issues', undefined, { headers: { Cookie: 'dms_sid=' + 'f'.repeat(48) } });
  assert.equal(forged.status, 401);
});

test('비활성화/권한 해제는 기존 세션에 즉시 적용된다', async (t) => {
  const { srv, admin, dev, other } = await setup();
  t.after(() => srv.close());
  // other → Admin 지정 후 해제: 해제 즉시 admin API 403
  await admin.patch('/api/users/U-000004', { isQualityAdmin: true });
  assert.equal((await other.get('/api/admin/health')).status, 200);
  await admin.patch('/api/users/U-000004', { isQualityAdmin: false });
  assert.equal((await other.get('/api/admin/health')).status, 403, '재로그인 없이 권한 해제 반영');
  // dev 비활성화 → 기존 세션 401
  assert.equal((await dev.get('/api/issues')).status, 200);
  await admin.patch('/api/users/U-000003', { active: false });
  assert.equal((await dev.get('/api/issues')).status, 401, '비활성 사용자 세션 즉시 차단');
  assert.equal((await dev.login('20001')).status, 403, '비활성 사용자 재로그인 차단');
  // 비활성 사용자에게 배정 시도 → 400
  const id = (await admin.post('/api/issues/defects', DEFECT_BODY)).body.id;
  assert.equal((await admin.post(`/api/issues/${id}/actions/assign`, { expectedRevision: 1, assigneeUserId: 'U-000003' })).status, 400);
});

test('일반 사용자의 관리자 API/설정 API 직접 호출은 모두 403', async (t) => {
  const { srv, rep } = await setup();
  t.after(() => srv.close());
  const calls = [
    ['GET', '/api/admin/backup/status'],
    ['POST', '/api/admin/backup/run', {}],
    ['GET', '/api/admin/audit'],
    ['GET', '/api/admin/health'],
    ['PUT', '/api/config/project', { customerName: 'x', projectName: 'y' }],
    ['POST', '/api/config/environments', { displayName: 'x' }],
    ['PATCH', '/api/config/environments/ENV-DEV', { active: false }],
    ['DELETE', '/api/config/environments/ENV-DEV'],
    ['PUT', '/api/config/environments/order', { ids: [] }],
    ['PUT', '/api/config/priorities', { priorities: [] }],
    ['PUT', '/api/config/operation', { staleIssueDays: 1 }],
    ['PATCH', '/api/users/U-000001', { active: false }],
    ['PATCH', '/api/users/U-000002', { isQualityAdmin: true }],
  ];
  for (const [m, p, b] of calls) {
    const r = await rep.req(m, p, b);
    assert.equal(r.status, 403, `${m} ${p} → ${r.status}`);
  }
});

test('요청 본문으로 Actor/소유자/상태를 변조할 수 없다', async (t) => {
  const { srv, rep, dev, other } = await setup();
  t.after(() => srv.close());
  // reporter/status/assignee/priority/id를 본문에 넣어도 무시
  const r = await rep.post('/api/issues/defects', { ...DEFECT_BODY, reporter: { userId: 'U-000001' }, status: 'CLOSED', priority: 'CRITICAL', assignee: { userId: 'U-000003' }, id: 'DEF-9999', revision: 99 });
  assert.equal(r.status, 201);
  const d = (await rep.get(`/api/issues/${r.body.id}`)).body.issue;
  assert.equal(d.reporter.userId, 'U-000002');
  assert.equal(d.status, 'OPEN');
  assert.equal(d.priority, 'UNASSIGNED');
  assert.equal(d.assignee, null);
  assert.equal(d.revision, 1);
  // claim에 assigneeUserId를 넣어도 본인만 배정
  const cl = await other.post(`/api/issues/${d.id}/actions/claim`, { expectedRevision: 1, assigneeUserId: 'U-000003' });
  assert.equal(cl.body.assignee.userId, 'U-000004');
  // Comment author 위조 무시
  const cm = await rep.post(`/api/issues/${d.id}/comments`, { expectedRevision: 2, body: 'x', author: { userId: 'U-000001', nameSnapshot: '관리자' } });
  assert.equal(cm.body.comment.author.userId, 'U-000002');
  // 등록내용 수정으로 상태/조치자/Priority 변경 시도 → 400
  for (const changes of [{ status: 'CLOSED' }, { assignee: null }, { priority: 'CRITICAL' }, { reporter: {} }, { history: [] }, { revision: 1 }]) {
    const u = await rep.patch(`/api/issues/${d.id}`, { expectedRevision: 3, changes });
    assert.equal(u.status, 400, JSON.stringify(changes));
  }
  // 사용자 등록 시 isQualityAdmin/__proto__ 주입 무시
  const c2 = client(srv.base);
  const reg = await c2.req('POST', '/api/users', JSON.stringify({ employeeId: '77777', name: '주입자', team: 't', isQualityAdmin: true, __proto__: { isQualityAdmin: true }, active: true }), { headers: { 'Content-Type': 'application/json' }, raw: true });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.isQualityAdmin, false);
  assert.equal((await c2.get('/api/admin/health')).status, 403);
  // 타인 Issue의 첨부 삭제/조치 완료/배포 등록 시도
  assert.equal((await other.post(`/api/issues/${d.id}/actions/resolve`, { expectedRevision: 3, resolution: { description: '내가 조치자' } })).status, 409, 'OPEN에서 resolve 불가(상태)');
  assert.equal((await dev.post(`/api/issues/${d.id}/actions/start`, { expectedRevision: 3 })).status, 403, '조치자 아닌 사용자 start');
  assert.equal((await dev.del(`/api/issues/${d.id}/attachments/ATT-001?expectedRevision=3`)).status, 404);
});

test('숨김 Comment·삭제 첨부는 비관리자에게 어떤 경로로도 노출되지 않는다', async (t) => {
  const { srv, rep, admin, other, c } = await setup();
  t.after(() => srv.close());
  const id = (await rep.post('/api/issues/defects', DEFECT_BODY)).body.id;
  await rep.post(`/api/issues/${id}/comments`, { expectedRevision: 1, body: '주민번호 000000-0000000' });
  await admin.post(`/api/issues/${id}/comments/CMT-0001/hide`, { expectedRevision: 2, reason: '개인정보' });
  const d = (await other.get(`/api/issues/${id}`)).body;
  const raw = JSON.stringify(d);
  assert.ok(!raw.includes('000000-0000000'), '상세 응답 전체(history 포함)에 원문 없음');
  assert.ok(!JSON.stringify((await other.get(`/api/issues?q=${id}`)).body).includes('000000-0000000'));
  assert.ok(!JSON.stringify((await other.get('/api/search?q=' + encodeURIComponent('주민번호'))).body).includes('000000'));
  // Admin은 원문 확인 가능 + 파일 원본 보존
  assert.ok(JSON.stringify((await admin.get(`/api/issues/${id}`)).body).includes('000000-0000000'));
  assert.equal(c.repos.issueRepo.get(id).comments[0].body, '주민번호 000000-0000000');
});

test('로그인 전 화면: /api/users/recent는 요청한 사번 1건만 반환하고 타 사용자 목록을 노출하지 않는다', async (t) => {
  const { srv, admin, dev } = await setup();
  t.after(() => srv.close());
  const anon = client(srv.base);
  // employeeId 없이 호출 → 빈 목록(과거처럼 전체 목록을 내려주지 않음)
  let r = await anon.get('/api/users/recent');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.users, []);
  // 존재하는 본인 사번 → 그 1건만
  r = await anon.get('/api/users/recent?employeeId=10001');
  assert.equal(r.body.users.length, 1);
  assert.equal(r.body.users[0].employeeId, '10001');
  assert.equal(r.body.users[0].name, '이영희');
  // 모르는 사번을 넣으면 아무 정보도 주지 않는다(사번 존재 여부 추측 방지)
  r = await anon.get('/api/users/recent?employeeId=99999999');
  assert.deepEqual(r.body.users, []);
  // 비활성 사용자는 조회되지 않음
  const devId = (await admin.get('/api/users?q=20001')).body.users[0].userId;
  await admin.patch(`/api/users/${devId}`, { active: false });
  r = await anon.get('/api/users/recent?employeeId=20001');
  assert.deepEqual(r.body.users, []);
  void dev;
});
