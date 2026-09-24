#!/usr/bin/env node
'use strict';

/**
 * 데모/테스트용 Seed 데이터 생성. 운영 데이터가 있으면 실행을 거부한다.
 *   node scripts/seed.js            # ./data 기준
 *   DMS_DATA_DIR=... node scripts/seed.js
 *   node scripts/seed.js --force    # 기존 Issue가 있어도 추가 생성
 */
const path = require('path');
const { loadServerConfig } = require('../backend/app/config');
const { createContainer } = require('../backend/app/container');

const force = process.argv.includes('--force');

async function main() {
  const cfg = loadServerConfig();
  const c = createContainer(cfg, { quietLog: true });
  if (c.repos.issueRepo.count() > 0 && !force) {
    console.error(`이미 Issue ${c.repos.issueRepo.count()}건이 존재합니다. 운영 데이터 보호를 위해 중단합니다. (--force로 강제 실행)`);
    process.exit(1);
  }

  // 프로젝트명
  await c.repos.configRepo.saveProject((p) => ({ ...p, customerName: 'A은행', projectName: 'Gen AI 플랫폼 구축' }));

  const mk = async (employeeId, name, team) => {
    const existing = c.repos.userRepo.findByEmployeeId(employeeId);
    if (existing) return c.userService.publicUser(existing);
    return c.userService.register({ employeeId, name, team });
  };
  const admin = await mk('admin', '김성훈', 'AX리스크/품질팀');
  const adminUser = await c.userService.findForSession('admin');
  const rep1 = await mk('10001', '이영희', '업무팀');
  const rep2 = await mk('10002', '박민수', '테스트팀');
  const dev1 = await mk('20001', '홍길동', '개발팀');
  const dev2 = await mk('20002', '최지우', 'Frontend팀');
  void admin;

  // 시간 조작: 생성 시각을 과거로 되돌리기 위해 저장 후 파일을 직접 수정한다(seed 전용).
  const { writeJsonAtomic } = require('../backend/app/utils/fsutil');
  const shift = (id, daysAgo, hours = 9) => {
    const issue = c.repos.issueRepo.get(id);
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hours, Math.floor(Math.random() * 50), 0, 0);
    const { toIso } = require('../backend/app/utils/time');
    const base = d.getTime();
    const orig = new Date(issue.createdAt).getTime();
    const delta = base - orig;
    const fix = (iso) => (iso ? toIso(new Date(new Date(iso).getTime() + delta)) : iso);
    issue.createdAt = fix(issue.createdAt);
    issue.updatedAt = fix(issue.updatedAt);
    if (issue.startedAt) issue.startedAt = fix(issue.startedAt);
    if (issue.resolution) for (const k of ['resolvedAt', 'firstResolvedAt']) if (issue.resolution[k]) issue.resolution[k] = fix(issue.resolution[k]);
    if (issue.close) for (const k of ['closedAt', 'firstClosedAt']) if (issue.close[k]) issue.close[k] = fix(issue.close[k]);
    if (issue.deployment && issue.deployment.deployedAt) issue.deployment.deployedAt = fix(issue.deployment.deployedAt);
    for (const ev of issue.history) ev.timestamp = fix(ev.timestamp);
    for (const cm of issue.comments) cm.createdAt = fix(cm.createdAt);
    writeJsonAtomic(c.repos.issueRepo.filePath(id), issue);
    c.repos.issueRepo.cache.set(id, issue);
  };

  const envs = ['ENV-DEV', 'ENV-TEST', 'ENV-VERIFY'];
  const samples = [
    ['고객관리 > 고객정보 조회', '고객명을 입력하고 조회 버튼을 누르면 결과가 표시되지 않고 로딩 상태가 계속됩니다.', ['고객관리 메뉴 접속', '고객정보 조회 선택', '고객명 입력', '조회 버튼 클릭'], '조회조건에 해당하는 고객 목록이 표시되어야 합니다.'],
    ['로그인 > 인증', '로그인 후 첫 화면이 계속 로딩 상태로 멈춥니다.', ['로그인 화면 접속', '사번/비밀번호 입력', '로그인 클릭'], '대시보드 화면이 표시되어야 합니다.'],
    ['대출 > 한도조회', '한도조회 결과 금액이 천 단위 구분자 없이 표시됩니다.', ['대출 메뉴 접속', '한도조회 클릭', '고객번호 입력'], '금액이 1,000,000 형식으로 표시되어야 합니다.'],
    ['공통 > 파일 업로드', '10MB 이상 파일 업로드 시 오류 메시지 없이 화면이 멈춥니다.', ['증빙 업로드 화면 접속', '12MB PDF 선택', '업로드 클릭'], '용량 초과 안내 메시지가 표시되어야 합니다.'],
    ['AI 상담 > 답변 생성', '특정 질문에 대해 답변이 영어로 생성됩니다.', ['AI 상담 화면 접속', '"수수료 면제 조건" 입력', '전송'], '한국어로 답변이 생성되어야 합니다.'],
    ['계좌 > 거래내역', '거래내역 조회 기간을 3개월 이상 설정하면 타임아웃이 발생합니다.', ['거래내역 메뉴', '기간 6개월 설정', '조회'], '6개월 이내 조회는 5초 내 응답해야 합니다.'],
    ['공통 > 세션', '30분 미사용 후 자동 로그아웃 시 작성 중인 내용이 유실됩니다.', ['화면에서 입력 중 대기', '30분 경과'], '세션 만료 전 안내 및 임시 저장이 필요합니다.'],
    ['보고서 > PDF 출력', 'PDF 출력 시 한글 폰트가 깨져서 출력됩니다.', ['보고서 화면', 'PDF 출력 클릭'], '한글이 정상 출력되어야 합니다.'],
    ['고객관리 > 고객정보 수정', '주소 변경 후 저장하면 이전 주소가 그대로 표시됩니다.', ['고객정보 수정 진입', '주소 변경', '저장', '재조회'], '변경된 주소가 표시되어야 합니다.'],
    ['AI 상담 > 대화 이력', '대화 이력이 최신순이 아닌 오래된 순으로 표시됩니다.', ['AI 상담 화면', '대화 이력 탭 클릭'], '최신 대화가 상단에 표시되어야 합니다.'],
    ['알림 > Push', '알림 설정을 꺼도 Push 알림이 계속 수신됩니다.', ['설정 > 알림', 'Push 알림 OFF', '거래 발생'], 'Push 알림이 수신되지 않아야 합니다.'],
    ['공통 > 접근성', '키보드 Tab 이동 시 포커스가 보이지 않습니다.', ['임의 화면', 'Tab 키 반복'], '포커스 영역이 시각적으로 표시되어야 합니다.'],
  ];

  const created = [];
  for (let i = 0; i < samples.length; i++) {
    const [location, symptom, steps, expected] = samples[i];
    const reporter = i % 3 === 0 ? rep2 : rep1;
    const r = await c.issueService.createDefect(reporter, { location, environmentId: envs[i % 3], symptom, reproductionSteps: steps, expectedResult: expected });
    created.push({ id: r.id, reporter });
  }
  const imp = await c.issueService.createImprovement(rep1, { target: '고객정보 조회', request: '상태별 필터를 상단에서 바로 선택할 수 있도록 개선', reason: '결함이 많아지면 원하는 고객을 찾기 어려움' });
  const inq = await c.issueService.createInquiry(rep2, { target: '고객정보 조회', question: '탈퇴 고객도 조회 대상에 포함되는지 확인이 필요합니다.' });

  const rev = (id) => c.repos.issueRepo.get(id).revision;
  const W = c.workflowService;
  const CM = c.commentService;

  // 다양한 상태로 진행
  const flow = async (id, steps) => {
    for (const s of steps) await s(id);
  };
  const claim = (who) => (id) => W.claim(who, id, { expectedRevision: rev(id) });
  const prio = (who, p) => (id) => W.changePriority(who, id, { expectedRevision: rev(id), priority: p });
  const start = (who) => (id) => W.start(who, id, { expectedRevision: rev(id) });
  const resolve = (who, desc, cr, ver) => (id) => W.resolve(who, id, { expectedRevision: rev(id), resolution: { description: desc, changeReference: cr, targetVersion: ver } });
  const deploy = (who, env, ver) => (id) => W.registerDeployment(who, id, { expectedRevision: rev(id), environmentId: env, version: ver });
  const closeV = (who, cmt) => (id) => W.close(who, id, { expectedRevision: rev(id), closeType: 'VERIFIED', comment: cmt });
  const closeA = (who, cmt) => (id) => W.close(who, id, { expectedRevision: rev(id), closeType: 'AGREED', comment: cmt });
  const reopen = (who, reason) => (id) => W.reopen(who, id, { expectedRevision: rev(id), reason });
  const comment = (who, body) => (id) => CM.add(who, id, { expectedRevision: rev(id), body });
  const assign = (who, target) => (id) => W.assign(who, id, { expectedRevision: rev(id), assigneeUserId: target.userId });
  const cancel = (who, reason) => (id) => W.cancel(who, id, { expectedRevision: rev(id), reason });

  const [d1, d2, d3, d4, d5, d6, d7, d8, d9, d10, d11, d12] = created.map((x) => x.id);
  // 1: 전체 흐름 Closed(VERIFIED)
  await flow(d1, [claim(dev1), prio(dev1, 'MAJOR'), start(dev1), comment(rep2, '특정 고객번호에서도 동일 현상이 발생합니다.'), comment(dev1, '조회 조건 오류 확인했습니다. 수정 중입니다.'), resolve(dev1, '조회 조건 처리 로직 수정', 'a84fd23', 'Release 1.2.3'), deploy(dev1, 'ENV-VERIFY', 'Release 1.2.3'), closeV(rep2, '검증계 정상 동작 확인')]);
  // 2: Critical, In Progress, Re-open 이력
  await flow(d2, [claim(dev1), prio(dev1, 'CRITICAL'), start(dev1), resolve(dev1, 'Token 검증 로직 수정', 'b17c9e0', 'Release 1.2.3'), reopen(rep1, '검증계에서 동일 현상이 재발합니다.'), comment(dev1, '캐시 이슈로 확인되어 추가 수정 중입니다.')]);
  // 3: Done, 배포대기
  await flow(d3, [assign(adminUser, dev2), prio(dev2, 'MINOR'), start(dev2), resolve(dev2, '숫자 포맷 유틸 적용', 'c2d4f11', 'Release 1.2.4')]);
  // 4: Done + 배포완료 (재검증대기)
  await flow(d4, [claim(dev2), prio(dev2, 'MAJOR'), start(dev2), resolve(dev2, '용량 검증 및 안내 메시지 추가', 'd90aa21', 'Release 1.2.4'), deploy(dev2, 'ENV-TEST', 'Release 1.2.4')]);
  // 5: 미배정 Open (Critical은 Admin이 지정)
  await flow(d5, [prio(adminUser, 'CRITICAL')]);
  // 6: 미배정 Open
  // 7: Closed AGREED
  await flow(d7, [claim(dev1), prio(dev1, 'MINOR'), start(dev1), resolve(dev1, '세션 만료 5분 전 안내 및 임시저장 추가', 'e33b0c7', 'Release 1.2.2'), closeA(dev1, '이영희 책임과 검증계 정상동작을 확인하였으며 종료하기로 협의함.')]);
  // 8: In Progress 장기 미조치용
  await flow(d8, [claim(dev2), prio(dev2, 'MAJOR'), start(dev2)]);
  // 9: Closed VERIFIED
  await flow(d9, [claim(dev1), prio(dev1, 'MAJOR'), start(dev1), resolve(dev1, '저장 후 캐시 갱신 처리', 'f41ee02', 'Release 1.2.2'), deploy(dev1, 'ENV-VERIFY', 'Release 1.2.2'), closeV(rep1)]);
  // 10: Cancel
  await flow(d10, [claim(dev2), cancel(dev2, `중복 결함 ${d1}로 관리`)]);
  // 11: Open, claimed not started
  await flow(d11, [claim(dev1), prio(dev1, 'MINOR')]);
  // 12: Open unassigned
  await flow(imp.id, [claim(dev2), start(dev2)]);
  await flow(inq.id, [comment(adminUser, '탈퇴 고객은 기본 조회 대상에서 제외되며, 옵션으로 포함 가능합니다.')]);
  // 개선요청/문의도 조치 완료·Close 되어 Dashboard 처리 건수에 집계된다
  const imp2 = await c.issueService.createImprovement(rep2, { target: '결함 목록', request: '목록에서 담당자 컬럼을 클릭하면 바로 필터되도록 개선', reason: '담당자별 확인이 잦음' });
  await flow(imp2.id, [claim(dev1), prio(dev1, 'MINOR'), start(dev1), resolve(dev1, '담당자 컬럼 클릭 필터 적용', 'g55ab10', 'Release 1.2.4'), closeV(rep2, '개선 반영 확인')]);
  const imp3 = await c.issueService.createImprovement(rep1, { target: '대시보드', request: 'Burn Up에 Closed 누적을 기본 표시', reason: '' });
  await flow(imp3.id, [claim(dev2), start(dev2), resolve(dev2, '옵션 토글 제공으로 대체', '', 'Release 1.2.5')]);
  const inq2 = await c.issueService.createInquiry(rep1, { target: '로그인 정책', question: '5회 실패 시 잠금 기준이 계정 단위인지 단말 단위인지 확인 요청' });
  await flow(inq2.id, [claim(adminUser), start(adminUser), resolve(adminUser, '계정 단위 잠금이며 30분 후 자동 해제됩니다.'), closeA(adminUser, '문의자와 답변 내용 확인 후 종료 합의')]);
  shift(imp2.id, 8);
  shift(imp3.id, 4);
  shift(inq2.id, 6);

  // 날짜 분산
  const daysAgo = [20, 18, 15, 14, 12, 11, 10, 9, 7, 6, 3, 1];
  created.forEach((x, i) => shift(x.id, daysAgo[i]));
  shift(imp.id, 5);
  shift(inq.id, 2);
  // 장기 미조치: d8 updatedAt를 과거로
  {
    const iss = c.repos.issueRepo.get(d8);
    const { toIso } = require('../backend/app/utils/time');
    iss.updatedAt = toIso(new Date(Date.now() - 6 * 86400000));
    writeJsonAtomic(c.repos.issueRepo.filePath(d8), iss);
  }
  void d6;
  void d12;
  console.log(`Seed 완료: 사용자 ${c.repos.userRepo.all().length}명, Issue ${c.repos.issueRepo.count()}건 → ${cfg.dataDir}`);
  console.log('사용자 사번: admin(김성훈, Quality Admin), 10001(이영희), 10002(박민수), 20001(홍길동), 20002(최지우)');
}

main().catch((err) => {
  console.error('Seed 실패:', err.message);
  process.exit(1);
});
void path;
