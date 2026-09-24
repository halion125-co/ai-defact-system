'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { createContainer } = require('../app/container');
const { createServer } = require('../app/server');
const { loadServerConfig } = require('../app/config');

/** 테스트용 임시 디렉터리 기반 Container/Server 생성 */
function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dms-test-'));
}

function makeContainer(opts = {}) {
  const root = makeTempRoot();
  const cfg = loadServerConfig({
    dataDir: path.join(root, 'data'),
    uploadDir: path.join(root, 'uploads'),
    backupDir: path.join(root, 'backup'),
    logDir: path.join(root, 'logs'),
    bootstrapAdminEmployeeIds: ['admin'],
    backupSchedule: { enabled: false },
    ...opts,
  });
  const c = createContainer(cfg, { quietLog: true });
  c.root = root;
  return c;
}

/** 테스트 전용: 실제 서비스는 #/admin-login(사번+관리자 비밀번호)으로만 Quality Admin 승격이 된다. */
async function promoteToAdmin(c, employeeId) {
  const u = c.repos.userRepo.findByEmployeeId(employeeId);
  if (!u) throw new Error(`promoteToAdmin: 사번 ${employeeId} 사용자 없음`);
  await c.repos.userRepo.update(u.userId, { isQualityAdmin: true });
}

async function makeUsers(c) {
  const created = await c.userService.register({ employeeId: 'admin', name: '김성훈', team: '품질팀' });
  // 테스트 전용: Admin 권한 승격은 실제로는 #/admin-login(사번+관리자 비밀번호)으로만 가능하다.
  const admin = c.userService.publicUser(await c.repos.userRepo.update(created.userId, { isQualityAdmin: true }));
  const reporter = await c.userService.register({ employeeId: '10001', name: '이영희', team: '업무팀' });
  const dev = await c.userService.register({ employeeId: '20001', name: '홍길동', team: '개발팀' });
  const other = await c.userService.register({ employeeId: '30001', name: '박민수', team: '테스트팀' });
  return { admin, reporter, dev, other };
}

const DEFECT_BODY = {
  location: '고객관리 > 고객정보 조회',
  environmentId: 'ENV-VERIFY',
  symptom: '조회 버튼을 누르면 로딩 상태가 계속됩니다.',
  reproductionSteps: ['고객관리 메뉴 접속', '조회 클릭'],
  expectedResult: '조회 결과가 표시되어야 합니다.',
};

async function startServer(c) {
  const server = createServer(c);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

/** 간단 HTTP 클라이언트(cookie jar 포함) */
function client(base) {
  let cookie = '';
  return {
    async req(method, urlPath, body, { headers = {}, raw = false } = {}) {
      return new Promise((resolve, reject) => {
        const u = new URL(base + urlPath);
        const payload = raw ? body : body !== undefined ? JSON.stringify(body) : undefined;
        const req = http.request(
          { method, hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers: { ...(payload && !raw ? { 'Content-Type': 'application/json' } : {}), 'X-Requested-With': 'XMLHttpRequest', Cookie: cookie, ...headers } },
          (res) => {
            const chunks = [];
            res.on('data', (d) => chunks.push(d));
            res.on('end', () => {
              const sc = res.headers['set-cookie'];
              if (sc) cookie = sc[0].split(';')[0];
              const buf = Buffer.concat(chunks);
              let json = null;
              try {
                json = JSON.parse(buf.toString('utf8'));
              } catch {
                json = null;
              }
              resolve({ status: res.statusCode, headers: res.headers, body: json, buf });
            });
          }
        );
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
      });
    },
    get(p) {
      return this.req('GET', p);
    },
    post(p, b, o) {
      return this.req('POST', p, b, o);
    },
    patch(p, b) {
      return this.req('PATCH', p, b);
    },
    put(p, b) {
      return this.req('PUT', p, b);
    },
    del(p) {
      return this.req('DELETE', p);
    },
    async login(employeeId) {
      return this.post('/api/session/start', { employeeId });
    },
  };
}

module.exports = { makeContainer, makeUsers, promoteToAdmin, DEFECT_BODY, startServer, client };
