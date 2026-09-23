#!/usr/bin/env node
'use strict';

/**
 * Backup 복구. 반드시 서비스를 중지한 후 실행한다.
 *   node scripts/restore.js <백업명|latest> [--yes]
 * 현재 data/uploads는 backup/_pre-restore_<시각>/ 로 보관된 뒤 교체된다.
 */
const fs = require('fs');
const path = require('path');
const { loadServerConfig } = require('../backend/app/config');
const { copyDirSync, ensureDir } = require('../backend/app/utils/fsutil');

const [, , nameArg, ...flags] = process.argv;
if (!nameArg) {
  console.error('사용법: node scripts/restore.js <백업명|latest> [--yes]');
  process.exit(1);
}
const cfg = loadServerConfig();
const backups = fs
  .readdirSync(cfg.backupDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^\d{8}_\d{6}$/.test(d.name))
  .map((d) => d.name)
  .sort();
const name = nameArg === 'latest' ? backups[backups.length - 1] : nameArg;
if (!name || !backups.includes(name)) {
  console.error(`백업을 찾을 수 없습니다: ${nameArg}\n사용 가능: ${backups.join(', ') || '(없음)'}`);
  process.exit(1);
}
const src = path.join(cfg.backupDir, name);
if (!flags.includes('--yes')) {
  console.log(`복구 대상: ${src}\n → data: ${cfg.dataDir}\n → uploads: ${cfg.uploadDir}\n\n서비스가 중지되어 있는지 확인한 뒤 --yes 를 붙여 다시 실행하세요.`);
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
const keep = path.join(cfg.backupDir, `_pre-restore_${stamp}`);
ensureDir(keep);
if (fs.existsSync(cfg.dataDir)) fs.renameSync(cfg.dataDir, path.join(keep, 'data'));
if (fs.existsSync(cfg.uploadDir)) fs.renameSync(cfg.uploadDir, path.join(keep, 'uploads'));
copyDirSync(path.join(src, 'data'), cfg.dataDir);
if (fs.existsSync(path.join(src, 'uploads'))) copyDirSync(path.join(src, 'uploads'), cfg.uploadDir);
console.log(`복구 완료: ${name}\n이전 데이터 보관: ${keep}\n이제 서비스를 시작하세요.`);
