'use strict';

const fs = require('fs');
const path = require('path');
const { ensureDir, copyDirSync, writeJsonAtomic, readJson } = require('../utils/fsutil');
const { nowIso } = require('../utils/time');
const { errors } = require('../utils/errors');

/**
 * data + uploads 전체 Backup. 일 1회 스케줄 + Admin 수동 실행. 기본 30일 보관.
 * backup/<YYYYMMDD_HHMMSS>/{data,uploads}, backup/status.json에 성공/실패 이력.
 */
class BackupService {
  constructor({ dataDir, uploadDir, backupDir, configService, logger, schedule }) {
    this.dataDir = dataDir;
    this.uploadDir = uploadDir;
    this.backupDir = backupDir;
    this.configService = configService;
    this.logger = logger;
    this.schedule = schedule || { enabled: true, hour: 2, minute: 0 };
    this.statusFile = path.join(backupDir, 'status.json');
    this.timer = null;
    this.running = false;
    ensureDir(backupDir);
  }

  status() {
    const s = readJson(this.statusFile) || { lastSuccessAt: null, lastFailureAt: null, lastError: null, history: [] };
    const list = this.list();
    return { ...s, backups: list, retainDays: this.configService.getOperation().backup.retainDays, enabled: this.configService.getOperation().backup.enabled, schedule: this.schedule };
  }

  list() {
    if (!fs.existsSync(this.backupDir)) return [];
    return fs
      .readdirSync(this.backupDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d{8}_\d{6}$/.test(d.name))
      .map((d) => {
        const dir = path.join(this.backupDir, d.name);
        const meta = readJson(path.join(dir, 'backup.json')) || {};
        return { name: d.name, createdAt: meta.createdAt || null, issues: meta.issues ?? null, sizeBytes: meta.sizeBytes ?? null };
      })
      .sort((a, b) => b.name.localeCompare(a.name));
  }

  _saveStatus(mutator) {
    const s = readJson(this.statusFile) || { lastSuccessAt: null, lastFailureAt: null, lastError: null, history: [] };
    mutator(s);
    s.history = (s.history || []).slice(-50);
    writeJsonAtomic(this.statusFile, s, { keepBackup: false });
  }

  async run({ trigger = 'manual', actor = null } = {}) {
    if (this.running) throw errors.validation('이미 Backup이 실행 중입니다.');
    this.running = true;
    const startedAt = nowIso();
    const name = startedAt.replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
    const target = path.join(this.backupDir, name);
    try {
      ensureDir(target);
      let sizeBytes = 0;
      const filter = (p, entry) => {
        if (entry.isFile()) {
          if (entry.name.endsWith('.tmp')) return false;
          try {
            sizeBytes += fs.statSync(p).size;
          } catch {
            /* ignore */
          }
        }
        return true;
      };
      copyDirSync(this.dataDir, path.join(target, 'data'), filter);
      if (fs.existsSync(this.uploadDir)) copyDirSync(this.uploadDir, path.join(target, 'uploads'), filter);
      const issues = fs.existsSync(path.join(this.dataDir, 'issues')) ? fs.readdirSync(path.join(this.dataDir, 'issues')).filter((f) => f.endsWith('.json')).length : 0;
      const finishedAt = nowIso();
      writeJsonAtomic(path.join(target, 'backup.json'), { name, createdAt: startedAt, finishedAt, trigger, actor, issues, sizeBytes }, { keepBackup: false });
      this._saveStatus((s) => {
        s.lastSuccessAt = finishedAt;
        s.lastError = null;
        s.history.push({ name, startedAt, finishedAt, trigger, result: 'SUCCESS', issues, sizeBytes });
      });
      const removed = this.applyRetention();
      if (this.logger) this.logger.info('Backup 성공', { name, trigger, issues, sizeBytes, removed });
      return { name, startedAt, finishedAt, issues, sizeBytes, removed };
    } catch (err) {
      const failedAt = nowIso();
      this._saveStatus((s) => {
        s.lastFailureAt = failedAt;
        s.lastError = err.message;
        s.history.push({ name, startedAt, finishedAt: failedAt, trigger, result: 'FAILURE', error: err.message });
      });
      if (this.logger) this.logger.error('Backup 실패', { name, trigger, reason: err.message });
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      throw errors.storageWriteFailed(`Backup 실패: ${err.message}`);
    } finally {
      this.running = false;
    }
  }

  applyRetention() {
    const retainDays = this.configService.getOperation().backup.retainDays || 30;
    const cutoff = Date.now() - retainDays * 86400000;
    let removed = 0;
    for (const b of this.list()) {
      const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(b.name);
      if (!m) continue;
      const t = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).getTime();
      if (t < cutoff) {
        try {
          fs.rmSync(path.join(this.backupDir, b.name), { recursive: true, force: true });
          removed++;
        } catch (err) {
          if (this.logger) this.logger.warn('Backup 삭제 실패', { name: b.name, reason: err.message });
        }
      }
    }
    return removed;
  }

  /** 매일 지정 시각에 실행. 1분 간격 체크(폐쇄망 서버의 단순 스케줄러) */
  startScheduler() {
    if (!this.schedule.enabled) return;
    let lastRunDay = null;
    this.timer = setInterval(() => {
      const op = this.configService.getOperation();
      if (!op.backup.enabled) return;
      const now = new Date();
      const h = parseInt(nowIso().slice(11, 13), 10);
      const mi = parseInt(nowIso().slice(14, 16), 10);
      const day = nowIso().slice(0, 10);
      if (h === this.schedule.hour && mi >= this.schedule.minute && lastRunDay !== day) {
        lastRunDay = day;
        this.run({ trigger: 'scheduled' }).catch(() => {});
      }
      void now;
    }, 60 * 1000);
    if (this.timer.unref) this.timer.unref();
  }

  stopScheduler() {
    if (this.timer) clearInterval(this.timer);
  }
}

module.exports = { BackupService };
