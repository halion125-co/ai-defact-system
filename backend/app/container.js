'use strict';

const { KeyedMutex } = require('./utils/lock');
const { Logger } = require('./utils/logger');
const { ensureDir } = require('./utils/fsutil');
const { setDefaultTimezone } = require('./utils/time');

const { UserRepository } = require('./repositories/UserRepository');
const { ConfigRepository } = require('./repositories/ConfigRepository');
const { SequenceRepository } = require('./repositories/SequenceRepository');
const { IssueRepository } = require('./repositories/IssueRepository');
const { AuditRepository } = require('./repositories/AuditRepository');

const { SessionService } = require('./services/SessionService');
const { UserService } = require('./services/UserService');
const { ConfigService } = require('./services/ConfigService');
const { IssueService } = require('./services/IssueService');
const { WorkflowService } = require('./services/WorkflowService');
const { CommentService } = require('./services/CommentService');
const { AttachmentService } = require('./services/AttachmentService');
const { DashboardService } = require('./services/DashboardService');
const { BackupService } = require('./services/BackupService');

/**
 * 모든 Repository/Service를 조립한다. 서버와 테스트가 공유.
 * Startup Validation(E15-04): 필수 파일/디렉터리 확인, 손상 JSON fail-safe, sequence 보정.
 */
function createContainer(cfg, { quietLog = false } = {}) {
  setDefaultTimezone(cfg.timezone);
  for (const d of [cfg.dataDir, cfg.uploadDir, cfg.backupDir, cfg.logDir]) ensureDir(d);

  const logger = new Logger({ logDir: cfg.logDir, console: !quietLog });
  const mutex = new KeyedMutex({ defaultTimeoutMs: 10000 });

  const userRepo = new UserRepository({ dataDir: cfg.dataDir, mutex });
  const configRepo = new ConfigRepository({ dataDir: cfg.dataDir, mutex });
  const sequenceRepo = new SequenceRepository({ dataDir: cfg.dataDir, mutex });
  const issueRepo = new IssueRepository({ dataDir: cfg.dataDir, mutex, logger });
  const auditRepo = new AuditRepository({ dataDir: cfg.dataDir, logger });

  // ---- Startup validation ----
  const startup = { warnings: [] };
  try {
    userRepo.load();
    configRepo.load();
    sequenceRepo.load();
  } catch (err) {
    logger.error('핵심 데이터 파일 손상 - 서비스 시작 중단. backup 또는 .bak 파일에서 복구하세요.', { reason: err.message });
    throw new Error(`핵심 데이터 파일 손상: ${err.message}`);
  }
  const loaded = issueRepo.load();
  if (sequenceRepo.reconcile(loaded.maxByPrefix)) {
    startup.warnings.push('sequence.json이 실제 Issue 파일 기준으로 보정되었습니다.');
    logger.warn('sequence 보정', loaded.maxByPrefix);
  }
  if (loaded.corrupted.length) startup.warnings.push(`손상된 Issue 파일 ${loaded.corrupted.length}건: ${loaded.corrupted.join(', ')}`);
  setDefaultTimezone(configRepo.getOperation().timezone || cfg.timezone);

  const sessionService = new SessionService({ ttlHours: cfg.sessionTtlHours });
  const userService = new UserService({ userRepo, bootstrapAdminEmployeeIds: cfg.bootstrapAdminEmployeeIds, adminPassword: cfg.adminPassword, logger });
  const configService = new ConfigService({ configRepo, issueRepo, logger });
  const issueService = new IssueService({ issueRepo, sequenceRepo, auditRepo, userService, configService, logger });
  const workflowService = new WorkflowService({ issueService, userService, configService, logger });
  const commentService = new CommentService({ issueService, userService });
  const attachmentService = new AttachmentService({ issueService, configService, uploadDir: cfg.uploadDir, logger });
  const dashboardService = new DashboardService({ issueRepo, configService });
  const backupService = new BackupService({
    dataDir: cfg.dataDir,
    uploadDir: cfg.uploadDir,
    backupDir: cfg.backupDir,
    configService,
    logger,
    schedule: cfg.backupSchedule,
  });

  logger.info('Container 초기화 완료', { issues: loaded.count, corrupted: loaded.corrupted.length, users: userRepo.all().length });

  return {
    cfg,
    logger,
    mutex,
    startup,
    repos: { userRepo, configRepo, sequenceRepo, issueRepo, auditRepo },
    sessionService,
    userService,
    configService,
    issueService,
    workflowService,
    commentService,
    attachmentService,
    dashboardService,
    backupService,
  };
}

module.exports = { createContainer };
