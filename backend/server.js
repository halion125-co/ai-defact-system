#!/usr/bin/env node
'use strict';

/**
 * 결함관리서비스 v1.0 — Backend 진입점 (Node.js 내장 모듈만 사용, 외부 의존성 0)
 *
 *   node backend/server.js
 *   DMS_PORT=9090 node backend/server.js
 */
const { loadServerConfig } = require('./app/config');
const { createContainer } = require('./app/container');
const { createServer } = require('./app/server');

function main() {
  const cfg = loadServerConfig();
  const container = createContainer(cfg);
  const server = createServer(container);

  container.backupService.startScheduler();
  const sweep = setInterval(() => container.sessionService.sweep(), 10 * 60 * 1000);
  sweep.unref();

  server.listen(cfg.port, cfg.host, () => {
    container.logger.info('결함관리서비스 시작', {
      url: `http://${cfg.host === '0.0.0.0' ? 'localhost' : cfg.host}:${cfg.port}/`,
      dataDir: cfg.dataDir,
      uploadDir: cfg.uploadDir,
      backupDir: cfg.backupDir,
      bootstrapAdmins: cfg.bootstrapAdminEmployeeIds,
      warnings: container.startup.warnings,
    });
    console.log(`\n  결함관리서비스 v1.0 실행 중: http://localhost:${cfg.port}/\n  Quality Admin bootstrap 사번: ${cfg.bootstrapAdminEmployeeIds.join(', ')}\n`);
  });

  const shutdown = (signal) => {
    container.logger.info('서버 종료', { signal });
    container.backupService.stopScheduler();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    container.logger.error('uncaughtException', { reason: err.message, stack: err.stack });
  });
  process.on('unhandledRejection', (err) => {
    container.logger.error('unhandledRejection', { reason: err && err.message, stack: err && err.stack });
  });
}

main();
