'use strict';

const fs = require('fs');
const path = require('path');
const { readJson, writeJsonAtomic, ensureDir, cleanupTempFiles } = require('../utils/fsutil');
const { errors } = require('../utils/errors');
const { parseIssueId } = require('../utils/id');

/**
 * file-per-issue JSON 저장소. /data/issues/DEF-0001.json
 * - 단일 프로세스가 디렉터리를 독점하므로 시작 시 전체 로드 후 메모리 캐시 유지
 * - 모든 쓰기는 Issue 단위 lock + atomic replace
 * - 손상 파일은 corrupted 목록에 기록하고 해당 ID 쓰기를 차단(fail-safe)
 */
class IssueRepository {
  constructor({ dataDir, mutex, logger }) {
    this.dir = path.join(dataDir, 'issues');
    this.mutex = mutex;
    this.logger = logger;
    this.cache = new Map();
    this.corrupted = new Map();
  }

  load() {
    ensureDir(this.dir);
    const cleaned = cleanupTempFiles(this.dir);
    if (cleaned && this.logger) this.logger.warn('issue temp 파일 정리', { count: cleaned });
    this.cache.clear();
    this.corrupted.clear();
    const maxByPrefix = { DEF: 0, IMP: 0, INQ: 0 };
    for (const f of fs.readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      const id = f.slice(0, -5);
      const parsed = parseIssueId(id);
      if (!parsed) continue;
      const file = path.join(this.dir, f);
      try {
        const issue = readJson(file);
        if (!issue || issue.id !== id || typeof issue.revision !== 'number') {
          throw new Error('필수 필드 누락(id/revision)');
        }
        this.cache.set(id, issue);
        if (parsed.number > maxByPrefix[parsed.prefix]) maxByPrefix[parsed.prefix] = parsed.number;
      } catch (err) {
        this.corrupted.set(id, err.message);
        if (this.logger) this.logger.error('Issue 파일 손상 감지 - 해당 Issue 쓰기 차단', { id, file, reason: err.message });
        if (parsed.number > maxByPrefix[parsed.prefix]) maxByPrefix[parsed.prefix] = parsed.number;
      }
    }
    return { count: this.cache.size, corrupted: [...this.corrupted.keys()], maxByPrefix };
  }

  filePath(id) {
    return path.join(this.dir, `${id}.json`);
  }

  exists(id) {
    return this.cache.has(id) || this.corrupted.has(id);
  }

  get(id) {
    const issue = this.cache.get(id);
    return issue ? JSON.parse(JSON.stringify(issue)) : null;
  }

  all() {
    return [...this.cache.values()];
  }

  count() {
    return this.cache.size;
  }

  /** Issue lock 하에서 mutator 실행. mutator는 새 Issue 객체를 반환해야 함 */
  async withLock(id, fn) {
    return this.mutex.withLock(`issue:${id}`, fn);
  }

  /** 반드시 withLock 내부에서 호출 */
  save(issue) {
    if (this.corrupted.has(issue.id)) {
      throw errors.storageWriteFailed(`Issue 파일이 손상되어 쓰기가 차단되었습니다: ${issue.id}. 관리자에게 복구를 요청하세요.`);
    }
    try {
      writeJsonAtomic(this.filePath(issue.id), issue);
    } catch (err) {
      if (this.logger) this.logger.error('Issue 저장 실패', { id: issue.id, reason: err.message });
      throw errors.storageWriteFailed();
    }
    this.cache.set(issue.id, JSON.parse(JSON.stringify(issue)));
  }

  corruptedList() {
    return [...this.corrupted.entries()].map(([id, reason]) => ({ id, reason }));
  }
}

module.exports = { IssueRepository };
