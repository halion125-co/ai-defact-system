'use strict';

const fs = require('fs');
const path = require('path');
const { appendLine, ensureDir } = require('../utils/fsutil');

/**
 * Append-only Audit JSONL. 월 단위 rotation: /data/audit/events-YYYY-MM.jsonl
 */
class AuditRepository {
  constructor({ dataDir, logger }) {
    this.dir = path.join(dataDir, 'audit');
    this.logger = logger;
    ensureDir(this.dir);
  }

  fileFor(timestamp) {
    const ym = String(timestamp).slice(0, 7);
    return path.join(this.dir, `events-${ym}.jsonl`);
  }

  append(event) {
    try {
      appendLine(this.fileFor(event.timestamp), JSON.stringify(event));
    } catch (err) {
      // Audit 실패는 이미 저장된 Issue를 되돌리지 않지만 반드시 로그에 남긴다.
      if (this.logger) this.logger.error('Audit append 실패', { eventId: event.eventId, reason: err.message });
    }
  }

  /** 관리 화면용 최근 N건 조회 */
  recent({ limit = 100, issueId } = {}) {
    if (!fs.existsSync(this.dir)) return [];
    const files = fs
      .readdirSync(this.dir)
      .filter((f) => f.startsWith('events-') && f.endsWith('.jsonl'))
      .sort()
      .reverse();
    const out = [];
    for (const f of files) {
      const lines = fs.readFileSync(path.join(this.dir, f), 'utf8').split('\n').filter(Boolean).reverse();
      for (const line of lines) {
        try {
          const ev = JSON.parse(line);
          if (issueId && ev.issueId !== issueId) continue;
          out.push(ev);
          if (out.length >= limit) return out;
        } catch {
          /* skip broken line */
        }
      }
    }
    return out;
  }
}

module.exports = { AuditRepository };
