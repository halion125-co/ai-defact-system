'use strict';

/**
 * Issue 임시저장(DRAFT) 생성/수정/정식등록 전환 + 노출 범위(내가 등록 전용, 타인 비공개) 테스트.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeContainer, makeUsers, promoteToAdmin, startServer, client } = require('./helpers');

async function setup() {
  const c = makeContainer();
  const srv = await startServer(c);
  const admin = client(srv.base);
  const rep = client(srv.base);
  const other = client(srv.base);
  await admin.post('/api/users', { employeeId: 'admin', name: '김성훈', team: '품질팀' });
  await promoteToAdmin(c, 'admin');
  await rep.post('/api/users', { employeeId: '10001', name: '이영희', team: '업무팀' });
  await other.post('/api/users', { employeeId: '30001', name: '박민수', team: '테스트팀' });
  return { c, srv, admin, rep, other };
}

test('임시저장: 유형만으로 생성 가능하고, 필수값 없이도 저장된다', async (t) => {
  const { srv, rep } = await setup();
  t.after(() => srv.close());
  const r = await rep.post('/api/issues/drafts', { type: 'DEFECT' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, 'DRAFT');
  assert.match(r.body.id, /^DEF-\d{4}$/);

  const detail = await rep.get(`/api/issues/${r.body.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.issue.status, 'DRAFT');
  assert.equal(detail.body.issue.location, '');
});

test('임시저장 수정: 이어 작성 시 입력값이 누적 저장된다', async (t) => {
  const { srv, rep } = await setup();
  t.after(() => srv.close());
  const created = await rep.post('/api/issues/drafts', { type: 'IMPROVEMENT', target: '대시보드' });
  const id = created.body.id;
  const patched = await rep.patch(`/api/issues/${id}/draft`, { expectedRevision: created.body.revision, changes: { request: '필터를 상단에 노출' } });
  assert.equal(patched.status, 200, JSON.stringify(patched.body));

  const detail = await rep.get(`/api/issues/${id}`);
  assert.equal(detail.body.issue.target, '대시보드');
  assert.equal(detail.body.issue.request, '필터를 상단에 노출');
  assert.equal(detail.body.issue.status, 'DRAFT');
});

test('임시저장 정식등록 전환: 필수값 검증 통과해야 OPEN으로 바뀌고, 부족하면 400', async (t) => {
  const { srv, rep } = await setup();
  t.after(() => srv.close());
  const created = await rep.post('/api/issues/drafts', { type: 'INQUIRY', target: '고객 문의' });
  const id = created.body.id;

  // 필수값(question) 없이 제출하면 400, 여전히 DRAFT 유지
  const bad = await rep.post(`/api/issues/${id}/actions/submit`, { expectedRevision: created.body.revision, changes: {} });
  assert.equal(bad.status, 400, JSON.stringify(bad.body));
  const stillDraft = await rep.get(`/api/issues/${id}`);
  assert.equal(stillDraft.body.issue.status, 'DRAFT');

  // 필수값 채워서 제출하면 OPEN으로 전환
  const ok = await rep.post(`/api/issues/${id}/actions/submit`, { expectedRevision: created.body.revision, changes: { question: '환불 절차가 궁금합니다' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.status, 'OPEN');
  const detail = await rep.get(`/api/issues/${id}`);
  assert.equal(detail.body.issue.status, 'OPEN');
  assert.equal(detail.body.issue.question, '환불 절차가 궁금합니다');
});

test('임시저장 노출 범위: 목록/검색/카운트/상세 모두 작성자 본인과 Admin에게만 보이고 타인에게는 숨겨진다', async (t) => {
  const { srv, admin, rep, other } = await setup();
  t.after(() => srv.close());
  const created = await rep.post('/api/issues/drafts', { type: 'DEFECT', location: '고객관리' });
  const id = created.body.id;

  // 기본 목록(Kanban/List 기본 조회 상당)에서는 작성자 본인에게도 자동 노출되지 않음(status 미지정)
  const repDefaultList = await rep.get('/api/issues?type=DEFECT');
  assert.ok(!repDefaultList.body.items.some((i) => i.id === id), '기본 조회에는 DRAFT가 섞이지 않아야 함');

  // "내가 등록"(mine=reported + includeDraft=true)에는 작성자 본인에게 노출
  const repMine = await rep.get('/api/issues?mine=reported&includeDraft=true');
  assert.ok(repMine.body.items.some((i) => i.id === id), '내가 등록 탭에는 DRAFT가 노출되어야 함');

  // 타인은 mine=reported(본인 기준)라 애초에 안 보이지만, status=DRAFT를 직접 질의해도 안 보여야 함
  const otherDraftQuery = await other.get('/api/issues?status=DRAFT');
  assert.ok(!otherDraftQuery.body.items.some((i) => i.id === id), '타인은 status=DRAFT 직접 조회로도 볼 수 없어야 함');

  // 타인이 상세를 직접 열람해도 404(존재 자체를 숨김)
  const otherDetail = await other.get(`/api/issues/${id}`);
  assert.equal(otherDetail.status, 404);

  // Admin은 status=DRAFT로 전체 조회 가능, 상세도 열람 가능
  const adminDraftQuery = await admin.get('/api/issues?status=DRAFT');
  assert.ok(adminDraftQuery.body.items.some((i) => i.id === id), 'Admin은 status=DRAFT로 전체 열람 가능해야 함');
  const adminDetail = await admin.get(`/api/issues/${id}`);
  assert.equal(adminDetail.status, 200);

  // 검색에도 타인에게는 노출되지 않음
  const otherSearch = await other.get('/api/search?q=' + encodeURIComponent('고객관리'));
  assert.ok(!otherSearch.body.items.some((i) => i.id === id));

  // /api/my/counts의 reported 건수에는 본인 DRAFT가 포함됨
  const counts = await rep.get('/api/my/counts');
  assert.ok(counts.body.reported >= 1);
});

test('임시저장은 작성자 본인만 수정/제출할 수 있다', async (t) => {
  const { srv, rep, other } = await setup();
  t.after(() => srv.close());
  const created = await rep.post('/api/issues/drafts', { type: 'DEFECT' });
  const id = created.body.id;

  const otherPatch = await other.patch(`/api/issues/${id}/draft`, { expectedRevision: created.body.revision, changes: { location: '침입 시도' } });
  assert.equal(otherPatch.status, 403);

  const otherSubmit = await other.post(`/api/issues/${id}/actions/submit`, { expectedRevision: created.body.revision, changes: {} });
  assert.equal(otherSubmit.status, 403);
});

test('DRAFT 상태에서는 Claim/Start 등 일반 Workflow Action이 모두 거부된다', async (t) => {
  const { srv, rep } = await setup();
  t.after(() => srv.close());
  const created = await rep.post('/api/issues/drafts', { type: 'DEFECT' });
  const id = created.body.id;
  const claim = await rep.post(`/api/issues/${id}/actions/claim`, { expectedRevision: created.body.revision });
  assert.equal(claim.status, 409);
});
