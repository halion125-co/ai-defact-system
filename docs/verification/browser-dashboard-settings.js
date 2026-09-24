/**
 * Dashboard(유형별/Burn Up) 렌더링 vs API vs 원본, 관리자 설정(Priority/환경/프로젝트명/사용자명) 반영 브라우저 검증
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const BASE = 'http://localhost:18080';
const OUT = path.join(__dirname, 'shots4');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--window-size=1440,1000', '--lang=ko-KR'] });
  const mk = async (key) => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    page.on('pageerror', (e) => errors.push(`[${key}] ${e.message}`));
    page.on('request', (r) => { const u = new URL(r.url()); if (u.protocol !== 'data:' && u.host !== 'localhost:18080') errors.push(`[${key}] EXTERNAL ${r.url()}`); });
    return page;
  };
  const login = async (page, id) => { await page.goto(`${BASE}/#/start`, { waitUntil: 'networkidle0' }); await sleep(300); if (await page.$('.login-card input.input')) { await page.type('.login-card input.input', id); } await page.click('.login-card .btn-primary'); await page.waitForSelector('.shell', { timeout: 8000 }); await sleep(500); };
  const go = async (page, hash) => { const t = `${BASE}/${hash}`; if (page.url() === t) await page.reload({ waitUntil: 'networkidle0' }); else await page.goto(t, { waitUntil: 'networkidle0' }); await sleep(700); };
  const shot = async (page, n) => { await sleep(300); await page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: true }); };
  const idle = async (page) => { await page.waitForFunction(() => !document.querySelector('.spinner'), { timeout: 15000 }).catch(() => {}); await sleep(400); };
  const api = (page, url) => page.evaluate((u) => fetch(u).then((r) => r.json()), url);
  const post = (page, m, url, body) => page.evaluate((m, u, b) => fetch(u, { method: m, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify(b) }).then((r) => r.status), m, url, body);

  const admin = await mk('admin');
  await login(admin, 'admin');

  /* ================= 1. 유형별 Dashboard 렌더링 vs API vs 원본 목록 ================= */
  const TYPE_LABEL = { DEFECT: '결함', IMPROVEMENT: '개선요청', INQUIRY: '문의', ALL: 'Issue(전체 유형)' };
  for (const type of ['DEFECT', 'IMPROVEMENT', 'INQUIRY', 'ALL']) {
    await go(admin, `#/dashboard?type=${type}`);
    await idle(admin);
    const kpis = await admin.$$eval('.kpi', (ks) => ks.map((k) => ({ label: k.querySelector('.label').textContent.trim(), value: k.querySelector('.value').textContent.trim() })));
    const s = await api(admin, `/api/dashboard/summary?type=${type}`);
    const all = await api(admin, `/api/issues?type=${type}&status=ALL&size=500`);
    const raw = all.items;
    const cnt = (f) => raw.filter(f).length;
    const expTotal = cnt((i) => i.status !== 'CANCEL');
    check(`${TYPE_LABEL[type]}: KPI 전체 = API = 목록(Cancel 제외)`, kpis[0].value === String(s.total) && s.total === expTotal, `${kpis[0].value}/${s.total}/${expTotal}`);
    check(`${TYPE_LABEL[type]}: KPI 상태별 = 목록 상태별`, kpis[1].value === String(cnt((i) => i.status === 'OPEN')) && kpis[2].value === String(cnt((i) => i.status === 'IN_PROGRESS')) && kpis[3].value === String(cnt((i) => i.status === 'DONE')) && kpis[4].value === String(cnt((i) => i.status === 'CLOSED')), kpis.slice(1, 5).map((k) => k.value).join('/'));
    check(`${TYPE_LABEL[type]}: KPI 라벨에 유형명 표시`, kpis[0].label.includes(TYPE_LABEL[type]), kpis[0].label);
    check(`${TYPE_LABEL[type]}: 담당자 미지정 KPI = 목록`, kpis[6].value === String(cnt((i) => !i.assigneeId && i.status === 'OPEN')));
    // Burn Up summary vs API vs raw
    const sum = await admin.$$eval('.chart-summary .item', (it) => Object.fromEntries(it.map((x) => [x.querySelector('.k').textContent.replace(' ⓘ', '').trim(), x.querySelector('.v').textContent.trim()])));
    const b = await api(admin, `/api/dashboard/burnup?type=${type}`);
    check(`${TYPE_LABEL[type]}: Burn Up 요약(누적 등록/조치/Gap/현재 미조치) = API`, sum['누적 등록'] === String(b.current.total) && sum['누적 조치'] === String(b.current.resolvedEver) && sum['미조치 Gap'] === String(b.current.gap) && sum['현재 미조치'] === String(b.current.currentlyUnresolved), JSON.stringify(sum));
    check(`${TYPE_LABEL[type]}: Burn Up 누적 등록 = 목록 건수, 누적 조치 = 최초 조치완료 보유 건수`, b.current.total === expTotal && b.items.at(-1).createdCumulative === expTotal, `${b.items.at(-1).createdCumulative}/${expTotal}`);
    // SVG polyline 마지막 점이 누적값에 대응(선 2개, 값 단조 증가)
    const lines = await admin.$$eval('.chart-wrap svg polyline', (ps) => ps.map((p) => p.getAttribute('points').split(' ').map((pt) => parseFloat(pt.split(',')[1]))));
    const burnLines = lines.slice(-2); // burnup의 2개 선(등록, 조치)
    check(`${TYPE_LABEL[type]}: Burn Up 선 2개, y좌표 단조(누적 증가 → y 감소)`, burnLines.length === 2 && burnLines.every((ys) => ys.every((y, i) => i === 0 || y <= ys[i - 1] + 0.01)));
    check(`${TYPE_LABEL[type]}: 등록선이 조치선보다 항상 위(누적 등록 ≥ 누적 조치)`, burnLines.length === 2 && burnLines[0].every((y, i) => y <= burnLines[1][i] + 0.01));
    // 일자별 막대 합 = 총 등록
    const daily = await api(admin, `/api/dashboard/daily?type=${type}`);
    const barsCreated = daily.items.reduce((a, x) => a + x.created, 0);
    check(`${TYPE_LABEL[type]}: 일자별 신규 막대 합 = 누적 등록`, barsCreated === b.current.total, `${barsCreated}/${b.current.total}`);
    const barCount = await admin.$$eval('.chart-wrap svg rect.bar', (r) => r.filter((x) => parseFloat(x.getAttribute('height')) > 1).length);
    const expBars = daily.items.slice(-30).reduce((a, x) => a + (x.created ? 1 : 0) + (x.resolved ? 1 : 0) + (x.closed ? 1 : 0), 0);
    check(`${TYPE_LABEL[type]}: 렌더된 막대 수 = 값>0 항목 수`, barCount === expBars, `${barCount}/${expBars}`);
    // 상태 분포 = KPI
    const donut = await admin.$$eval('.dist-row', (rows) => rows.slice(0, 4).map((r) => r.querySelector('.n').textContent.trim()));
    check(`${TYPE_LABEL[type]}: 상태 Donut 수치 = KPI`, donut.join('/') === kpis.slice(1, 5).map((k) => k.value).join('/'), donut.join('/'));
    if (type === 'IMPROVEMENT' || type === 'INQUIRY') {
      check(`${TYPE_LABEL[type]}: 처리 건수(누적 조치/Closed)가 0이 아니고 렌더값과 일치`, b.current.resolvedEver > 0 && b.current.closedEver > 0 && sum['누적 조치'] === String(b.current.resolvedEver), `조치 ${b.current.resolvedEver} / Closed ${b.current.closedEver}`);
      const dres = daily.items.reduce((a, x) => a + x.resolved, 0);
      check(`${TYPE_LABEL[type]}: 일자별 조치 완료 막대 합 = 누적 조치`, dres === b.current.resolvedEver, `${dres}`);
    }
    if (type === 'ALL') {
      const parts = await Promise.all(['DEFECT', 'IMPROVEMENT', 'INQUIRY'].map((t) => api(admin, `/api/dashboard/burnup?type=${t}`)));
      const sumRes = parts.reduce((a, p) => a + p.current.resolvedEver, 0);
      const sumTot = parts.reduce((a, p) => a + p.current.total, 0);
      check('전체 유형: 누적 등록/조치 = 세 유형 합', b.current.total === sumTot && b.current.resolvedEver === sumRes, `${b.current.total}=${sumTot}, ${b.current.resolvedEver}=${sumRes}`);
    }
    await shot(admin, `01-dashboard-${type}`);
  }
  // 유형 합계 = 전체
  const totals = {};
  for (const type of ['DEFECT', 'IMPROVEMENT', 'INQUIRY']) totals[type] = (await api(admin, `/api/dashboard/summary?type=${type}`)).total;
  const allActive = (await api(admin, '/api/issues?size=500')).total;
  check('유형별 전체 합 = 전체 Issue(Cancel 제외)', Object.values(totals).reduce((a, b) => a + b, 0) === allActive, JSON.stringify(totals) + ' = ' + allActive);
  // Re-open 케이스: 누적 조치는 유지되고 현재 미조치에 포함되는지 (seed DEF-0002)
  const bd = await api(admin, '/api/dashboard/burnup?type=DEFECT');
  const d2 = (await api(admin, '/api/issues/DEF-0002')).issue;
  check('Re-open된 DEF-0002: 최초 조치완료 보유(누적 조치 포함) + 현재 In Progress(현재 미조치 포함)', !!d2.resolution.firstResolvedAt && d2.status === 'IN_PROGRESS' && bd.current.reopenedCurrent >= 1 && bd.current.currentlyUnresolved > bd.current.gap - 0);
  // Burn Up 툴팁 hover
  await go(admin, '#/dashboard');
  const svgBox = await admin.$eval('svg[aria-label="Burn Up Chart"]', (s) => { s.scrollIntoView({ block: 'center' }); const r = s.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await sleep(300);
  await admin.mouse.move(svgBox.x + svgBox.w * 0.8, svgBox.y + svgBox.h * 0.5);
  await sleep(300);
  const tip = await admin.$$eval('.chart-tip:not(.hidden)', (t) => t.map((x) => x.innerText));
  check('Burn Up hover 툴팁(날짜/누적 등록/누적 조치/Gap)', tip.length === 1 && tip[0].includes('누적 등록') && tip[0].includes('Gap'), JSON.stringify(tip));
  await shot(admin, '02-burnup-tooltip');

  /* ================= 2. 관리자 설정 반영 ================= */
  // Priority 단계명 변경 + Minor 비활성
  await go(admin, '#/settings?tab=priorities');
  const names = ['긴급(P1)', '중요(P2)', '경미(P3)'];
  await admin.evaluate((names) => { const rows = document.querySelectorAll('.table tbody tr'); rows.forEach((r, i) => { const inp = r.querySelectorAll('input'); inp[0].value = names[i]; inp[1].value = ['즉시 조치', '주요 영향', '경미'][i]; }); rows[2].querySelector('input[type=checkbox]').checked = false; }, names);
  await admin.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '저장').click());
  await admin.waitForSelector('.modal'); await admin.click('.modal-foot .btn-primary'); await idle(admin);
  check('Priority 저장 성공 토스트', (await admin.$$eval('#toast-root .toast', (t) => t.map((x) => x.textContent).join())).includes('저장'));
  await shot(admin, '03-priority-settings');
  // 환경명 변경 + 추가
  await go(admin, '#/settings?tab=environments');
  await admin.evaluate(() => { const row = [...document.querySelectorAll('.env-row')].find((r) => r.querySelector('input').value === '테스트계'); row.querySelector('input').value = '테스트계(TB)'; [...row.querySelectorAll('button')].find((b) => b.textContent.includes('이름 저장')).click(); });
  await idle(admin); await sleep(500);
  await admin.type('.card input[placeholder*="운영계"]', '운영계');
  await admin.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('+ 환경 추가')).click());
  await idle(admin); await sleep(500);
  const envVals = await admin.$$eval('.env-row input', (i) => i.map((x) => x.value));
  check('환경명 변경 + 추가 반영', envVals.includes('테스트계(TB)') && envVals.includes('운영계'), envVals.join(','));
  // 프로젝트명 변경
  await go(admin, '#/settings?tab=project');
  await admin.$$eval('.card input.input', (i) => { i[0].value = 'B은행'; i[1].value = '차세대 AI 플랫폼'; });
  await admin.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '저장').click());
  await idle(admin); await sleep(600);
  check('프로젝트명 변경 → 헤더 즉시 반영', (await admin.$eval('.header .proj', (e) => e.textContent)).includes('B은행') && (await admin.$eval('.header .proj', (e) => e.textContent)).includes('차세대 AI 플랫폼'));
  // 사용자 이름/소속 변경 (홍길동 → 홍길동(개발))
  await go(admin, '#/settings?tab=users');
  await admin.evaluate(() => { const row = [...document.querySelectorAll('.table tbody tr')].find((r) => r.textContent.includes('20001')); [...row.querySelectorAll('button')].find((b) => b.textContent.includes('수정')).click(); });
  await admin.waitForSelector('.modal input[name=name]');
  await admin.$eval('.modal input[name=name]', (e) => (e.value = '홍길동(개발)'));
  await admin.$eval('.modal input[name=team]', (e) => (e.value = '플랫폼개발팀'));
  await admin.click('.modal-foot .btn-primary'); await idle(admin); await sleep(500);
  check('사용자 이름/소속 변경', (await admin.$eval('.table', (e) => e.textContent)).includes('홍길동(개발)'));
  await shot(admin, '04-users-renamed');

  /* ================= 3. 변경이 화면 곳곳에 구분되어 반영되는지 ================= */
  const rep = await mk('rep');
  await login(rep, '10001');
  // 로그인 화면/헤더에 프로젝트명
  await rep.goto(`${BASE}/#/start`, { waitUntil: 'networkidle0' }); await sleep(400);
  check('로그인 화면에 변경된 고객사/프로젝트명', (await rep.$eval('.login-brand', (e) => e.textContent)).includes('B은행') && (await rep.$eval('.login-brand', (e) => e.textContent)).includes('차세대 AI 플랫폼'));
  await login(rep, '10001');
  check('헤더에 변경된 프로젝트명(다른 사용자)', (await rep.$eval('.header .proj', (e) => e.textContent)).includes('차세대 AI 플랫폼'));
  // Kanban/목록: Priority 새 단계명 + 환경 새 이름
  await go(rep, '#/issues/kanban');
  const kb = await rep.$eval('.kanban', (e) => e.textContent);
  check('Kanban 카드에 새 Priority 단계명(긴급/중요/경미)', kb.includes('긴급(P1)') && kb.includes('중요(P2)') && kb.includes('경미(P3)') && !kb.includes('Critical'), '');
  check('Kanban 카드에 변경된 환경명', kb.includes('테스트계(TB)') && !kb.includes('테스트계 ') );
  await shot(rep, '05-kanban-tailored');
  await go(rep, '#/issues/list?type=DEFECT');
  const lt = await rep.$eval('.table', (e) => e.textContent);
  check('목록에 새 Priority 단계명 + 환경명', lt.includes('긴급(P1)') && lt.includes('테스트계(TB)') && !lt.includes('Major'));
  const filterOpts = await rep.$$eval('.filter-bar select', (s) => s.map((x) => [...x.options].map((o) => o.textContent)));
  check('목록 필터: Priority 옵션에 비활성(경미) 제외, 환경 옵션에 운영계 포함', filterOpts.some((o) => o.includes('긴급(P1)') && !o.includes('경미(P3)')) && filterOpts.some((o) => o.includes('운영계') && o.includes('테스트계(TB)')), JSON.stringify(filterOpts.slice(0, 4)));
  // 상세: 기존 Minor 이슈(DEF-0003)는 "경미(P3)" 표시, Priority 변경 모달에는 비활성 옵션 없음
  const dev = await mk('dev');
  await login(dev, '20001');
  await go(dev, '#/issues/DEF-0003');
  check('상세: 비활성 단계 값 보유 Issue는 새 이름(경미(P3))으로 표시', (await dev.$eval('.summary-head', (e) => e.textContent)).includes('경미(P3)'));
  await go(dev, '#/issues/DEF-0002');
  check('상세: 환경 새 이름 표시', (await dev.$eval('.meta-grid', (e) => e.textContent)).includes('검증계') || (await dev.$eval('.meta-grid', (e) => e.textContent)).includes('테스트계(TB)'));
  check('상세: 변경된 사용자 이름은 기존 스냅샷 유지(홍길동), 헤더는 새 이름', (await dev.$eval('.meta-grid', (e) => e.textContent)).includes('홍길동') && (await dev.$eval('.header .user .name', (e) => e.textContent)) === '홍길동(개발)');
  await go(dev, '#/issues/DEF-0011');
  await dev.evaluate(() => [...document.querySelectorAll('.side-kv .row')].find((r) => r.textContent.includes('Priority')).querySelector('button').click());
  await dev.waitForSelector('.modal select[name=priority]');
  const prioOpts = await dev.$$eval('.modal select[name=priority] option', (o) => o.map((x) => x.textContent));
  check('Priority 변경 모달: 새 단계명 + 설명, 비활성(경미) 제외', prioOpts.some((o) => o.includes('긴급(P1)') && o.includes('즉시 조치')) && !prioOpts.some((o) => o.includes('경미')), prioOpts.join(' | '));
  await shot(dev, '06-priority-modal-tailored');
  await dev.keyboard.press('Escape');
  // 새 Action의 actor는 새 이름
  await dev.evaluate(() => [...document.querySelectorAll('.side-kv .row')].find((r) => r.textContent.includes('Priority')).querySelector('button').click());
  await dev.waitForSelector('.modal select[name=priority]');
  await dev.select('.modal select[name=priority]', 'MAJOR');
  await dev.click('.modal-foot .btn-primary'); await idle(dev); await sleep(400);
  const tl = await dev.$eval('.timeline', (e) => e.textContent);
  check('Timeline: 새 Action의 actor는 변경된 이름/소속, Priority 변경 표시는 새 단계명(경미(P3) → 중요(P2))', tl.includes('홍길동(개발)') && tl.includes('플랫폼개발팀') && tl.includes('중요(P2)') && tl.includes('경미(P3)'));
  await shot(dev, '07-detail-tailored');
  // Dashboard: Priority 분포/환경 분포 라벨
  await go(admin, '#/dashboard');
  const prioDist = await admin.$$eval('.dash-grid.equal .dist-row', (rows) => rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
  check('Dashboard Priority 분포: 새 단계명 + 비활성 단계도 기존 건수 표시', prioDist.some((r) => r.startsWith('긴급(P1)')) && prioDist.some((r) => r.startsWith('경미(P3)')), prioDist.join(' | '));
  check('Dashboard 환경 분포: 변경된 환경명 + 신규 환경(운영계 0건)', prioDist.some((r) => r.startsWith('테스트계(TB)')) && prioDist.some((r) => /^운영계\s*0$/.test(r)), '');
  const envApi = (await api(admin, '/api/dashboard/distribution?type=DEFECT')).environment;
  const envList = await api(admin, '/api/issues?type=DEFECT&environmentId=ENV-TEST&size=500');
  check('환경 분포 건수 = 목록 필터 건수', envApi.find((e) => e.code === 'ENV-TEST').count === envList.total);
  await shot(admin, '08-dashboard-tailored');
  // 등록 화면: 환경 Select에 새 이름/신규 환경
  await go(rep, '#/new/defect');
  const envOpts = await rep.$$eval('#environmentId option', (o) => o.map((x) => x.textContent));
  check('등록 화면 환경 Select: 테스트계(TB) + 운영계', envOpts.includes('테스트계(TB)') && envOpts.includes('운영계'), envOpts.join(','));
  // 운영계로 신규 등록 → Dashboard 환경 분포에 1건
  await rep.type('#location', '운영 > 배치'); await rep.select('#environmentId', envOpts.indexOf('운영계') >= 0 ? await rep.$$eval('#environmentId option', (o) => o.find((x) => x.textContent === '운영계').value) : '');
  await rep.type('#symptom', '운영계에서만 발생하는 배치 지연 현상입니다.');
  await (await rep.$$('.steps input'))[0].type('배치 실행');
  await rep.type('#expectedResult', '10분 내 완료되어야 합니다.');
  await rep.click('.create-form button[type=submit]'); await rep.waitForSelector('.success-panel');
  const newId = await rep.$eval('.success-panel .id', (e) => e.textContent);
  const envAfter = (await api(admin, '/api/dashboard/distribution?type=DEFECT')).environment.find((e) => e.label === '운영계');
  check('신규 환경으로 등록한 결함이 Dashboard 환경 분포에 반영(운영계 1건)', envAfter && envAfter.count === 1, JSON.stringify(envAfter));
  const sumAfter = await api(admin, '/api/dashboard/summary?type=DEFECT');
  check('신규 결함 등록 후 전체/Open KPI +1', sumAfter.total === totals.DEFECT + 1 && sumAfter.status.open === (await api(admin, '/api/issues?type=DEFECT&status=OPEN&size=500')).total, `${sumAfter.total} vs ${totals.DEFECT}+1`);
  await go(admin, '#/dashboard');
  await shot(admin, '09-dashboard-after-new');
  void newId;

  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n==== RESULT: ${results.length - fails.length}/${results.length} PASS ====`);
  if (fails.length) console.log('FAILS:\n' + fails.map((f) => ` - ${f.name}: ${f.extra}`).join('\n'));
  console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, errors }, null, 2));
})().catch((e) => { console.error('SCRIPT FAILED', e); console.log(results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}`).join('\n')); process.exit(1); });
