#!/usr/bin/env node
'use strict';

/**
 * 관리자(admin) 로그인 비밀번호를 scrypt 해시로 변환한다.
 * 출력된 값을 DMS_ADMIN_PASSWORD_HASH 환경변수(또는 config/server.config.json의 adminPasswordHash)에 설정한다.
 *
 * 사용법: node scripts/hash-admin-password.js "원하는 비밀번호"
 * 비밀번호를 인자로 주지 않으면 stdin에서 한 줄 읽는다(터미널 히스토리에 평문이 남지 않도록 권장).
 */
const readline = require('readline');
const { hashPassword } = require('../backend/app/utils/password');

async function readPasswordFromStdin() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question('관리자 비밀번호를 입력하세요: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

(async () => {
  const arg = process.argv[2];
  const password = arg || (await readPasswordFromStdin());
  if (!password || !password.trim()) {
    console.error('비밀번호가 비어 있습니다.');
    process.exit(1);
  }
  const hash = hashPassword(password);
  console.log('\n아래 값을 DMS_ADMIN_PASSWORD_HASH 환경변수에 설정하세요:\n');
  console.log(hash);
  console.log('\ndocker-compose.yml 예시:\n  - DMS_ADMIN_PASSWORD_HASH=' + hash + '\n');
})();
