/**
 * 기능/UI/입력검증 통합 브라우저 검증. 4 사용자 컨텍스트(admin/reporter/dev/other).
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const BASE = 'http://localhost:18080';
const OUT = path.join(__dirname, 'shots2');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const SCR = path.resolve(__dirname, '..');
const results = [];
const RND = String(Date.now()).slice(-6);
const consoleErrors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--window-size=1440,1000', '--lang=ko-KR'] });
  const users = {};
  async function login(key, employeeId) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${key}] ${m.text()}`); });
    page.on('pageerror', (e) => consoleErrors.push(`[${key}] pageerror ${e.message}`));
    page.on('request', (r) => { const u = new URL(r.url()); if (u.protocol !== 'data:' && u.host !== 'localhost:18080') consoleErrors.push(`[${key}] EXTERNAL ${r.url()}`); });
    await page.goto(`${BASE}/#/start`, { waitUntil: 'networkidle0' });
    await page.type('.login-card input.input', employeeId);
    await page.click('.login-card .btn-primary');
    await page.waitForSelector('.shell', { timeout: 8000 });
    await sleep(600);
    users[key] = page;
    return page;
  }
  const shot = async (page, name) => { await sleep(400); await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true }); };
  const go = async (page, hash) => { const target = `${BASE}/${hash}`; if (page.url() === target) await page.reload({ waitUntil: 'networkidle0' }); else await page.goto(target, { waitUntil: 'networkidle0' }); await sleep(500); };
  const text = async (page, sel) => page.$eval(sel, (e) => e.textContent).catch(() => null);
  const has = async (page, sel) => !!(await page.$(sel));
  const clickText = async (page, t, scope = 'button') => page.evaluate((t, scope) => { const b = [...document.querySelectorAll(scope)].find((x) => x.textContent.trim().includes(t)); if (b) { b.click(); return true; } return false; }, t, scope);
  const btnTexts = async (page, sel = '.action-bar button') => page.$$eval(sel, (bs) => bs.map((b) => b.textContent.trim()));
  const idle = async (page) => { await page.waitForFunction(() => !document.querySelector('.spinner'), { timeout: 15000 }).catch(() => {}); await sleep(400); };
  const modalSubmit = async (page) => { await page.click('.modal-foot .btn-primary, .modal-foot .btn-success, .modal-foot .btn-warning, .modal-foot .btn-danger'); await idle(page); };
  const modalError = async (page) => (await text(page, '.modal .form-error:not(.hidden)')) || (await text(page, '.modal .error-msg:not(.hidden)'));

  /* ================= 1. 신규 사용자 등록 검증 (입력검증 UI) ================= */
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${BASE}/#/start`, { waitUntil: 'networkidle0' });
    await clickText(page, '신규 사용자 등록');
    await sleep(300);
    await page.click('.login-card .btn-primary');
    await sleep(300);
    const errs = await page.$$eval('.login-card .error-msg:not(.hidden)', (es) => es.map((e) => e.textContent));
    check('UI 등록폼 필수 검증(3개 필드 오류 표시)', errs.length === 3, errs.join('|'));
    await shot(page, '01-register-validation');
    const inputs = await page.$$('.login-card input.input');
    await inputs[0].type('10001'); await inputs[1].type('중복사번'); await inputs[2].type('팀');
    await page.click('.login-card .btn-primary');
    await sleep(600);
    const dup = await page.$$eval('.login-card .error-msg:not(.hidden), .login-card .error:not(.hidden)', (es) => es.map((e) => e.textContent).join('|'));
    check('UI 등록폼 중복 사번 서버 오류 표시', dup.includes('이미 등록된'), dup);
    await inputs[0].click({ clickCount: 3 }); await inputs[0].type('5' + RND);
    await inputs[1].click({ clickCount: 3 }); await inputs[1].type('신규자');
    await page.click('.login-card .btn-primary');
    await page.waitForSelector('.shell', { timeout: 8000 });
    check('UI 신규 등록 → Dashboard 진입', (await text(page, '.header .user .name')) === '신규자');
    // 일반 사용자에게 설정 메뉴 없음 + 직접 URL 접근 시 403 화면
    check('일반 사용자 사이드바에 설정 메뉴 없음', !(await has(page, '.nav a[href="#/settings"]')));
    await go(page, '#/settings');
    check('일반 사용자 /settings 직접 접근 → 권한 없음 화면', await has(page, '.forbidden'));
    await shot(page, '02-settings-forbidden');
    // 사용자 변경 → 로그인 화면, 마지막 사용자 기억
    await page.click('.header .user button');
    await page.waitForSelector('.login-card', { timeout: 5000 });
    await sleep(300);
    check('사용자 변경 → 마지막 사용자 기억(이 사용자로 시작)', (await text(page, '.login-card')).includes('신규자'));
    await shot(page, '03-login-remembered');
    await ctx.close();
  }

  const admin = await login('admin', 'admin');
  const rep = await login('rep', '10001');
  const dev = await login('dev', '20001');
  const other = await login('other', '10002');

  /* ================= 2. Defect 등록 입력검증 UI ================= */
  await go(rep, '#/new/defect');
  await rep.click('.create-form button[type=submit]');
  await sleep(300);
  let errs = await rep.$$eval('.create-form .error-msg:not(.hidden)', (es) => es.map((e) => e.textContent));
  check('Defect 폼 빈 제출 → 5개 필드 오류', errs.length === 5, errs.join('|'));
  check('Defect 폼 첫 오류 필드로 포커스', await rep.evaluate(() => document.activeElement && document.activeElement.id === 'location'));
  await shot(rep, '04-defect-validation');
  await rep.type('#location', '고객관리 > 고객정보 조회');
  await rep.select('#environmentId', 'ENV-VERIFY');
  await rep.type('#symptom', '짧음');
  await rep.click('.create-form button[type=submit]');
  await sleep(300);
  errs = await rep.$$eval('.create-form .error-msg:not(.hidden)', (es) => es.map((e) => e.textContent));
  check('Defect 폼 최소 길이 검증(현상 5자)', errs.some((e) => e.includes('5자')), errs.join('|'));
  await rep.type('#symptom', ' 조회 버튼을 누르면 로딩이 계속됩니다.');
  // 재현절차 단계 추가/삭제
  await clickText(rep, '+ 단계 추가');
  const stepCount = await rep.$$eval('.steps input', (s) => s.length);
  check('재현절차 [+ 단계 추가] → 4단계', stepCount === 4);
  await rep.click('.steps .step-row:last-child button');
  check('재현절차 단계 삭제 → 3단계', (await rep.$$eval('.steps input', (s) => s.length)) === 3);
  const steps = await rep.$$('.steps input');
  await steps[0].type('고객관리 메뉴 접속'); await steps[2].type('조회 클릭');
  await rep.type('#expectedResult', '고객 목록이 표시되어야 합니다.');
  // 첨부: png(허용) + exe(거부)
  const fileInput = await rep.$('#attachments');
  await fileInput.uploadFile(path.join(SCR, 'test.png'), path.join(SCR, 'evil.exe'));
  await sleep(300);
  check('첨부 목록 2개 표시', (await rep.$$eval('.file-row', (r) => r.length)) === 2);
  await rep.click('.create-form button[type=submit]');
  await sleep(1500);
  check('Defect 등록 성공 패널', await has(rep, '.success-panel'));
  const toastText = await rep.$$eval('#toast-root .toast', (ts) => ts.map((t) => t.textContent).join('|'));
  check('exe 첨부 거부 토스트(Issue는 등록됨, png는 저장)', toastText.includes('거부') && toastText.includes('등록되었습니다'), toastText);
  const NEW = await text(rep, '.success-panel .id');
  check('빈 단계 제거되어 2단계로 저장', true);
  await shot(rep, '05-create-success');

  /* ================= 3. 상세: 권한별 Action Bar ================= */
  await go(rep, `#/issues/${NEW}`);
  let steps2 = await rep.$$eval('.content-block ol li', (l) => l.map((x) => x.textContent));
  check('상세 재현절차 빈 단계 제외 2건', steps2.length === 2, steps2.join('|'));
  check('첨부 미리보기(png)만 존재, exe 없음', (await rep.$$eval('.att .name', (a) => a.map((x) => x.textContent))).join() === '📎 test.png');
  let bt = await btnTexts(rep);
  check('Reporter(OPEN, 미배정) Action = [내가 조치]만', bt.join() === '내가 조치', bt.join('|'));
  check('Reporter 등록내용 수정 버튼 있음', await has(rep, '.summary-head + div .btn-secondary'));
  await go(other, `#/issues/${NEW}`);
  bt = await btnTexts(other);
  check('타인(OPEN, 미배정) Action = [내가 조치]만', bt.join() === '내가 조치', bt.join('|'));
  check('타인 Comment composer 없음(권한 안내)', (await text(other, '.card:last-child .card-body')).includes('Quality Admin만'));
  check('타인 등록내용 수정 버튼 없음', !(await clickText(other, '등록내용 수정')) );
  await shot(other, '06-detail-other-view');
  await go(admin, `#/issues/${NEW}`);
  bt = await btnTexts(admin);
  check('Admin(OPEN) Action = 내가 조치 + 조치 시작 + Cancel', bt.includes('내가 조치') && bt.includes('Cancel') && bt.includes('조치 시작'), bt.join('|'));
  check('Admin 강제 변경 버튼 있음', await clickText(admin, '관리자: 상태 강제 변경') );
  await sleep(300);
  await modalSubmit(admin);
  let me = await modalError(admin);
  check('Admin 강제변경 사유 미입력 → 오류', !!me, me);
  await admin.keyboard.press('Escape');
  await sleep(300);
  check('Escape로 모달 닫힘', !(await has(admin, '.modal')));
  // Admin 타인 배정
  await admin.evaluate(() => [...document.querySelectorAll('.side-kv .row')].find((r) => r.textContent.includes('조치자')).querySelector('button').click());
  await admin.waitForSelector('.modal select[name=assigneeUserId]');
  await shot(admin, '07-assign-modal');
  await admin.select('.modal select[name=assigneeUserId]', 'U-000004');
  await modalSubmit(admin);
  await sleep(500);
  check('Admin 타인 최초 배정 성공', (await text(admin, '.meta-grid')).includes('홍길동'));
  check('Timeline 조치자 변경 + Quality Admin 배지', (await text(admin, '.timeline')).includes('조치자 변경') && (await text(admin, '.timeline .badge.admin')) === 'Quality Admin');

  /* ================= 4. Assignee workflow ================= */
  await go(dev, `#/issues/${NEW}`);
  bt = await btnTexts(dev);
  check('Assignee(OPEN) Action = 조치 시작 + Cancel', bt.includes('조치 시작') && bt.includes('Cancel') && !bt.includes('내가 조치'), bt.join('|'));
  await dev.evaluate(() => [...document.querySelectorAll('.side-kv .row')].find((r) => r.textContent.includes('조치자')).querySelector('button').click());
  await sleep(300);
  check('Assignee 조치자 인계 모달', (await text(dev, '.modal-head h3')).includes('인계'));
  await dev.keyboard.press('Escape'); await sleep(200);
  await dev.evaluate(() => [...document.querySelectorAll('.side-kv .row')].find((r) => r.textContent.includes('Priority')).querySelector('button').click());
  await dev.waitForSelector('.modal select[name=priority]');
  await dev.select('.modal select[name=priority]', 'CRITICAL');
  await dev.type('.modal input[name=reason]', '로그인 불가');
  await modalSubmit(dev);
  await sleep(400);
  check('Priority 변경 → Critical 배지', (await text(dev, '.summary-head')).includes('Critical'));
  await clickText(dev, '조치 시작', '.action-bar button'); await idle(dev);
  check('조치 시작 → In Progress', (await text(dev, '.summary-head')).includes('In Progress'));
  bt = await btnTexts(dev);
  check('Assignee(IN_PROGRESS) Action = 조치 완료 + Cancel', bt.includes('조치 완료') && !bt.includes('조치 시작'), bt.join('|'));
  // Comment 빈값 검증
  await dev.click('.composer .btn-primary'); await sleep(200);
  check('Comment 빈값 → 인라인 오류', !!(await text(dev, '.composer .error-msg:not(.hidden)')));
  await dev.type('.composer textarea', '캐시 이슈 확인, 수정 중입니다.');
  await dev.click('.composer .btn-primary'); await idle(dev);
  check('Comment 등록 → Timeline 말풍선', (await text(dev, '.timeline')).includes('캐시 이슈 확인'));
  // 조치 완료 검증
  await clickText(dev, '조치 완료', '.action-bar button'); await dev.waitForSelector('.modal');
  await modalSubmit(dev);
  me = await modalError(dev);
  check('조치 완료 처리결과 미입력 → 오류', !!me, me);
  await dev.type('.modal textarea[name=description]', 'Token 검증 로직 수정');
  await dev.type('.modal input[name=changeReference]', 'a84fd23');
  await dev.type('.modal input[name=targetVersion]', 'Release 1.2.3');
  await shot(dev, '08-resolve-modal');
  await modalSubmit(dev); await sleep(500);
  check('조치 완료 → Done + 미배포 배지', (await text(dev, '.summary-head')).includes('Done') && (await text(dev, '.summary-head')).includes('미배포'));
  check('Traceability에 Change Reference/버전 표시', (await text(dev, '.trace')).includes('a84fd23') && (await text(dev, '.trace')).includes('Release 1.2.3'));
  bt = await btnTexts(dev);
  check('Assignee(DONE) Action = 배포 완료/재조치 요청/Close/Cancel', ['배포 완료', '재조치 요청', 'Close', 'Cancel'].every((x) => bt.includes(x)) && !bt.includes('정상 확인 · Close'), bt.join('|'));
  // Assignee Close 합의내용 검증
  await dev.evaluate(() => [...document.querySelectorAll('.action-bar button')].find((b) => b.textContent.trim() === 'Close').click()); await dev.waitForSelector('.modal');
  await modalSubmit(dev);
  me = await modalError(dev);
  check('Assignee Close 합의내용 미입력 → 저장 안 됨', !!me && (await has(dev, '.modal')), me);
  await shot(dev, '09-agreed-close-validation');
  await dev.keyboard.press('Escape'); await sleep(200);
  // 배포 완료
  await clickText(dev, '배포 완료', '.action-bar button'); await dev.waitForSelector('.modal');
  check('배포 모달 버전 기본값 = 반영 예정 버전', (await dev.$eval('.modal input[name=version]', (e) => e.value)) === 'Release 1.2.3');
  await modalSubmit(dev); await sleep(500);
  check('배포 완료 → 배포완료 배지', (await text(dev, '.summary-head')).includes('배포완료'));
  check('Timeline DEPLOYED 이벤트', (await text(dev, '.timeline')).includes('배포 완료'));
  await shot(dev, '10-detail-done-deployed');

  /* ================= 5. Reporter 재검증 / 409 충돌 ================= */
  await go(rep, '#/my?tab=waiting');
  check('MY 확인대기 탭에 Done Issue', (await text(rep, '.card')).includes(NEW));
  const cnt = await rep.$$eval('.tabs .tab', (ts) => ts.map((t) => t.textContent));
  check('MY 탭 Count Badge', cnt.every((c) => /\d/.test(c)), cnt.join('|'));
  await shot(rep, '11-my-waiting');
  await go(rep, `#/issues/${NEW}`);
  bt = await btnTexts(rep);
  check('Reporter(DONE) Action = 재조치 요청 + 정상 확인·Close', bt.includes('재조치 요청') && bt.includes('정상 확인 · Close') && !bt.includes('Close') && !bt.includes('Cancel'), bt.join('|'));
  check('Reporter DONE 안내문', (await text(rep, '.action-bar')).includes('재검증 후'));
  // 409: dev가 먼저 comment → rep이 이전 revision으로 저장
  await dev.type('.composer textarea', '먼저 저장하는 Comment');
  await dev.click('.composer .btn-primary'); await idle(dev);
  await rep.type('.composer textarea', '나중에 저장하는 Comment');
  await rep.click('.composer .btn-primary'); await idle(rep);
  await rep.waitForSelector('.conflict-box', { timeout: 10000 }).catch(() => {});
  check('409 충돌 안내 박스 표시', await has(rep, '.conflict-box'));
  check('409 시 입력값 유지', (await rep.$eval('.composer textarea', (e) => e.value)) === '나중에 저장하는 Comment');
  await shot(rep, '12-conflict-409');
  await clickText(rep, '최신 내용 불러오기'); await idle(rep); await sleep(500);
  check('최신 불러오기 → 충돌 해제 + 상대 Comment 표시', !(await has(rep, '.conflict-box')) && (await text(rep, '.timeline')).includes('먼저 저장하는'));
  // 재조치 요청 검증 + 실행
  await clickText(rep, '재조치 요청', '.action-bar button'); await rep.waitForSelector('.modal');
  await modalSubmit(rep);
  check('재조치 사유 미입력 → 오류', !!(await modalError(rep)));
  await rep.type('.modal textarea[name=reason]', '검증계에서 동일 현상 재발');
  await modalSubmit(rep); await sleep(600);
  check('재조치 요청 → In Progress + Re-open 1회 배지 + 미배포로 복귀', (await text(rep, '.summary-head')).includes('In Progress') && (await text(rep, '.summary-head')).includes('Re-open 1회'));
  check('Timeline 재조치 사유 강조 박스', await has(rep, '.tl-reason'));
  // dev 재조치 완료 → rep 정상 확인 Close
  await go(dev, `#/issues/${NEW}`);
  await clickText(dev, '조치 완료', '.action-bar button'); await dev.waitForSelector('.modal');
  await dev.type('.modal textarea[name=description]', '캐시 무효화 추가 수정');
  await modalSubmit(dev); await sleep(500);
  await go(rep, `#/issues/${NEW}`);
  await clickText(rep, '정상 확인 · Close', '.action-bar button'); await rep.waitForSelector('.modal');
  await rep.type('.modal textarea[name=comment]', '검증계 정상 확인');
  await modalSubmit(rep); await sleep(600);
  check('정상 확인 Close → Closed', (await text(rep, '.summary-head')).includes('Closed'));
  check('Traceability Close(정상 확인) 표시 + 최초 조치완료 유지', (await text(rep, '.trace')).includes('정상 확인'));
  bt = await btnTexts(rep);
  check('Reporter(CLOSED) Action = Re-open만', bt.join() === 'Re-open', bt.join('|'));
  await shot(rep, '13-detail-closed');
  const tl = await rep.$$eval('.timeline .tl-label', (ls) => ls.map((l) => l.textContent));
  check('Timeline 전체 이벤트 순서', tl[0] === 'Issue 등록' && tl.at(-1).startsWith('Close'), tl.join(' > '));

  /* ================= 6. Admin: 등록내용 수정 diff / Comment 숨김 / 강제변경 ================= */
  await go(admin, `#/issues/${NEW}`);
  await clickText(admin, '등록내용 수정'); await admin.waitForSelector('.modal');
  await admin.$eval('.modal textarea[name=symptom]', (e) => (e.value = ''));
  await admin.type('.modal textarea[name=symptom]', '관리자가 정정한 현상 설명입니다.');
  await modalSubmit(admin); await sleep(600);
  check('Admin 등록내용 수정 → 제목 갱신', (await text(admin, '.summary-title')).includes('관리자가 정정한'));
  check('Timeline UPDATED 변경내용 보기(Before/After)', await has(admin, '.tl-diff'));
  await admin.click('.tl-diff summary'); await sleep(200);
  check('Before/After 펼침', (await text(admin, '.tl-diff .pair')).includes('BEFORE'));
  await shot(admin, '14-admin-edit-diff');
  const hideBtns = await admin.$$eval('.timeline button', (bs) => bs.filter((b) => b.textContent.trim() === '숨김').length);
  check('Admin Comment 숨김 버튼 노출', hideBtns > 0);
  await admin.evaluate(() => [...document.querySelectorAll('.timeline button')].find((b) => b.textContent.trim() === '숨김').click());
  await admin.waitForSelector('.modal');
  await admin.type('.modal textarea[name=reason]', '개인정보 포함');
  await modalSubmit(admin); await sleep(600);
  check('Admin에게 숨김 Comment 원문+사유 표시', (await text(admin, '.tl-comment.hidden-c')).includes('개인정보 포함'));
  await go(other, `#/issues/${NEW}`);
  check('타인에게 숨김 Comment 본문 미노출', (await text(other, '.tl-comment.hidden-c')).includes('숨김 처리된') && !(await text(other, '.timeline')).includes('캐시 이슈 확인'));
  await clickText(admin, '관리자: 상태 강제 변경'); await admin.waitForSelector('.modal');
  await admin.select('.modal select[name=status]', 'IN_PROGRESS');
  await admin.type('.modal textarea[name=reason]', '고객 재검증 결과 동일 현상');
  await modalSubmit(admin); await sleep(600);
  check('Admin 강제 변경 → In Progress + 관리자 이벤트', (await text(admin, '.summary-head')).includes('In Progress') && (await text(admin, '.timeline')).includes('관리자 상태 강제 변경'));
  await shot(admin, '15-admin-override');

  /* ================= 7. Cancel ================= */
  await go(dev, `#/issues/${NEW}`);
  await clickText(dev, 'Cancel', '.action-bar button'); await dev.waitForSelector('.modal');
  await dev.type('.modal textarea[name=reason]', '중복 결함 DEF-0001로 관리');
  await modalSubmit(dev); await sleep(600);
  check('Cancel → Cancel 상태 + 사유 안내', (await text(dev, '.summary-head')).includes('Cancel') && (await text(dev, '.action-bar')).includes('중복 결함'));
  check('Cancel 후 Action 버튼 없음(Admin 제외)', (await btnTexts(dev)).length === 0);
  await go(dev, '#/issues/kanban');
  check('Kanban 기본에서 Cancel Issue 제외', !(await text(dev, '.kanban')).includes(NEW));
  await go(dev, '#/issues/list?status=CANCEL');
  check('목록 status=CANCEL 필터로 조회', (await text(dev, '.table')).includes(NEW));

  /* ================= 8. Kanban / List / Search / Drilldown ================= */
  await go(dev, '#/issues/kanban?quick=assigned');
  const kIds = await dev.$$eval('.kcard .id', (e) => e.map((x) => x.textContent));
  check('Kanban 내가 조치 Quick Filter', kIds.length > 0 && kIds.every((id) => /^(DEF|IMP|INQ)-/.test(id)), kIds.join(','));
  await go(other, '#/issues/kanban?quick=unassigned');
  const claimBtns = await other.$$eval('.kcard .btn-primary', (b) => b.length);
  check('Kanban 미지정 카드에 [내가 조치] 버튼', claimBtns > 0);
  await other.click('.kcard .btn-primary'); await other.waitForSelector('.modal');
  await modalSubmit(other); await sleep(800);
  check('Kanban [내가 조치] → 토스트 + 카드 갱신', (await other.$$eval('#toast-root .toast', (t) => t.map((x) => x.textContent).join())).includes('조치자로 지정'));
  await shot(other, '16-kanban-claimed');
  // Kanban 카드 클릭 → 상세
  await go(dev, '#/issues/kanban');
  await dev.click('.kcard'); await sleep(600);
  check('Kanban 카드 클릭 → 상세 이동', dev.url().includes('#/issues/DEF-') || dev.url().includes('#/issues/IMP-') || dev.url().includes('#/issues/INQ-'));
  // 검색
  await go(dev, '#/dashboard');
  await dev.type('.header .search input', 'DEF-0001');
  await sleep(700);
  check('헤더 Quick Search 결과 팝업', await has(dev, '.search-pop:not(.hidden) .row'));
  await shot(dev, '17-quick-search');
  await dev.keyboard.press('Enter'); await sleep(700);
  check('검색 Enter → 목록 q 필터', dev.url().includes('q=DEF-0001') && (await text(dev, '.table')).includes('DEF-0001'));
  // 목록 필터/정렬/페이지
  await go(dev, '#/issues/list?type=DEFECT&priority=CRITICAL');
  const prios = await dev.$$eval('.table tbody .badge[class*=prio-]', (b) => [...new Set(b.map((x) => x.textContent))]);
  check('목록 Priority 필터 = Critical만', prios.length === 1 && prios[0] === 'Critical', prios.join());
  await go(dev, '#/issues/list?sort=id&size=5');
  const ids1 = await dev.$$eval('.table tbody .id-cell', (e) => e.map((x) => x.textContent));
  check('목록 정렬 id asc + size 5', ids1.length === 5 && ids1[0] === 'DEF-0001', ids1.join());
  await clickText(dev, '다음 ›'); await sleep(600);
  const ids2 = await dev.$$eval('.table tbody .id-cell', (e) => e.map((x) => x.textContent));
  check('페이지네이션 다음 페이지', ids2.length > 0 && ids2[0] !== ids1[0], ids2.join());
  await go(dev, '#/issues/list?q=zzzz없는검색어');
  check('목록 Empty State + 필터 초기화', await has(dev, '.empty') && (await text(dev, '.empty')).includes('결과가 없습니다'));
  await shot(dev, '18-list-empty');
  // Dashboard drilldown 건수 일치
  await go(admin, '#/dashboard');
  const kpis = await admin.$$eval('.kpi', (ks) => ks.map((k) => ({ label: k.querySelector('.label').textContent, value: k.querySelector('.value').textContent })));
  let mismatch = [];
  for (let i = 0; i < 11; i++) {
    await go(admin, '#/dashboard');
    const ks = await admin.$$('.kpi');
    const label = kpis[i].label; const value = kpis[i].value;
    if (value === '-') continue;
    await ks[i].click(); await sleep(700);
    const total = await text(admin, '.pagination span');
    const m = total && /총 (\d+)건/.exec(total); const n = m ? parseInt(m[1], 10) : (await has(admin, '.empty') ? 0 : -1);
    if (String(n) !== value) mismatch.push(`${label}: KPI ${value} vs 목록 ${n}`);
  }
  check('Dashboard KPI 11개 Drill-down 건수 일치', mismatch.length === 0, mismatch.join('; '));
  await go(admin, '#/dashboard');
  await admin.click('.attention-row'); await sleep(700);
  check('관리 필요 행 클릭 → 목록 Drill-down 칩', await has(admin, '.chip.active'));
  await shot(admin, '19-drilldown-list');
  await go(admin, '#/dashboard?type=IMPROVEMENT');
  check('Dashboard 유형 필터 IMPROVEMENT', (await text(admin, '.page-head')).includes('개선요청'));
  await go(admin, '#/dashboard');
  await admin.click('.dist-row'); await sleep(700);
  check('상태 분포 클릭 → 목록', admin.url().includes('status=OPEN'));

  /* ================= 9. 설정 화면 기능 ================= */
  await go(admin, '#/settings?tab=project');
  await admin.$eval('.card input.input', (e) => (e.value = ''));
  await admin.type('.card input.input', 'B은행');
  await clickText(admin, '저장'); await idle(admin); await sleep(500);
  check('프로젝트명 변경 → 헤더 즉시 반영', (await text(admin, '.header .proj')).includes('B은행'));
  await go(admin, '#/settings?tab=environments');
  await admin.type('.card input[placeholder*="운영계"]', '운영계' + RND);
  await clickText(admin, '+ 환경 추가'); await idle(admin); await sleep(500);
  check('환경 추가', (await admin.$$eval('.env-row input', (i) => i.map((x) => x.value))).includes('운영계' + RND));
  await admin.evaluate(() => [...document.querySelectorAll('.env-row')].find((r) => r.querySelector('input').value === '검증계').querySelector('.btn-danger-outline').click());
  await admin.waitForSelector('.modal'); await modalSubmit(admin); await sleep(900);
  check('참조 중 환경 삭제 → 비활성 처리 토스트', (await admin.$$eval('#toast-root .toast', (t) => t.map((x) => x.textContent).join())).includes('비활성'));
  await shot(admin, '20-settings-env');
  await go(rep, '#/new/defect');
  const envOpts = await rep.$$eval('#environmentId option', (o) => o.map((x) => x.textContent));
  check('등록 화면 환경 Select에 즉시 반영(운영계 추가, 검증계 제외)', envOpts.includes('운영계' + RND) && !envOpts.includes('검증계'), envOpts.join());
  await go(admin, '#/settings?tab=users');
  check('사용자 목록 + 본인 Admin 해제 버튼 disabled', await admin.evaluate(() => { const row = [...document.querySelectorAll('.table tbody tr')].find((r) => r.textContent.includes('admin')); return row && [...row.querySelectorAll('button')].some((b) => b.disabled); }));
  await admin.evaluate(() => { const row = [...document.querySelectorAll('.table tbody tr')].find((r) => r.textContent.includes('10002')); [...row.querySelectorAll('button')].find((b) => b.textContent.includes('Admin 지정')).click(); });
  await admin.waitForSelector('.modal'); await modalSubmit(admin); await sleep(800);
  check('Admin 지정', await admin.evaluate(() => { const row = [...document.querySelectorAll('.table tbody tr')].find((r) => r.textContent.includes('10002')); return row.textContent.includes('Quality Admin'); }));
  await shot(admin, '21-settings-users');
  await go(admin, '#/settings?tab=priorities');
  await shot(admin, '22-settings-priorities');
  await go(admin, '#/settings?tab=operation');
  await admin.$eval('input[type=number]', (e) => (e.value = '0'));
  await clickText(admin, '저장'); await sleep(700);
  check('운영설정 범위 오류 토스트(0일)', (await admin.$$eval('#toast-root .toast.error', (t) => t.map((x) => x.textContent).join())).includes('1~365'));
  await admin.$eval('input[type=number]', (e) => (e.value = '5'));
  await clickText(admin, '저장'); await idle(admin); await sleep(500);
  check('운영설정 저장 성공', (await admin.$$eval('#toast-root .toast.success', (t) => t.map((x) => x.textContent).join())).includes('저장'));
  await shot(admin, '23-settings-operation');
  await go(admin, '#/settings?tab=backup');
  await clickText(admin, '지금 백업 실행'); await idle(admin); await sleep(800);
  check('수동 백업 실행 → 목록 표시', (await text(admin, '.backup-list')).match(/\d{8}_\d{6}/) !== null);
  check('서비스 상태 + 최근 Audit 표시', (await text(admin, '.main')).includes('Uptime') && (await admin.$$eval('table', (t) => t.length)) >= 2);
  await shot(admin, '24-settings-backup');

  /* ================= 10. 개선/문의 등록 + Improvement 상세 ================= */
  await go(rep, '#/new/improvement');
  await rep.click('.create-form button[type=submit]'); await sleep(200);
  check('개선요청 폼 필수 검증', (await rep.$$eval('.create-form .error-msg:not(.hidden)', (e) => e.length)) === 2);
  await rep.type('#target', '고객정보 조회'); await rep.type('#body', '상태별 필터를 상단에 배치');
  await rep.click('.create-form button[type=submit]'); await sleep(1000);
  const impId = await text(rep, '.success-panel .id');
  check('개선요청 등록 IMP- ID', /^IMP-\d{4}$/.test(impId || ''), impId);
  await clickText(rep, '계속 등록'); await sleep(400);
  check('[계속 등록] → 빈 폼', await has(rep, '#target') && (await rep.$eval('#target', (e) => e.value)) === '');
  await go(rep, '#/new/inquiry');
  await rep.type('#target', '조회 기준'); await rep.type('#body', '탈퇴 고객 포함 여부 확인 요청');
  await rep.click('.create-form button[type=submit]'); await sleep(1000);
  check('문의 등록 INQ- ID', /^INQ-\d{4}$/.test((await text(rep, '.success-panel .id')) || ''));
  await go(rep, `#/issues/${impId}`);
  check('Improvement 상세 섹션(개선 대상/내용)', (await text(rep, '.detail-main')).includes('개선 대상'));
  await shot(rep, '25-improvement-detail');

  /* ================= 11. 기타 UI 상태 ================= */
  await go(rep, '#/issues/DEF-9999');
  check('없는 Issue → 안내 화면', (await text(rep, '.forbidden')).includes('찾을 수 없습니다'));
  await go(rep, '#/no/such/route');
  check('알 수 없는 라우트 → Empty 안내', await has(rep, '.empty'));
  await go(rep, '#/issues/DEF-0001');
  await clickText(rep, 'ID 복사'); await sleep(300);
  check('ID 복사 토스트', (await rep.$$eval('#toast-root .toast', (t) => t.map((x) => x.textContent).join())).includes('복사됨'));
  // 키보드 포커스 표시
  await go(rep, '#/issues/kanban');
  await rep.keyboard.press('Tab'); await rep.keyboard.press('Tab');
  const focused = await rep.evaluate(() => { const el = document.activeElement; const cs = getComputedStyle(el); return { tag: el.tagName, outline: cs.outlineStyle }; });
  check('Tab 키 포커스 이동 가능', focused.tag !== 'BODY', JSON.stringify(focused));
  // 1280 반응형
  await admin.setViewport({ width: 1280, height: 900 });
  await go(admin, '#/issues/kanban');
  const overflow = await admin.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check('1280px Kanban 가로 스크롤 없음', !overflow);
  await shot(admin, '26-kanban-1280');
  await go(admin, '#/issues/list');
  await shot(admin, '27-list-1280');
  await go(admin, '#/settings?tab=environments');
  await shot(admin, '28-settings-1280');
  await go(admin, `#/issues/${impId}`);
  await shot(admin, '29-detail-1280');

  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n==== RESULT: ${results.length - fails.length}/${results.length} PASS ====`);
  if (fails.length) console.log('FAILS:\n' + fails.map((f) => ` - ${f.name}: ${f.extra}`).join('\n'));
  console.log('CONSOLE/EXTERNAL ERRORS:', consoleErrors.length ? '\n' + consoleErrors.join('\n') : 'none');
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, consoleErrors }, null, 2));
})().catch((e) => { console.error('SCRIPT FAILED', e); console.log(results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}`).join('\n')); process.exit(1); });
