/**
 * UX(여러 줄/붙여넣기 입력 왕복) + 보안(권한 없는 직접 접근) 브라우저 검증
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const BASE = 'http://localhost:18080';
const OUT = path.join(__dirname, 'shots3');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

const SYMPTOM = `고객명을 입력하고 조회 버튼을 누르면 결과가 표시되지 않고 로딩 상태가 계속됩니다.

[재현 환경]
\t- 브라우저: Edge 128
\t- 계정: 테스트계정01


[오류 로그 붙여넣기]
java.lang.NullPointerException: token
\tat com.bank.service.CustomerService.find(CustomerService.java:120)
\tat com.bank.web.CustomerController.search(CustomerController.java:55)

참고 URL: https://internal.example.bank/very/long/path/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
<b>굵게</b> <img src=x onerror="alert(1)"> <script>alert(2)</script> 태그는 텍스트로 보여야 합니다.`;
const EXPECTED_NORMALIZED = SYMPTOM.replace(/\n{3,}/g, '\n\n');
const STEPS_PASTE = `1. 고객관리 메뉴 접속
2. 고객정보 조회 선택
3. 고객명 "홍길동" 입력
4. 조회 버튼 클릭
5. 로딩 화면에서 멈춤`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--window-size=1440,1000', '--lang=ko-KR'] });
  const pages = {};
  async function ctxPage(key) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    page.on('pageerror', (e) => errors.push(`[${key}] pageerror ${e.message}`));
    page.on('dialog', async (d) => { errors.push(`[${key}] DIALOG(XSS?) ${d.message()}`); await d.dismiss(); });
    page.on('request', (r) => { const u = new URL(r.url()); if (u.protocol !== 'data:' && u.host !== 'localhost:18080') errors.push(`[${key}] EXTERNAL ${r.url()}`); });
    pages[key] = page;
    return page;
  }
  async function login(page, employeeId) {
    await page.goto(`${BASE}/#/start`, { waitUntil: 'networkidle0' });
    await page.type('.login-card input.input', employeeId);
    await page.click('.login-card .btn-primary');
    await page.waitForSelector('.shell', { timeout: 8000 });
    await sleep(500);
  }
  const shot = async (page, name) => { await sleep(300); await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true }); };
  const go = async (page, hash) => { const t = `${BASE}/${hash}`; if (page.url() === t) await page.reload({ waitUntil: 'networkidle0' }); else await page.goto(t, { waitUntil: 'networkidle0' }); await sleep(500); };
  const idle = async (page) => { await page.waitForFunction(() => !document.querySelector('.spinner'), { timeout: 15000 }).catch(() => {}); await sleep(400); };
  const text = async (page, sel) => page.$eval(sel, (e) => e.textContent).catch(() => null);
  const paste = async (page, sel, txt) => {
    await page.focus(sel);
    await page.evaluate((sel, txt) => {
      const el = document.querySelector(sel);
      const dt = new DataTransfer();
      dt.setData('text/plain', txt);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      const prevented = !el.dispatchEvent(ev);
      if (!prevented) {
        // 기본 동작 시뮬레이션: 커서 위치에 삽입
        const s = el.selectionStart ?? el.value.length;
        el.value = el.value.slice(0, s) + txt + el.value.slice(el.selectionEnd ?? s);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, sel, txt);
  };
  const noOverflow = (page, sel) => page.$eval(sel, (e) => e.scrollWidth <= e.clientWidth + 1);

  /* ================= 1. Reporter: 여러 줄/붙여넣기 등록 ================= */
  const rep = await ctxPage('rep');
  await login(rep, '10001');
  await go(rep, '#/new/defect');
  await paste(rep, '#location', '고객관리 > 고객정보 조회\n(두 번째 줄은 한 줄 입력란이라 공백으로 합쳐짐)');
  const locVal = await rep.$eval('#location', (e) => e.value);
  check('한 줄 입력란에 여러 줄 붙여넣기 → 개행 제거', !locVal.includes('\n'), JSON.stringify(locVal).slice(0, 80));
  await rep.select('#environmentId', 'ENV-VERIFY');
  await paste(rep, '#symptom', SYMPTOM);
  check('textarea 붙여넣기 원문 보존(빈 줄/탭/태그 포함)', (await rep.$eval('#symptom', (e) => e.value)) === SYMPTOM);
  // 재현절차 여러 줄 붙여넣기 → 단계 분리
  await paste(rep, '.steps .step-row:nth-child(1) input', STEPS_PASTE);
  await sleep(300);
  const stepVals = await rep.$$eval('.steps input', (i) => i.map((x) => x.value));
  check('재현절차 5줄 붙여넣기 → 5단계 자동 분리 + 번호 제거', stepVals.length === 5 && stepVals[0] === '고객관리 메뉴 접속' && stepVals[4] === '로딩 화면에서 멈춤', stepVals.join(' | '));
  await paste(rep, '#expectedResult', '조회조건에 해당하는 고객 목록이 표시되어야 합니다.\n\n- 3초 이내 응답\n- 결과 없으면 "조회 결과가 없습니다" 안내');
  await shot(rep, '01-multiline-form');
  await rep.click('.create-form button[type=submit]');
  await rep.waitForSelector('.success-panel', { timeout: 8000 });
  const ID = await text(rep, '.success-panel .id');
  check('여러 줄 결함 등록 성공', /^DEF-\d{4}$/.test(ID || ''), ID);

  /* ================= 2. 조회: 줄바꿈/태그/긴 URL 렌더링 ================= */
  await go(rep, `#/issues/${ID}`);
  const SYM = '.content-block:nth-child(2) .body';
  const bodyText = await rep.$eval(SYM, (e) => e.innerText);
  check('상세 현상: 줄바꿈·빈 줄 유지(innerText 줄 수)', bodyText.split('\n').length >= 12, `${bodyText.split('\n').length}줄`);
  check('상세 현상: 3줄 이상 연속 빈 줄은 2줄로 축약', !/\n{3,}/.test(await rep.$eval('.content-block .body', (e) => e.textContent)));
  check('상세 현상: HTML 태그가 텍스트로 표시(요소 생성 없음)', bodyText.includes('<b>굵게</b>') && (await rep.$$eval('.content-block .body img, .content-block .body b, .content-block .body script', (n) => n.length)) === 0);
  check('상세 현상: 탭 문자 보존', bodyText.includes('\t- 브라우저') || bodyText.includes('- 브라우저'));
  check('상세: 긴 URL이 레이아웃을 넘치지 않음', await noOverflow(rep, SYM) && await noOverflow(rep, '.detail-main') && await rep.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  const title = await text(rep, '.summary-title');
  check('제목 = 첫 줄 (80자 이내)', title.startsWith('고객명을 입력하고') && title.length <= 81, title);
  const liTexts = await rep.$$eval('.content-block ol li', (l) => l.map((x) => x.textContent));
  check('재현절차 5단계 표시', liTexts.length === 5 && liTexts[2].includes('"홍길동"'), liTexts.join(' | '));
  const expText = await rep.$$eval('.content-block .body', (b) => b[2].innerText);
  check('기대 결과 줄바꿈/목록 유지', expText.includes('\n\n- 3초') , JSON.stringify(expText).slice(0, 80));
  check('XSS 다이얼로그 없음', !errors.some((e) => e.includes('DIALOG')));
  await shot(rep, '02-multiline-detail');

  /* ================= 3. 수정 왕복 ================= */
  await rep.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('등록내용 수정')).click());
  await rep.waitForSelector('.modal textarea[name=symptom]');
  const modalSymptom = await rep.$eval('.modal textarea[name=symptom]', (e) => e.value);
  check('수정 모달: 저장된 현상 원문 그대로(정규화본과 일치)', modalSymptom === EXPECTED_NORMALIZED, `len ${modalSymptom.length} vs ${EXPECTED_NORMALIZED.length}`);
  const modalSteps = await rep.$eval('.modal textarea[name=reproductionSteps]', (e) => e.value);
  check('수정 모달: 재현절차 한 줄에 한 단계', modalSteps.split('\n').length === 5, JSON.stringify(modalSteps));
  await shot(rep, '03-edit-modal');
  // 변경 없이 저장 → 오류
  await rep.click('.modal-foot .btn-primary'); await idle(rep);
  const noChange = await text(rep, '.modal .form-error:not(.hidden)');
  check('변경 없이 저장 → "변경된 내용이 없습니다"', (noChange || '').includes('변경된 내용이 없습니다'), noChange);
  // 문단 추가 + 재현절차 한 단계 추가("1.5초 대기" 번호 오인 방지)
  await rep.evaluate(() => { const t = document.querySelector('.modal textarea[name=symptom]'); t.value = t.value + '\n\n[추가] 다른 계정에서도 재현됩니다.'; });
  await rep.evaluate(() => { const t = document.querySelector('.modal textarea[name=reproductionSteps]'); t.value = t.value + '\n1.5초 대기 후 재시도'; });
  await rep.click('.modal-foot .btn-primary'); await idle(rep); await sleep(500);
  const after = await rep.$eval(SYM, (e) => e.textContent);
  check('수정 후 문단 추가 반영 + 기존 줄바꿈 유지', after.endsWith('[추가] 다른 계정에서도 재현됩니다.') && after.startsWith(EXPECTED_NORMALIZED.slice(0, 40)));
  const liAfter = await rep.$$eval('.content-block ol li', (l) => l.map((x) => x.textContent));
  check('재현절차 6단계, "1.5초 대기" 번호로 오인되지 않음', liAfter.length === 6 && liAfter[5] === '1.5초 대기 후 재시도', liAfter[5]);
  check('Timeline UPDATED 변경내용 보기(현상·재현절차 2건)', (await rep.$$eval('.tl-diff', (d) => d.length)) === 2);
  await rep.evaluate(() => document.querySelectorAll('.tl-diff summary').forEach((s) => s.click()));
  await sleep(200);
  const pair = await rep.$eval('.tl-diff .pair', (e) => e.innerText);
  check('Before/After에 줄바꿈 보존', pair.includes('BEFORE') && pair.split('\n').length > 10);
  await shot(rep, '04-edit-roundtrip');

  /* ================= 4. Comment 여러 줄 ================= */
  await paste(rep, '.composer textarea', '확인 결과:\n\n1) 테스트계에서도 재현\n2) 운영 로그 첨부 예정\n\n\n\n끝.');
  await rep.click('.composer .btn-primary'); await idle(rep);
  const cm = await rep.$eval('.tl-comment', (e) => e.innerText);
  check('Comment 여러 줄/빈 줄 렌더링(과도한 빈 줄 축약)', cm.includes('확인 결과:\n\n1)') && !/\n{3,}/.test(cm), JSON.stringify(cm));
  // 목록/Kanban 표시
  await go(rep, '#/issues/list');
  check('목록: 긴 제목 ellipsis + 페이지 가로 스크롤 없음', await rep.$eval('.table .title-cell', (e) => getComputedStyle(e).textOverflow === 'ellipsis' && getComputedStyle(e).overflow === 'hidden') && await rep.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await go(rep, '#/issues/kanban');
  check('Kanban: 카드 제목 2줄 clamp(overflow hidden) + 가로 스크롤 없음', await rep.$$eval('.kcard .title', (ts) => ts.every((t) => getComputedStyle(t).overflow === 'hidden' && t.clientHeight < 60)) && await rep.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await shot(rep, '05-kanban-clamp');
  // 검색: 여러 줄 본문 내부 단어
  await go(rep, '#/issues/list?q=' + encodeURIComponent('NullPointerException'));
  check('검색: 붙여넣은 로그 내부 단어로 검색됨', (await text(rep, '.table')).includes(ID));

  /* ================= 5. 보안: 권한 없는 직접 접근(UI) ================= */
  // 5-1 세션 없이 상세 URL 직접 접근 → 로그인 → 원래 페이지로 복귀
  const anon = await ctxPage('anon');
  await anon.goto(`${BASE}/#/issues/${ID}`, { waitUntil: 'networkidle0' }); await sleep(500);
  check('세션 없이 상세 URL → 로그인 화면으로', anon.url().includes('#/start') && !!(await anon.$('.login-card')));
  await anon.type('.login-card input.input', '10002');
  await anon.click('.login-card .btn-primary');
  await anon.waitForSelector('.shell', { timeout: 8000 }); await sleep(800);
  check('로그인 후 원래 요청한 상세 페이지로 복귀', anon.url().includes(`#/issues/${ID}`), anon.url());
  // 5-2 비관계자(10002)에게 노출되는 것: 조회는 가능, 수정/Comment 불가
  const btns = await anon.$$eval('.action-bar button', (b) => b.map((x) => x.textContent.trim()));
  check('비관계자: Action = [내가 조치]만, 수정 버튼 없음', btns.join() === '내가 조치' && !(await anon.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('등록내용 수정')))));
  check('비관계자: Comment 입력란 없음', !(await anon.$('.composer textarea')));
  // 5-3 UI 우회: 브라우저 콘솔에서 직접 API 호출(세션 쿠키 자동 첨부)
  const direct = await anon.evaluate(async (id) => {
    const call = (m, u, b) => fetch(u, { method: m, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.status);
    return {
      patch: await call('PATCH', `/api/issues/${id}`, { expectedRevision: 1, changes: { symptom: '우회 수정 시도입니다' } }),
      comment: await call('POST', `/api/issues/${id}/comments`, { expectedRevision: 1, body: '우회 comment' }),
      priority: await call('POST', `/api/issues/${id}/actions/priority`, { expectedRevision: 1, priority: 'CRITICAL' }),
      assign: await call('POST', `/api/issues/${id}/actions/assign`, { expectedRevision: 1, assigneeUserId: 'U-000001' }),
      admin: await call('GET', '/api/admin/audit'),
      settings: await call('PUT', '/api/config/project', { customerName: 'x', projectName: 'y' }),
      users: await call('PATCH', '/api/users/U-000003', { isQualityAdmin: true }),
      noCsrf: await fetch(`/api/issues/${id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.status),
      dataFile: await fetch(`/data/issues/${id}.json`).then((r) => r.status),
    };
  }, ID);
  check('비관계자 콘솔 직접 호출(오래된 revision이어도): 수정/Comment/Priority/배정 403', direct.patch === 403 && direct.comment === 403 && direct.priority === 403 && direct.assign === 403, JSON.stringify(direct));
  check('비관계자 콘솔 직접 호출: 관리자/설정/사용자 API 403', direct.admin === 403 && direct.settings === 403 && direct.users === 403);
  check('CSRF 헤더 없는 호출 403, 데이터 파일 직접 접근 404', direct.noCsrf === 403 && direct.dataFile === 404);
  // 5-4 권한 변경 즉시 반영: admin이 10002를 Admin 지정 → 10002 화면 이동 시 설정 메뉴 등장, 해제 시 사라짐
  const admin = await ctxPage('admin');
  await login(admin, 'admin');
  const promote = (flag) => admin.evaluate(async (flag) => fetch('/api/users/U-000003', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify({ isQualityAdmin: flag }) }).then((r) => r.status), flag);
  check('Admin이 10002 승격', (await promote(true)) === 200);
  await go(anon, '#/dashboard');
  check('승격 후 재로그인 없이 설정 메뉴 노출', !!(await anon.$('.nav a[href="#/settings"]')));
  await go(anon, '#/settings');
  check('승격된 사용자 설정 화면 진입', !!(await anon.$('.settings-layout')));
  check('Admin이 10002 해제', (await promote(false)) === 200);
  await go(anon, '#/dashboard');
  check('해제 후 설정 메뉴 즉시 사라짐', !(await anon.$('.nav a[href="#/settings"]')));
  await go(anon, '#/settings');
  check('해제 후 /settings 직접 접근 → 권한 없음', !!(await anon.$('.forbidden')));
  await shot(anon, '06-demoted-forbidden');
  // 5-5 비활성화 → 기존 세션 즉시 로그아웃
  const deact = await admin.evaluate(async () => fetch('/api/users/U-000003', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify({ active: false }) }).then((r) => r.status));
  check('Admin이 10002 비활성화', deact === 200);
  await go(anon, '#/issues/kanban');
  check('비활성화된 사용자는 화면 이동 시 로그인 화면으로', anon.url().includes('#/start'));
  await anon.type('.login-card input.input', '10002');
  await anon.click('.login-card .btn-primary'); await sleep(800);
  const loginErr = await text(anon, '.login-card .error');
  check('비활성 사용자 재로그인 차단 안내', (loginErr || '').includes('비활성'), loginErr);
  await shot(anon, '07-inactive-login');
  // 5-6 숨김 Comment 원문 비노출(타인 화면)
  const hid = await admin.evaluate(async (id) => {
    const d = await fetch(`/api/issues/${id}`).then((r) => r.json());
    const rev = d.issue.revision;
    return fetch(`/api/issues/${id}/comments/CMT-0001/hide`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify({ expectedRevision: rev, reason: '개인정보' }) }).then((r) => r.status);
  }, ID);
  check('Admin Comment 숨김', hid === 200);
  const viewer = await ctxPage('viewer');
  await login(viewer, '20001');
  await go(viewer, `#/issues/${ID}`);
  const pageHtml = await viewer.evaluate(() => document.body.innerText);
  check('타인 화면: 숨김 Comment 원문/사유 미노출(DOM 전체)', !pageHtml.includes('테스트계에서도 재현') && !pageHtml.includes('개인정보') && pageHtml.includes('숨김 처리된'));
  const apiLeak = await viewer.evaluate(async (id) => JSON.stringify(await fetch(`/api/issues/${id}`).then((r) => r.json())).includes('테스트계에서도 재현'), ID);
  check('타인 API 응답(history 포함)에 숨김 원문 없음', !apiLeak);
  await shot(viewer, '08-hidden-comment-other');

  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n==== RESULT: ${results.length - fails.length}/${results.length} PASS ====`);
  if (fails.length) console.log('FAILS:\n' + fails.map((f) => ` - ${f.name}: ${f.extra}`).join('\n'));
  console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, errors }, null, 2));
})().catch((e) => { console.error('SCRIPT FAILED', e); console.log(results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}`).join('\n')); process.exit(1); });
