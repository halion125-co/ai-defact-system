'use strict';

const path = require('path');
const { readJson, writeJsonAtomic } = require('../utils/fsutil');
const { nowIso } = require('../utils/time');
const { padNumber } = require('../utils/id');

/**
 * users.json: { "seq": 12, "users": [ ... ] }
 */
class UserRepository {
  constructor({ dataDir, mutex }) {
    this.file = path.join(dataDir, 'users.json');
    this.mutex = mutex;
    this.state = null;
  }

  load() {
    const data = readJson(this.file);
    this.state = data || { seq: 0, users: [] };
    if (!Array.isArray(this.state.users)) throw new Error('users.json 형식 오류: users 배열 없음');
    if (!data) this._persist();
    return this.state;
  }

  _persist() {
    writeJsonAtomic(this.file, this.state);
  }

  all() {
    return this.state.users.map((u) => ({ ...u }));
  }

  findById(userId) {
    const u = this.state.users.find((x) => x.userId === userId);
    return u ? { ...u } : null;
  }

  findByEmployeeId(employeeId) {
    const key = String(employeeId).trim().toLowerCase();
    const u = this.state.users.find((x) => x.employeeId.toLowerCase() === key);
    return u ? { ...u } : null;
  }

  async create({ employeeId, name, team, isQualityAdmin = false }) {
    return this.mutex.withLock('users', async () => {
      if (this.findByEmployeeId(employeeId)) {
        const err = new Error('DUPLICATE_EMPLOYEE_ID');
        err.code = 'DUPLICATE_EMPLOYEE_ID';
        throw err;
      }
      const seq = (this.state.seq || 0) + 1;
      const now = nowIso();
      const user = {
        userId: `U-${padNumber(seq, 6)}`,
        employeeId: String(employeeId).trim(),
        name,
        team,
        isQualityAdmin: !!isQualityAdmin,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      const next = { seq, users: [...this.state.users, user] };
      writeJsonAtomic(this.file, next);
      this.state = next;
      return { ...user };
    });
  }

  async update(userId, changes) {
    return this.mutex.withLock('users', async () => {
      const idx = this.state.users.findIndex((x) => x.userId === userId);
      if (idx < 0) return null;
      const updated = { ...this.state.users[idx], ...changes, updatedAt: nowIso() };
      const users = this.state.users.slice();
      users[idx] = updated;
      const next = { ...this.state, users };
      writeJsonAtomic(this.file, next);
      this.state = next;
      return { ...updated };
    });
  }
}

module.exports = { UserRepository };
