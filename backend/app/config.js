'use strict';

const path = require('path');
const fs = require('fs');

/**
 * 서버 설정 로더. 우선순위: 환경변수 > config/server.config.json > 기본값.
 * 데이터/업로드/백업/로그 경로는 모두 배포 루트 기준 상대경로 허용.
 */
const ROOT = path.resolve(__dirname, '..', '..');

const DEFAULTS = {
  host: '0.0.0.0',
  port: 8080,
  dataDir: './data',
  uploadDir: './uploads',
  backupDir: './backup',
  logDir: './logs',
  frontendDir: './frontend',
  sessionTtlHours: 12,
  bootstrapAdminEmployeeIds: ['admin'],
  adminPassword: '',
  timezone: 'Asia/Seoul',
  maxJsonBodyBytes: 1024 * 1024,
  backupSchedule: { enabled: true, hour: 2, minute: 0 },
};

function loadServerConfig(overrides = {}) {
  const file = process.env.DMS_CONFIG || path.join(ROOT, 'config', 'server.config.json');
  let fileCfg = {};
  if (fs.existsSync(file)) {
    try {
      fileCfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`서버 설정 파일 파싱 실패: ${file} (${err.message})`);
    }
  }
  const cfg = { ...DEFAULTS, ...fileCfg, ...overrides };
  if (process.env.DMS_PORT) cfg.port = parseInt(process.env.DMS_PORT, 10);
  if (process.env.DMS_HOST) cfg.host = process.env.DMS_HOST;
  if (process.env.DMS_DATA_DIR) cfg.dataDir = process.env.DMS_DATA_DIR;
  if (process.env.DMS_UPLOAD_DIR) cfg.uploadDir = process.env.DMS_UPLOAD_DIR;
  if (process.env.DMS_BACKUP_DIR) cfg.backupDir = process.env.DMS_BACKUP_DIR;
  if (process.env.DMS_LOG_DIR) cfg.logDir = process.env.DMS_LOG_DIR;
  if (process.env.DMS_BOOTSTRAP_ADMIN) {
    cfg.bootstrapAdminEmployeeIds = process.env.DMS_BOOTSTRAP_ADMIN.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (process.env.DMS_ADMIN_PASSWORD !== undefined) cfg.adminPassword = process.env.DMS_ADMIN_PASSWORD;

  const abs = (p) => (path.isAbsolute(p) ? p : path.resolve(ROOT, p));
  cfg.root = ROOT;
  cfg.dataDir = abs(cfg.dataDir);
  cfg.uploadDir = abs(cfg.uploadDir);
  cfg.backupDir = abs(cfg.backupDir);
  cfg.logDir = abs(cfg.logDir);
  cfg.frontendDir = abs(cfg.frontendDir);
  cfg.configFile = file;
  return cfg;
}

module.exports = { loadServerConfig, ROOT, DEFAULTS };
