#!/usr/bin/env node
'use strict';

/** 수동 Backup 실행 (서비스 실행 중에도 가능, 읽기 전용 복사). */
const { loadServerConfig } = require('../backend/app/config');
const { createContainer } = require('../backend/app/container');

(async () => {
  const c = createContainer(loadServerConfig(), { quietLog: true });
  const r = await c.backupService.run({ trigger: 'cli' });
  console.log(`Backup 완료: ${r.name} (Issue ${r.issues}건, ${Math.round(r.sizeBytes / 1024)} KB, 삭제된 오래된 백업 ${r.removed}개)`);
  console.log(`위치: ${c.cfg.backupDir}`);
})().catch((e) => {
  console.error('Backup 실패:', e.message);
  process.exit(1);
});
